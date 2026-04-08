const { onCall, HttpsError } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");
const { z } = require("zod");

admin.initializeApp();

// Configuração padrão para todas as funções - permite acesso público
const defaultFunctionOptions = {
  cors: true,
  invoker: "public", // Permite invocação sem autenticação no Cloud Run
};

// Helper: Obter instância da IA (Lazy Initialization)
let genAIInstance;
let genAIImageInstance;

function getApiKey() {
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    try {
      const config = functions.config();
      apiKey = config.gemini?.api_key;
      if (apiKey) console.log("✅ API key carregada do Firebase Runtime Config");
    } catch (e) {
      console.warn("Não foi possível acessar firebase-functions.config():", e.message);
    }
  }
  if (!apiKey) {
    console.error("❌ CRÍTICO: GEMINI_API_KEY não encontrada!");
    throw new HttpsError("failed-precondition", "Configuração de API ausente no servidor");
  }
  return apiKey;
}

function getGenAI() {
  if (!genAIInstance) {
    genAIInstance = new GoogleGenerativeAI(getApiKey());
    console.log("✅ Instância de IA inicializada com sucesso");
  }
  return genAIInstance;
}

function getGenAIImage() {
  if (!genAIImageInstance) {
    genAIImageInstance = new GoogleGenerativeAI(getApiKey());
  }
  return genAIImageInstance;
}

// =====================================================
// SCHEMAS DE VALIDAÇÃO (ZOD)
// =====================================================

const getBibleContentSchema = z.object({
  book: z.string().min(1),
  chapter: z.number().int().positive(),
  translation: z.string().default("NVI"),
  lang: z.enum(["pt", "en", "es"]).default("pt")
});

const generateStoryboardSchema = z.object({
  book: z.string().min(1),
  chapter: z.number().int().positive(),
  text: z.string().min(10),
  age: z.number().nullable().optional(),
  lang: z.enum(["pt", "en", "es"]).default("pt")
});

const findLocationsSchema = z.object({
  book: z.string().min(1),
  chapter: z.number().int().positive(),
  text: z.string().min(10),
  age: z.number().nullable().optional(),
  lang: z.enum(["pt", "en", "es"]).default("pt")
});

const analysisSchema = z.object({
  book: z.string().nullable().optional(),
  chapter: z.number().nullable().optional(),
  context: z.string().min(10),
  referenceTitle: z.string().nullable().optional(),
  lang: z.enum(["pt", "en", "es"]).default("pt"),
  age: z.number().nullable().optional()
});

const libraryAgentSchema = z.object({
  query: z.string().min(3),
  resources: z.array(z.object({
    title: z.string(),
    textContent: z.string().nullable().optional()
  })),
  lang: z.enum(["pt", "en", "es"]).default("pt")
});

const devotionalSchema = z.object({
  topic: z.string().min(1),
  age: z.number().nullable().optional(),
  lang: z.enum(["pt", "en", "es"]).default("pt")
});

const dailyDevotionalSchema = z.object({
  lang: z.enum(["pt", "en", "es"]).default("pt")
});

const studyGuideSchema = z.object({
  theme: z.string().min(1),
  context: z.string().min(10),
  age: z.number().nullable().optional(),
  lang: z.enum(["pt", "en", "es"]).default("pt")
});

const thematicStudySchema = z.object({
  topic: z.string().min(1),
  age: z.number().nullable().optional(),
  lang: z.enum(["pt", "en", "es"]).default("pt")
});

const audioTranslateSchema = z.object({
  text: z.string().min(1),
  targetLang: z.enum(["pt", "en", "es"])
});

const wordDefinitionSchema = z.object({
  original: z.string().min(1),
  strong: z.string().nullable().optional(),
  context: z.string().min(1),
  lang: z.enum(["pt", "en", "es"]).default("pt")
});

const keywordAnalysisSchema = z.object({
  reference: z.string().min(1),
  verseText: z.string().min(1),
  lang: z.enum(["pt", "en", "es"]).default("pt")
});

const interlinearSchema = z.object({
  book: z.string().min(1),
  chapter: z.number().int().positive(),
  startVerse: z.number().int().positive(),
  endVerse: z.number().int().positive(),
  lang: z.enum(["pt", "en", "es"]).default("pt")
});

