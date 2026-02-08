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
function getGenAI() {
  if (!genAIInstance) {
    // Tentar obter da variável de ambiente primeiro, depois da configuração do Firebase
    let apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      try {
        // Fallback para Firebase Runtime Config
        const config = functions.config();
        apiKey = config.gemini?.api_key;
        if (apiKey) {
          console.log("✅ API key carregada do Firebase Runtime Config");
        }
      } catch (e) {
        console.warn("Não foi possível acessar firebase-functions.config():", e.message);
      }
    }

    if (!apiKey) {
      console.error("❌ CRÍTICO: GEMINI_API_KEY não encontrada!");
      console.error("Procurado em: process.env.GEMINI_API_KEY ou functions.config().gemini.api_key");
      throw new HttpsError("failed-precondition", "Configuração de API ausente no servidor");
    }
    genAIInstance = new GoogleGenerativeAI(apiKey);
    console.log("✅ Instância de IA inicializada com sucesso");
  }
  return genAIInstance;
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

// ... (other schemas)

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

  return `\n\nTARGET AUDIENCE: Adapt the language, tone, and depth for ${targetAudience} ${age} ${yearsOld}.`;
};

// ...

// 4. generateTheologyAnalysis
exports.generateTheologyAnalysis = onCall(defaultFunctionOptions, async (request) => {
  const { book, chapter, context, lang, age } = validateSchema(analysisSchema, request.data);
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const agePrompt = getAgeContext(age, lang);
      const prompt = `Analise teológica sistemática de ${book} ${chapter}. Estilo: Wayne Grudem. Idioma: ${getLangName(lang)}. Contexto: ${context}${agePrompt}`;
      const result = await model.generateContent(prompt);
      logTokenUsage('generateTheologyAnalysis', result);
      return { success: true, text: result.response.text() };
    });
  } catch (e) {
    console.error("Error in generateTheologyAnalysis:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 5. generateExegesisAnalysis
exports.generateExegesisAnalysis = onCall(defaultFunctionOptions, async (request) => {
  const { referenceTitle, context, lang, age } = validateSchema(analysisSchema, request.data);
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const agePrompt = getAgeContext(age, lang);
      const prompt = `Exegese e Homilética de: ${referenceTitle}. Idioma: ${getLangName(lang)}. Contexto: ${context}${agePrompt}`;
      const result = await model.generateContent(prompt);
      logTokenUsage('generateExegesisAnalysis', result);
      return { success: true, text: result.response.text() };
    });
  } catch (e) {
    console.error("Error in generateExegesisAnalysis:", e);
    throw new HttpsError("internal", e.message);
  }
});

// ...

// 9. generateStudyGuide
exports.generateStudyGuide = onCall(defaultFunctionOptions, async (request) => {
  const { theme, context, lang, age } = validateSchema(studyGuideSchema, request.data);
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const agePrompt = getAgeContext(age, lang);
      const prompt = `Guia de estudo bíblico sobre "${theme}" em ${getLangName(lang)}. Contexto: ${context}${agePrompt}`;
      const result = await model.generateContent(prompt);
      logTokenUsage('generateStudyGuide', result);
      return { success: true, text: result.response.text() };
    });
  } catch (e) {
    console.error("Error in generateStudyGuide:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 9. generateThematicStudy
exports.generateThematicStudy = onCall(defaultFunctionOptions, async (request) => {
  const { topic, lang } = validateSchema(thematicStudySchema, request.data);
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Plano de estudo temático sobre "${topic}" em ${getLangName(lang)}.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('generateThematicStudy', result);
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
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Traduza para ${getLangName(targetLang)} para síntese de voz: "${text}". Apenas o texto traduzido.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('translateForAudio', result);
      return { success: true, text: result.response.text() };
    });
  } catch (e) {
    console.error("Error in translateForAudio:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 11. getWordDefinition
exports.getWordDefinition = onCall(defaultFunctionOptions, async (request) => {
  const { original, strong, context, lang } = validateSchema(wordDefinitionSchema, request.data);
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Definição profunda de "${original}" (Strong: ${strong || 'N/A'}). Contexto: ${context}. Idioma: ${getLangName(lang)}. Retorne JSON { "original": "...", "transliteration": "...", "strong": "...", "root": "...", "morphology": "...", "definition": "...", "practicalDefinition": "...", "biblicalUsage": [], "theologicalSignificance": "..." }.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('getWordDefinition', result);
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
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Analise palavras-chave em: "${reference}: ${verseText}" em ${getLangName(lang)}. Retorne JSON array de [{ "word": "...", "original": "...", "transliteration": "...", "strongNumber": "...", "definition": "...", "language": "Hebrew"|"Greek" }].`;
      const result = await model.generateContent(prompt);
      logTokenUsage('analyzeKeywordsInVerse', result);
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
      logTokenUsage('generateInterlinearChapter', result);
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
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Busca bíblica por "${query}" em ${getLangName(lang)}. Retorne JSON array de [{ "reference": "...", "text": "...", "book": "...", "chapter": 0 }]. Máximo 5 resultados.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('searchBibleReferences', result);
      const jsonData = extractJson(result.response.text());
      if (!jsonData) throw new Error("Falha ao gerar formato JSON válido para Busca");
      return { success: true, results: jsonData };
    });
  } catch (e) {
    console.error("Error in searchBibleReferences:", e);
    throw new HttpsError("internal", e.message);
  }
});

// 15. generateImage (Auxiliary for all visuals)
exports.generateImage = onCall(defaultFunctionOptions, async (request) => {
  const { prompt, aspectRatio, modelType } = request.data;
  if (!prompt) throw new HttpsError("invalid-argument", "Prompt é obrigatório");

  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({
        model: modelType === '4k' ? "gemini-1.5-pro-001" : "gemini-2.5-flash-image"
      });

      const result = await model.generateContent(prompt);
      logTokenUsage('generateImage', result);

      let base64 = "";
      for (const part of result.response.candidates[0].content.parts) {
        if (part.inlineData) base64 = part.inlineData.data;
      }

      return { success: true, image: base64 };
    });
  } catch (e) { throw new HttpsError("internal", e.message); }
});

// 16. generateCustomMapAnalysis
exports.generateCustomMapAnalysis = onCall(defaultFunctionOptions, async (request) => {
  const { topic, lang } = request.data;
  try {
    return await retryWrapper(async () => {
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const prompt = `Atue como cartógrafo bíblico. Tópico: "${topic}". Identifique locais. Retorne JSON { "locations": [{ "biblicalName": "...", "modernName": "...", "description": "..." }], "regionDescription": "..." }. Idioma: ${getLangName(lang)}.`;
      const result = await model.generateContent(prompt);
      logTokenUsage('generateCustomMapAnalysis', result);
      const jsonData = extractJson(result.response.text());
      if (!jsonData) throw new Error("Falha ao gerar formato JSON válido para Análise de Mapa");
      return { success: true, ...jsonData };
    });
  } catch (e) {
    console.error("Error in generateCustomMapAnalysis:", e);
    throw new HttpsError("internal", e.message);
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