const bibleSearchSchema = z.object({
  query: z.string().min(2),
  lang: z.enum(["pt", "en", "es"]).default("pt")
});

// Helper: Get Age Context
const getAgeContext = (age, lang) => {
  if (!age) return "";
  const yearsOld = lang === 'pt' ? 'anos' : lang === 'es' ? 'años' : 'years old';
  const childContext = lang === 'pt' ? 'uma criança de' : lang === 'es' ? 'un niño de' : 'a child of';
  const teenContext = lang === 'pt' ? 'um adolescente de' : lang === 'es' ? 'un adolescente de' : 'a teenager of';
  const adultContext = lang === 'pt' ? 'um adulto de' : lang === 'es' ? 'un adulto de' : 'an adult of';

  let targetAudience = adultContext;
  if (age < 12) targetAudience = childContext;
  else if (age < 18) targetAudience = teenContext;

  return `\n\nTARGET AUDIENCE: Adapt the language, tone, and depth for ${targetAudience} ${age} ${yearsOld}. IMPORTANT: Do NOT mention the target audience, age, or adaptation in the response. Just adapt naturally.`;
};

// ...

// Helper: Get Language Name
const getLangName = (lang) => lang === 'en' ? 'ENGLISH' : lang === 'es' ? 'SPANISH' : 'PORTUGUESE';

// Helper: Wrapper para retry com backoff exponencial
async function retryWrapper(fn, retries = 3, delay = 2000) {
  try {
    return await fn();
  } catch (error) {
    const isRetryableError =
      error?.message?.includes("429") ||
      error?.message?.includes("503") ||
      error?.message?.includes("quota") ||
      error?.message?.includes("RESOURCE_EXHAUSTED") ||
      error?.message?.includes("Service Unavailable") ||
      error?.status === 429 ||
      error?.status === 503;

    if (isRetryableError && retries > 0) {
      console.warn(`⚠️ Retryable error hit. Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      return retryWrapper(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Helper: Verificar autenticação (OPCIONAL - visitantes permitidos)
// A autenticação é opcional pois as funções têm invoker: "public"
// Usuários autenticados terão request.auth disponível para logging/tracking
function getAuthInfo(request) {
  return request.auth ? request.auth.uid : 'guest';
}

// Helper: Salvar uso de tokens no Firestore (async, fire-and-forget)
async function saveTokenUsage(functionName, usage, uid, model) {
  if (!usage) return;
  // Preços por 1M tokens (referência: abril/2026, USD)
  const PRICING = {
    'gemini-2.5-flash-lite': { input: 0.075, output: 0.30 },
    'gemini-2.5-flash':      { input: 0.15,  output: 0.60 },
    'gemini-2.5-flash-image':          { input: 0.039, output: 0.039 },
    'gemini-3.1-flash-image-preview':  { input: 0.039, output: 0.039 },
  };
  const price = PRICING[model] || PRICING['gemini-2.5-flash-lite'];
  const estimatedCostUSD =
    ((usage.promptTokenCount || 0) / 1_000_000) * price.input +
    ((usage.candidatesTokenCount || 0) / 1_000_000) * price.output;

  const now = new Date();
  const date = now.toISOString().split('T')[0];

  await admin.firestore().collection('token_usage').add({
    uid: uid || 'guest',
    functionName,
    model: model || 'gemini-2.5-flash-lite',
    promptTokens: usage.promptTokenCount || 0,
    responseTokens: usage.candidatesTokenCount || 0,
    totalTokens: usage.totalTokenCount || 0,
    estimatedCostUSD,
    date,
    month: date.substring(0, 7),
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Helper: Logging de consumo de tokens
function logTokenUsage(functionName, result, uid, model) {
  const usage = result.response.usageMetadata;
  if (usage) {
    console.log(`📊 [${functionName}] Tokens: { prompt: ${usage.promptTokenCount}, response: ${usage.candidatesTokenCount}, total: ${usage.totalTokenCount} }`);
    saveTokenUsage(functionName, usage, uid, model || 'gemini-2.5-flash-lite')
      .catch(e => console.error('❌ Falha ao salvar token_usage:', e.message));
  }
}

// Helper: Extrair JSON robusto da resposta
function extractJson(text) {
  try {
    // Encontrar os índices do primeiro '{' e '['
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');

    let match;
    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      // Começa com array ou o array vem antes do primeiro objeto
      match = text.match(/\[[\s\S]*\]/);
    } else {
      // Começa com objeto
      match = text.match(/\{[\s\S]*\}/);
    }

    if (!match) {
      console.error("❌ Falha ao encontrar JSON na resposta. Texto bruto:", text);
      return null;
    }
    return JSON.parse(match[0]);
  } catch (e) {
    console.error("❌ Erro ao parsear JSON:", e.message, "\nTexto que falhou:", text);
    return null;
  }
}

// Helper: Validar schema e retornar data limpa
function validateSchema(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(", ");
    console.error("❌ Erro de validação Zod:", errors);
    throw new HttpsError("invalid-argument", `Dados inválidos: ${errors}`);
  }
  return result.data;
}

// =====================================================
// FUNCTIONS
// =====================================================

// 1. getBibleContent
exports.getBibleContent = onCall(defaultFunctionOptions, async (request) => {
  const { book, chapter, translation, lang } = validateSchema(getBibleContentSchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    // --- Cache Firestore: evita chamar Gemini para conteúdo já gerado ---
    const db = admin.firestore();
    const cacheKey = `${book}_${chapter}_${translation}_${lang}`.replace(/\s+/g, '_').toLowerCase();
    const cacheRef = db.collection('bible_cache').doc(cacheKey);
    const cachedDoc = await cacheRef.get();

    if (cachedDoc.exists) {
      console.log(`✅ [getBibleContent] Cache hit: ${book} ${chapter} (${translation})`);
      const data = cachedDoc.data();
      return { success: true, text: data.text, book, chapter, translation, fromCache: true };
    }

    console.log(`🔄 [getBibleContent] Cache miss: gerando ${book} ${chapter} (${translation}) via Gemini`);

    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({
        model: "gemini-2.5-flash-lite",
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ]
      });

      // Usar traduções de domínio público para evitar RECITATION
      const publicDomainTranslations = ['KJV', 'ASV', 'WEB', 'YLT', 'DBY'];
      const isPublicDomain = publicDomainTranslations.includes(translation.toUpperCase());

      let prompt;
      const isStrongTranslation = translation.toLowerCase().includes('strong');

      if (isStrongTranslation) {
        // Formato especial para Almeida com Strong - inclui códigos Strong em cada palavra
        prompt = `Generate the biblical text of ${book} chapter ${chapter} in Portuguese (Almeida style) WITH Strong's numbers.

CRITICAL FORMAT REQUIREMENTS:
1. EVERY significant word (nouns, verbs, adjectives, adverbs) MUST have its Strong's code immediately after it
2. Format: Word<H####> for Hebrew (Old Testament) or Word<G####> for Greek (New Testament)
3. NO spaces between the word and the angle bracket
4. Articles, prepositions, and conjunctions don't need Strong codes

EXAMPLE OUTPUT FORMAT:
**1** No<H871> princípio<H7225> criou<H1254> Deus<H430> os céus<H8064> e a terra<H776>.
**2** E a terra<H776> era<H1961> sem forma<H8414> e vazia<H922>...

RULES:
- Start directly with verse 1 (no introduction)
- Each verse on its own line
- Verse number in **bold** format: **1**, **2**, etc.
- Use accurate Strong's Hebrew (H) or Greek (G) numbers
- DO NOT include phrases like "Here is..." or "Sure!"

Generate ${book} chapter ${chapter} now:`;
      } else if (isPublicDomain) {
        prompt = `Provide ONLY the biblical text of ${book} chapter ${chapter} from the ${translation} translation.
Format: Start directly with verse 1. Each verse on its own line with the verse number.
After relevant verses, include cross-references in this format: (Book X:Y; Book Z:W)
DO NOT include any introduction, commentary, or phrases like "Here is..." or "Sure!".
Output ONLY the verses in ${getLangName(lang)} if different from the original.`;
      } else {
        // Para traduções modernas, solicitar resumo/paráfrase para evitar copyright
        prompt = `Provide ONLY the biblical text of ${book} chapter ${chapter} in the style of the ${translation} translation.
Format:
- Start directly with verse 1
- Each verse numbered on its own line with **bold** verse numbers like **1**, **2**, etc.
- After relevant verses that have parallel passages, include cross-references in this format on the next line: (Book X:Y; Book Z:W)

Example:
**1** No princípio, Deus criou os céus e a terra.
(João 1:1-3; Salmos 33:6)
**2** A terra era sem forma e vazia...

DO NOT include any introduction, commentary, or phrases like "Here is..." or "Sure!".
Output ONLY the verses in ${getLangName(lang)}.`;
      }

      const result = await model.generateContent(prompt);
      logTokenUsage('getBibleContent', result, uid);

      // Verificar se houve bloqueio
      if (result.response.promptFeedback?.blockReason) {
        console.warn("⚠️ Prompt bloqueado:", result.response.promptFeedback.blockReason);
        throw new Error(`Conteúdo bloqueado: ${result.response.promptFeedback.blockReason}`);
      }

      const text = result.response.text();
      if (!text) throw new Error("IA retornou resposta vazia");

      // Salvar no cache Firestore para próximas requisições
      await cacheRef.set({
        text,
        book,
        chapter,
        translation,
        lang,
        cachedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, text, book, chapter, translation };
    });
  } catch (e) {
    console.error("Error in getBibleContent:", e);

    // Tratamento específico para RECITATION
    if (e.message?.includes('RECITATION')) {
      throw new HttpsError("failed-precondition",
        "Não foi possível obter esta tradução específica. Tente uma tradução de domínio público como KJV ou ASV.");
    }

    throw new HttpsError("internal", e.message);
  }
});

// 2. generateStoryboard
exports.generateStoryboard = onCall(defaultFunctionOptions, async (request) => {
  const { book, chapter, text, lang } = validateSchema(generateStoryboardSchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Crie um storyboard com 3-5 cenas para ${book} ${chapter}. Texto: ${text}. Retorne JSON { "scenes": [{ "title": "...", "description": "...", "verses": [] }] }. Responda em ${getLangName(lang)}.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('generateStoryboard', result, uid);
      const jsonData = extractJson(result.response.text());
      if (!jsonData) throw new Error("Falha ao gerar formato JSON válido para Storyboard");
      return { success: true, ...jsonData };
    });
  } catch (e) {
    console.error("Error in generateStoryboard:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 3. findBiblicalLocations
exports.findBiblicalLocations = onCall(defaultFunctionOptions, async (request) => {
  const { book, chapter, text, lang } = validateSchema(findLocationsSchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Identifique locais em ${book} ${chapter}. Texto: ${text}. Retorne JSON { "locations": [{ "name": "...", "lat": 0, "lng": 0, "verses": [], "description": "..." }] }. Responda em ${getLangName(lang)}.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('findBiblicalLocations', result, uid);
      const jsonData = extractJson(result.response.text());
      if (!jsonData) throw new Error("Falha ao gerar formato JSON válido para Localizações");
      return { success: true, ...jsonData };
    });
  } catch (e) {
    console.error("Error in findBiblicalLocations:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 4. generateTheologyAnalysisV3 (Renamed to fix permissions - Attempt 3)
exports.generateTheologyAnalysisV3 = onCall(defaultFunctionOptions, async (request) => {
  console.log("🚀 generateTheologyAnalysisV3 invoked", { auth: request.auth?.uid, data: request.data });
  const { book, chapter, context, lang, age } = validateSchema(analysisSchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const agePrompt = getAgeContext(age, lang);
      const prompt = `Analise teológica sistemática de ${book} ${chapter}. Estilo: Wayne Grudem. Idioma: ${getLangName(lang)}. Contexto: ${context}${agePrompt}\n\nIMPORTANT: Start directly with the content. Do NOT include greetings, introductions like "Com certeza!" or "Aqui está", or any preamble.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('generateTheologyAnalysisV3', result, uid);
      return { success: true, text: result.response.text() };
    });
  } catch (e) {
    console.error("Error in generateTheologyAnalysisV3:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 5. generateExegesisAnalysisV3 (Renamed to fix permissions - Attempt 3)
exports.generateExegesisAnalysisV3 = onCall(defaultFunctionOptions, async (request) => {
  console.log("🚀 generateExegesisAnalysisV3 invoked", { auth: request.auth?.uid, data: request.data });
  const { referenceTitle, context, lang, age } = validateSchema(analysisSchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const agePrompt = getAgeContext(age, lang);
      const prompt = `Exegese e Homilética de: ${referenceTitle}. Idioma: ${getLangName(lang)}. Contexto: ${context}${agePrompt}\n\nIMPORTANT: Start directly with the content. Do NOT include greetings, introductions like "Com certeza!" or "Aqui está", or any preamble.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('generateExegesisAnalysisV3', result, uid);
      return { success: true, text: result.response.text() };
    });
  } catch (e) {
    console.error("Error in generateExegesisAnalysisV3:", e);
    throw new HttpsError("internal", e.message);
  }
});

// ...

// 9. generateStudyGuideV2 (Renamed to clear 500 error cache)
exports.generateStudyGuideV2 = onCall(defaultFunctionOptions, async (request) => {
  const { theme, context, lang, age } = validateSchema(studyGuideSchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const agePrompt = getAgeContext(age, lang);
      const prompt = `Guia de estudo bíblico sobre "${theme}" em ${getLangName(lang)}. Contexto: ${context}${agePrompt}\n\nIMPORTANT: Start directly with the content. Do NOT include greetings, introductions like "Com certeza!" or "Aqui está", or any preamble.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('generateStudyGuideV2', result, uid);
      return { success: true, text: result.response.text() };
    });
  } catch (e) {
    console.error("Error in generateStudyGuideV2:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 9. generateThematicStudy
exports.generateThematicStudy = onCall(defaultFunctionOptions, async (request) => {
  const { topic, lang } = validateSchema(thematicStudySchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Plano de estudo temático sobre "${topic}" em ${getLangName(lang)}.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('generateThematicStudy', result, uid);
      return { success: true, text: result.response.text() };
    });
  } catch (e) {
    console.error("Error in generateThematicStudy:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 10. translateForAudio
exports.translateForAudio = onCall(defaultFunctionOptions, async (request) => {
  const { text, targetLang } = validateSchema(audioTranslateSchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Traduza para ${getLangName(targetLang)} para síntese de voz: "${text}". Apenas o texto traduzido.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('translateForAudio', result, uid);
      return { success: true, text: result.response.text() };
    });
  } catch (e) {
    console.error("Error in translateForAudio:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 8. getDailyDevotional - Devocional do dia com cache
exports.getDailyDevotional = onCall(defaultFunctionOptions, async (request) => {
  console.log("🚀 getDailyDevotional invoked", { auth: request.auth?.uid });
  console.log("📥 Chamada getDailyDevotional recebida:", JSON.stringify(request.data));
  const { lang } = validateSchema(dailyDevotionalSchema, request.data);
  const uid = request.auth?.uid || 'guest';

  try {
    // 1. Verificar cache
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const cacheId = `${today}_${lang}`;
    const cacheRef = admin.firestore().collection('daily_devotionals').doc(cacheId);

    const cached = await cacheRef.get();
    if (cached.exists) {
      const data = cached.data();
      if (data.expiresAt.toDate() > new Date()) {
        console.log("✅ Cache hit para devocional do dia:", cacheId);
        return { success: true, ...data.content };
      }
    }

    // 2. Gerar novo devocional
    const topics = {
      pt: ["Esperança em tempos difíceis", "Gratidão nas pequenas coisas", "Fé e perseverança", "Amor ao próximo", "Sabedoria divina", "Paz interior", "Propósito de vida"],
      en: ["Hope in difficult times", "Gratitude in small things", "Faith and perseverance", "Love for neighbor", "Divine wisdom", "Inner peace", "Life purpose"],
      es: ["Esperanza en tiempos difíciles", "Gratitud en las pequeñas cosas", "Fe y perseverancia", "Amor al prójimo", "Sabiduría divina", "Paz interior", "Propósito de vida"]
    };

    // Escolher tópico baseado no dia do ano (determinístico)
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const topicList = topics[lang] || topics.pt;
    const selectedTopic = topicList[dayOfYear % topicList.length];

    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Crie um devocional diário inspirador sobre "${selectedTopic}" em ${getLangName(lang)}. Retorne JSON { "title": "...", "scriptureReference": "...", "scriptureText": "...", "reflection": "...", "prayer": "...", "finalQuote": "..." }.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('getDailyDevotional', result, uid);
      const jsonData = extractJson(result.response.text());

      if (!jsonData) throw new Error("Falha ao gerar formato JSON válido para Devocional do Dia");

      // 3. Salvar cache
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0); // Próxima meia-noite

      await cacheRef.set({
        content: jsonData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(midnight),
        lang,
        topic: selectedTopic
      });

      console.log("✅ Devocional do dia gerado e cacheado:", cacheId);
      return { success: true, ...jsonData };
    });
  } catch (e) {
    console.error("Error in getDailyDevotional:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 11. getWordDefinition
exports.getWordDefinition = onCall(defaultFunctionOptions, async (request) => {
  const { original, strong, context, lang } = validateSchema(wordDefinitionSchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Definição profunda de "${original}" (Strong: ${strong || 'N/A'}). Contexto: ${context}. Idioma: ${getLangName(lang)}. Retorne JSON { "original": "...", "transliteration": "...", "strong": "...", "root": "...", "morphology": "...", "definition": "...", "practicalDefinition": "...", "biblicalUsage": [], "theologicalSignificance": "..." }.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('getWordDefinition', result, uid);
      const jsonData = extractJson(result.response.text());
      if (!jsonData) throw new Error("Falha ao gerar formato JSON válido para Definição");
      return { success: true, ...jsonData };
    });
  } catch (e) {
    console.error("Error in getWordDefinition:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 12. analyzeKeywordsInVerse
exports.analyzeKeywordsInVerse = onCall(defaultFunctionOptions, async (request) => {
  const { reference, verseText, lang } = validateSchema(keywordAnalysisSchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Analise palavras-chave em: "${reference}: ${verseText}" em ${getLangName(lang)}. Retorne JSON array de [{ "word": "...", "original": "...", "transliteration": "...", "strongNumber": "...", "definition": "...", "language": "Hebrew"|"Greek" }].`;
      const result = await model.generateContent(prompt);
      logTokenUsage('analyzeKeywordsInVerse', result, uid);
      const jsonData = extractJson(result.response.text());
      if (!jsonData) throw new Error("Falha ao gerar formato JSON válido para Palavras-chave");
      return { success: true, keywords: jsonData };
    });
  } catch (e) {
    console.error("Error in analyzeKeywordsInVerse:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 13. generateInterlinearChapter
exports.generateInterlinearChapter = onCall(defaultFunctionOptions, async (request) => {
  const { book, chapter, startVerse, endVerse, lang } = validateSchema(interlinearSchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Generate a WORD-BY-WORD interlinear analysis of ${book} ${chapter}:${startVerse}-${endVerse}.

CRITICAL: Break down EACH INDIVIDUAL WORD from the original Hebrew/Greek text. Do NOT group words into phrases.

Return a JSON array with this exact structure:
[
  {
    "verseNumber": 1,
    "language": "Hebrew" or "Greek",
    "words": [
      { "original": "בְּרֵאשִׁית", "transliteration": "bereshit", "portuguese": "No princípio", "strong": "H7225" },
      { "original": "בָּרָא", "transliteration": "bara", "portuguese": "criou", "strong": "H1254" },
      ... (continue for EACH word)
    ]
  }
]

Requirements:
- Each "words" array must contain EVERY SINGLE WORD from the verse
- "original" = the Hebrew/Greek word in original script
- "transliteration" = pronunciation in Latin characters
- "portuguese" = translation in ${getLangName(lang)}
- "strong" = Strong's number (H for Hebrew, G for Greek)

Return ONLY the JSON array, no additional text.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('generateInterlinearChapter', result, uid);
      const jsonData = extractJson(result.response.text());
      if (!jsonData) throw new Error("Falha ao gerar formato JSON válido para Interlinear");
      return { success: true, verses: jsonData };
    });
  } catch (e) {
    console.error("Error in generateInterlinearChapter:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 14. searchBibleReferences
exports.searchBibleReferences = onCall(defaultFunctionOptions, async (request) => {
  const { query, lang } = validateSchema(bibleSearchSchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Busca bíblica por "${query}" em ${getLangName(lang)}. Retorne JSON array de [{ "reference": "...", "text": "...", "book": "...", "chapter": 0 }]. Máximo 5 resultados.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('searchBibleReferences', result, uid);
      const jsonData = extractJson(result.response.text());
      if (!jsonData) throw new Error("Falha ao gerar formato JSON válido para Busca");
      return { success: true, results: jsonData };
    });
  } catch (e) {
    console.error("Error in searchBibleReferences:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 15. generateImage — gemini-2.5-flash-image (substituto do deprecated gemini-2.0-flash-preview-image-generation)
exports.generateImage = onCall(defaultFunctionOptions, async (request) => {
  const { prompt, modelType = 'standard' } = request.data;
  if (!prompt) throw new HttpsError("invalid-argument", "Prompt é obrigatório");
  const uid = request.auth?.uid || 'guest';

  const MODEL_NAME = modelType === '4k' ? 'gemini-3.1-flash-image-preview' : 'gemini-2.5-flash-image';

  try {
    return await retryWrapper(async () => {
      const apiKey = getApiKey();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini Image API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      let base64 = "";
      const parts = data?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) { base64 = part.inlineData.data; break; }
      }

      if (!base64) {
        console.warn("generateImage: nenhuma imagem retornada. Resposta:", JSON.stringify(data).substring(0, 500));
        throw new Error("A API não retornou nenhuma imagem.");
      }

      const usage = data?.usageMetadata;
      if (usage) {
        logTokenUsage('generateImage', { response: { usageMetadata: usage } }, uid, MODEL_NAME);
      }

      return { success: true, image: base64 };
    });
  } catch (e) {
    console.error("generateImage error:", e.message);
    throw new HttpsError("internal", e.message);
  }
});

// 16. generateCustomMapAnalysis
exports.generateCustomMapAnalysis = onCall(defaultFunctionOptions, async (request) => {
  const { topic, lang } = request.data;
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Atue como cartógrafo bíblico. Tópico: "${topic}". Identifique locais. Retorne JSON { "locations": [{ "biblicalName": "...", "modernName": "...", "description": "..." }], "regionDescription": "..." }. Idioma: ${getLangName(lang)}.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('generateCustomMapAnalysis', result, uid);
      const jsonData = extractJson(result.response.text());
      if (!jsonData) throw new Error("Falha ao gerar formato JSON válido para Análise de Mapa");
      return { success: true, ...jsonData };
    });
  } catch (e) {
    console.error("Error in generateCustomMapAnalysis:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 19. generateDailyDevotional (devocional personalizado por tópico)
exports.generateDailyDevotional = onCall(defaultFunctionOptions, async (request) => {
  const { topic, age, lang } = validateSchema(devotionalSchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const agePrompt = getAgeContext(age, lang);
      const prompt = `Crie um devocional inspirador sobre "${topic}" em ${getLangName(lang)}.${agePrompt} Retorne JSON { "title": "...", "scriptureReference": "...", "scriptureText": "...", "reflection": "...", "prayer": "...", "finalQuote": "..." }.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('generateDailyDevotional', result, uid);
      const jsonData = extractJson(result.response.text());
      if (!jsonData) throw new Error("Falha ao gerar formato JSON válido para Devocional");
      return { success: true, ...jsonData };
    });
  } catch (e) {
    console.error("Error in generateDailyDevotional:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 20. askLibraryAgent (agente de biblioteca bíblica)
exports.askLibraryAgent = onCall(defaultFunctionOptions, async (request) => {
  const { query, resources, lang } = validateSchema(libraryAgentSchema, request.data);
  const uid = request.auth?.uid || 'guest';
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const resourceContext = resources.map(r => `"${r.title}": ${r.textContent || 'Sem conteúdo'}`).join('\n');
      const prompt = `Você é um agente de biblioteca bíblica. Responda a pergunta "${query}" usando os seguintes recursos como referência:\n${resourceContext}\n\nResponda em ${getLangName(lang)}.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('askLibraryAgent', result, uid);
      return { success: true, text: result.response.text() };
    });
  } catch (e) {
    console.error("Error in askLibraryAgent:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 21. ping (diagnóstico - sem chamada ao Gemini)
exports.ping = onCall(defaultFunctionOptions, async (request) => {
  const timestamp = new Date().toISOString();
  const authInfo = getAuthInfo(request);
  console.log(`PING from ${authInfo} at ${timestamp}`);
  return {
    success: true,
    message: "EDEN Cloud Functions are operational",
    timestamp,
    user: authInfo,
    nodeVersion: process.version
  };
});

// 22. getTokenUsageStats (apenas admin)
exports.getTokenUsageStats = onCall(defaultFunctionOptions, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Autenticação obrigatória');
  }

  // Verificar se é admin
  const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists || userDoc.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas admins podem acessar estatísticas de tokens');
  }

  try {
    const { period = 'month', value } = request.data || {};
    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    const currentDate = now.toISOString().split('T')[0];

    const db = admin.firestore();
    let query = db.collection('token_usage');
    const targetValue = value || (period === 'day' ? currentDate : currentMonth);

    // Sem orderBy para evitar índice composto — agregação não precisa de ordem
    if (period === 'day') {
      query = query.where('date', '==', targetValue);
    } else if (period === 'month') {
      query = query.where('month', '==', targetValue);
    }

    const snapshot = await query.limit(5000).get();

    const stats = {
      period,
      value: targetValue,
      totalTokens: 0,
      totalCostUSD: 0,
      byFunction: {},
      byUser: {},
      byDay: {},
      callCount: snapshot.size,
    };

    snapshot.forEach(doc => {
      const d = doc.data();
      stats.totalTokens += d.totalTokens || 0;
      stats.totalCostUSD += d.estimatedCostUSD || 0;

      if (!stats.byFunction[d.functionName]) {
        stats.byFunction[d.functionName] = { tokens: 0, costUSD: 0, calls: 0 };
      }
      stats.byFunction[d.functionName].tokens += d.totalTokens || 0;
      stats.byFunction[d.functionName].costUSD += d.estimatedCostUSD || 0;
      stats.byFunction[d.functionName].calls++;

      if (!stats.byUser[d.uid]) {
        stats.byUser[d.uid] = { tokens: 0, costUSD: 0, calls: 0 };
      }
      stats.byUser[d.uid].tokens += d.totalTokens || 0;
      stats.byUser[d.uid].costUSD += d.estimatedCostUSD || 0;
      stats.byUser[d.uid].calls++;

      if (!stats.byDay[d.date]) {
        stats.byDay[d.date] = { tokens: 0, costUSD: 0, calls: 0 };
      }
      stats.byDay[d.date].tokens += d.totalTokens || 0;
      stats.byDay[d.date].costUSD += d.estimatedCostUSD || 0;
      stats.byDay[d.date].calls++;
    });

    stats.totalCostUSD = Math.round(stats.totalCostUSD * 1_000_000) / 1_000_000;

    return { success: true, ...stats };
  } catch (e) {
    console.error('Error in getTokenUsageStats:', e);
    throw new HttpsError('internal', e.message);
  }
});

exports.initialized = true;

// 17. cleanOldCache (Manutenção - limpar caches sem expiresAt)
exports.cleanOldCache = onCall(defaultFunctionOptions, async (request) => {

  const db = admin.firestore();

  try {
    const snapshot = await db.collection('bible_cache').get();

    let deletedCount = 0;
    let keptCount = 0;
    const batch = db.batch();

    snapshot.forEach((doc) => {
      const data = doc.data();

      if (!data.expiresAt) {
        batch.delete(doc.ref);
        deletedCount++;
      } else {
        keptCount++;
      }
    });

    if (deletedCount > 0) {
      await batch.commit();
    }

    return {
      success: true,
      deleted: deletedCount,
      kept: keptCount,
      message: `Limpeza concluída: ${deletedCount} caches antigos deletados, ${keptCount} mantidos`
    };

  } catch (error) {
    console.error('Erro ao limpar cache:', error);
    throw new HttpsError('internal', error.message);
  }
});

// 18. clearStrongCache (Limpar caches de Almeida com Strong para forçar regeneração)
exports.clearStrongCache = onCall(defaultFunctionOptions, async (request) => {
  const db = admin.firestore();

  try {
    const snapshot = await db.collection('bible_cache')
      .where('translation', '==', 'Almeida com Strong')
      .get();

    let deletedCount = 0;
    const batch = db.batch();

    snapshot.forEach((doc) => {
      batch.delete(doc.ref);
      deletedCount++;
    });

    if (deletedCount > 0) {
      await batch.commit();
    }

    return {
      success: true,
      deleted: deletedCount,
      message: `Cache Strong limpo: ${deletedCount} entradas deletadas`
    };

  } catch (error) {
    console.error('Erro ao limpar cache Strong:', error);
    throw new HttpsError('internal', error.message);
  }
});
