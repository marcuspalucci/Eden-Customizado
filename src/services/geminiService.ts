import {
  LocationResult,
  Scene,
  SearchResult,
  WordAnalysis,
  InterlinearVerse,
  LexiconEntry,
  LibraryResource,
  Language,
  DevotionalContent
} from '../types';
import { db, functions } from './firebase';
import { logger } from '../utils/logger';
import { handleApiError } from '../utils/errorHandler';

// Session Cache (In-Memory)
const sessionCache = new Map<string, any>();

const getFromCache = (key: string) => sessionCache.get(key);
const setInCache = (key: string, value: any) => sessionCache.set(key, value);

// Helper: Backend Image Generation Wrapper
const generateImageBackend = async (prompt: string, aspectRatio: string = '16:9', modelType: string = 'standard'): Promise<string | null> => {
  try {
    const genImageFn = functions.httpsCallable('generateImage');
    const result = await genImageFn({ prompt, aspectRatio, modelType });
    const data = result.data as { success: boolean; image: string };
    return data.image ? `data:image/png;base64,${data.image}` : null;
  } catch (err) {
    logger.error('Backend Image Error:', err);
    return null;
  }
};

// getLanguageInstruction removido por não ser utilizado na UI atual (substituído por lógica inline)

// --- NEW: Translation Service for Audio ---
export const translateForAudio = async (text: string, targetLang: Language): Promise<string> => {
  if (!text) return '';
  try {
    const translateFn = functions.httpsCallable('translateForAudio');
    const result = await translateFn({ text, targetLang });
    const data = result.data as { success: boolean; text: string };
    return data.text || text;
  } catch (e) {
    logger.error('Translation error', e);
    return text;
  }
};

export const getBibleContent = async (
  book: string,
  chapter: number,
  translation: string,
  lang: Language = 'pt'
): Promise<string> => {
  // CRITICAL: Force version suffix (_v2) to invalidate old cache with wrong language
  const cacheKey = `bible_${translation}_${book}_${chapter}_${lang}_v2`;
  const memoryCached = getFromCache(cacheKey);
  if (memoryCached) return memoryCached;

  const cacheId = `${translation}_${book}_${chapter}_${lang}_v2`.replace(/\s+/g, '_').replace(/[/.]/g, '');
  const cacheRef = db.collection('bible_cache').doc(cacheId);

  try {
    const cacheSnap = await cacheRef.get();
    if (cacheSnap.exists) {
      const cachedData = cacheSnap.data();
      const expiresAt = cachedData?.expiresAt?.toDate();

      // Valida se o cache ainda é válido (30 dias)
      if (expiresAt && expiresAt > new Date()) {
        const text = cachedData?.text;
        setInCache(cacheKey, text);
        return text;
      } else {
        // Cache expirado, deleta
        await cacheRef.delete().catch(() => { });
      }
    }
  } catch (e) { logger.warn('Cache read error:', e); }

  try {
    const getBibleContentFn = functions.httpsCallable('getBibleContent');
    // HACK: Forçar contexto de idioma no nome do livro para evitar que a IA confunda "Josué" (PT) com "Josué" (ES)
    // Isso ajuda a desambiguar nomes que são iguais em ambos os idiomas.
    const contextBook = lang === 'pt' ? `${book} (Bíblia em Português)` : book;

    // HACK 2: Forçar contexto de idioma na tradução também
    // Se for PT e NVI, enviar "NVI (Edição Brasileira)" para garantir que o modelo não use NVI Español
    let contextTranslation = translation;
    if (lang === 'pt' && !translation.includes('Português') && !translation.includes('Brasileira')) {
      contextTranslation = `${translation} (Edição Brasileira - Bíblia em Português)`;
    }

    const result = await getBibleContentFn({ book: contextBook, chapter, translation: contextTranslation, lang });
    const data = result.data as { success: boolean; text: string };
    if (!data.success) throw new Error('Falha na geração do conteúdo bíblico');

    const text = data.text;
    setInCache(cacheKey, text);
    if (text && text.length > 50) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // Cache válido por 30 dias

      cacheRef.set({
        text,
        book,
        chapter,
        translation,
        lang,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt
      })
        .catch((err) => logger.error('Cache write error:', err));
    }
    return text;
  } catch (error) { throw handleApiError(error, 'getBibleContent'); }
};

export const generateStoryBoard = async (
  book: string,
  chapter: number,
  text: string,
  age?: number,
  lang: Language = 'pt'
): Promise<Scene[]> => {
  try {
    const generateStoryboardFn = functions.httpsCallable('generateStoryboard');
    const result = await generateStoryboardFn({ book, chapter, text, age, lang });
    const data = result.data as { success: boolean; scenes: any[] };
    if (!data.success) return [];

    const scenesData = data.scenes || [];
    const imagePromises = scenesData.map(async (sceneItem: any) => {
      const url = await generateImageBackend(sceneItem.description, '16:9');
      if (url) return { url, caption: sceneItem.title, prompt: sceneItem.description };
      return null;
    });

    const results = await Promise.all(imagePromises);
    return results.filter((s): s is Scene => s !== null);
  } catch (err) { throw handleApiError(err, 'generateStoryBoard'); }
};

export const findBiblicalLocations = async (
  book: string,
  chapter: number,
  text: string,
  age?: number,
  lang: Language = 'pt'
): Promise<LocationResult> => {
  try {
    const findLocationsFn = functions.httpsCallable('findBiblicalLocations');
    const result = await findLocationsFn({ book, chapter, text, age, lang });
    const data = result.data as { success: boolean; locations: any[] };
    if (!data.success) return { locations: [], mapUrl: null, regionDescription: '' };

    const locations = data.locations || [];
    const regionDescription = locations.map((l: any) => l.name).join(', ');

    const langName = lang === 'en' ? 'ENGLISH' : lang === 'es' ? 'SPANISH' : 'PORTUGUESE';
    const mapPrompt = `Create an EDUCATIONAL biblical map showing: ${regionDescription}.

REQUIREMENTS:
- Clear labels in ${langName} for all locations
- Distance scale indicator (e.g., 0-50-100 km)
- Compass rose showing cardinal directions (N/S/E/W)
- Legend box explaining location markers
- Historical period context notes
- Modern country borders in light gray for reference
- Topographical features (mountains, rivers, seas) clearly labeled
- Ancient trade routes if relevant to the locations

STYLE: Ancient parchment with aged texture and educational clarity
FORMAT: High-quality educational poster suitable for Bible study

Focus on making this useful for teaching and learning about biblical geography.`;
    const mapUrl = await generateImageBackend(mapPrompt, '4:3');

    const adaptedLocations = locations.map((l: any) => ({
      biblicalName: l.name,
      modernName: l.name,
      description: l.description
    }));

    return { locations: adaptedLocations, mapUrl, regionDescription };
  } catch (err) { throw handleApiError(err, 'findBiblicalLocations'); }
};

export const generateCustomMap = async (
  topic: string,
  age?: number,
  lang: Language = 'pt'
): Promise<LocationResult> => {
  try {
    const analysisFn = functions.httpsCallable('generateCustomMapAnalysis');
    const analysisResult = await analysisFn({ topic, lang });
    const extractedData = analysisResult.data as { success: boolean; locations: any[]; regionDescription: string };

    let mapUrl = null;
    if (extractedData.regionDescription) {
      const langName = lang === 'en' ? 'ENGLISH' : lang === 'es' ? 'SPANISH' : 'PORTUGUESE';
      const mapPrompt = `Create an EDUCATIONAL biblical map about: ${topic}. ${extractedData.regionDescription}.

REQUIREMENTS:
- Clear labels in ${langName} for all locations
- Distance scale indicator (e.g., 0-50-100 km)
- Compass rose showing cardinal directions (N/S/E/W)
- Legend box explaining location markers
- Historical context and period notes
- Modern country borders in light gray for reference
- Topographical features (mountains, rivers, seas) clearly labeled
- Ancient trade routes if relevant

STYLE: Ancient parchment with aged texture and educational clarity
FORMAT: High-quality educational poster suitable for Bible study

Focus on making this useful for teaching and learning about biblical geography.`;
      mapUrl = await generateImageBackend(mapPrompt, '4:3');
    }

    return {
      locations: (extractedData.locations as any) || [],
      mapUrl,
      regionDescription: extractedData.regionDescription || ''
    };
  } catch (err) { throw handleApiError(err, 'generateCustomMap'); }
};

export const generateVisualSummary = async (text: string, age?: number, lang: Language = 'pt'): Promise<string | null> => {
  const prompt = `Create a detailed infographic poster summarizing this Bible chapter in ${lang}. Chapter Context: ${text.substring(0, 4000)}`;
  return await generateImageBackend(prompt, '16:9', '4k');
};

export const searchBibleReferences = async (query: string, lang: Language = 'pt'): Promise<SearchResult[]> => {
  try {
    const searchFn = functions.httpsCallable('searchBibleReferences');
    const result = await searchFn({ query, lang });
    const data = result.data as { success: boolean; results: SearchResult[] };
    return data.results || [];
  } catch (err) { throw handleApiError(err, 'searchBibleReferences'); }
};

export const generateStudyGuide = async (theme: string, context: string, age?: number, lang: Language = 'pt'): Promise<string> => {
  try {
    const studyGuideFn = functions.httpsCallable('generateStudyGuide');
    const result = await studyGuideFn({ theme, context, age, lang });
    const data = result.data as { success: boolean; text: string };
    return data.text || 'Error.';
  } catch (err) { throw handleApiError(err, 'generateStudyGuide'); }
};

export const generateThematicStudy = async (topic: string, age?: number, lang: Language = 'pt'): Promise<string> => {
  try {
    const thematicStudyFn = functions.httpsCallable('generateThematicStudy');
    const result = await thematicStudyFn({ topic, age, lang });
    const data = result.data as { success: boolean; text: string };
    return data.text || 'Error.';
  } catch (err) { throw handleApiError(err, 'generateThematicStudy'); }
};

export const analyzeKeywordsInVerse = async (reference: string, verseText: string, lang: Language = 'pt'): Promise<WordAnalysis[]> => {
  try {
    const keywordFn = functions.httpsCallable('analyzeKeywordsInVerse');
    const result = await keywordFn({ reference, verseText, lang });
    const data = result.data as { success: boolean; keywords: WordAnalysis[] };
    return data.keywords || [];
  } catch (err) { throw handleApiError(err, 'analyzeKeywordsInVerse'); }
};

export const generateInterlinearChapter = async (book: string, chapter: number, startVerse: number, endVerse: number, lang: Language = 'pt'): Promise<InterlinearVerse[]> => {
  try {
    const interlinearFn = functions.httpsCallable('generateInterlinearChapter');
    const result = await interlinearFn({ book, chapter, startVerse, endVerse, lang });
    const data = result.data as { success: boolean; verses: InterlinearVerse[] };
    return data.verses || [];
  } catch (err) { throw handleApiError(err, 'generateInterlinearChapter'); }
};

export const getWordDefinition = async (original: string, strong: string, context: string, lang: Language = 'pt'): Promise<LexiconEntry | null> => {
  try {
    const wordDefFn = functions.httpsCallable('getWordDefinition');
    const result = await wordDefFn({ original, strong, context, lang });
    const data = result.data as { success: boolean } & LexiconEntry;
    return data;
  } catch (err) { throw handleApiError(err, 'getWordDefinition'); }
};

// 4. generateTheologyAnalysis
export const generateTheologyAnalysis = async (
  book: string,
  chapter: number,
  context: string,
  lang: Language = 'pt',
  age?: number
): Promise<string> => {
  const cacheKey = `theology_${book}_${chapter}_${lang}_${age || 'all'}`;
  const memoryCached = getFromCache(cacheKey);
  if (memoryCached) return memoryCached;

  const cacheId = `${book}_${chapter}_${lang}_${age || 'all'}_theology`.replace(/\s+/g, '_');
  const cacheRef = db.collection('analysis_cache').doc(cacheId);

  try {
    const doc = await cacheRef.get();
    if (doc.exists) {
      const data = doc.data();
      if (data?.text) {
        setInCache(cacheKey, data.text);
        return data.text;
      }
    }

    const generateTheologyAnalysisFn = functions.httpsCallable('generateTheologyAnalysis');
    const result = await generateTheologyAnalysisFn({ book, chapter, context, lang, age });
    const data = result.data as { success: boolean; text: string };

    if (!data.success) throw new Error('Falha na análise teológica');

    await cacheRef.set({
      text: data.text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      book,
      chapter,
      lang,
      type: 'theology',
      age: age || null
    });

    setInCache(cacheKey, data.text);
    return data.text;
  } catch (error) {
    throw handleApiError(error, 'generateTheologyAnalysis');
  }
};

// 5. generateExegesisAnalysis
export const generateExegesisAnalysis = async (
  referenceTitle: string,
  context: string,
  lang: Language = 'pt',
  age?: number
): Promise<string> => {
  // Exegese pode ser de um capítulo ou texto livre, então usamos hash ou algo simples para cache
  const safeRef = referenceTitle.replace(/[^a-zA-Z0-9]/g, '_');
  const cacheKey = `exegesis_${safeRef}_${lang}_${age || 'all'}`;

  const memoryCached = getFromCache(cacheKey);
  if (memoryCached) return memoryCached;

  // Para exegese customizada (texto livre), talvez não queiramos cache persistente tão agressivo
  // Mas para capítulos, sim. Vamos tentar cachear.
  const cacheId = `exegesis_${safeRef}_${lang}_${age || 'all'}`.substring(0, 100); // Limite tamanho ID
  const cacheRef = db.collection('analysis_cache').doc(cacheId);

  try {
    const doc = await cacheRef.get();
    if (doc.exists) {
      setInCache(cacheKey, doc.data()?.text);
      return doc.data()?.text;
    }

    const generateExegesisAnalysisFn = functions.httpsCallable('generateExegesisAnalysis');
    const result = await generateExegesisAnalysisFn({ referenceTitle, context, lang, age });
    const data = result.data as { success: boolean; text: string };

    if (!data.success) throw new Error('Falha na exegese');

    await cacheRef.set({
      text: data.text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      referenceTitle,
      lang,
      type: 'exegesis',
      age: age || null
    });

    setInCache(cacheKey, data.text);
    return data.text;
  } catch (error) {
    throw handleApiError(error, 'generateExegesisAnalysis');
  }
};

export const generateDailyDevotional = async (topic: string, age?: number, lang: Language = 'pt'): Promise<DevotionalContent | null> => {
  try {
    const devotionalFn = functions.httpsCallable('generateDailyDevotional');
    const result = await devotionalFn({ topic, age, lang });
    const data = result.data as { success: boolean } & DevotionalContent;
    return data;
  } catch (err) { throw handleApiError(err, 'generateDailyDevotional'); }
};

export const getDailyDevotional = async (lang: Language = 'pt'): Promise<DevotionalContent | null> => {
  try {
    const dailyDevotionalFn = functions.httpsCallable('getDailyDevotional');
    const result = await dailyDevotionalFn({ lang });
    const data = result.data as { success: boolean } & DevotionalContent;

    if (!data.success) {
      throw new Error('Falha ao obter devocional do dia');
    }

    return {
      title: data.title,
      scriptureReference: data.scriptureReference,
      scriptureText: data.scriptureText,
      reflection: data.reflection,
      prayer: data.prayer,
      finalQuote: data.finalQuote
    };
  } catch (err) { throw handleApiError(err, 'getDailyDevotional'); }
};

export const askLibraryAgent = async (query: string, resources: LibraryResource[], lang: Language = 'pt'): Promise<string> => {
  try {
    const libraryFn = functions.httpsCallable('askLibraryAgent');
    const result = await libraryFn({ query, resources: resources.map(r => ({ title: r.title, textContent: r.textContent })), lang });
    const data = result.data as { success: boolean; text: string };
    return data.text || 'Error.';
  } catch (err) { throw handleApiError(err, 'askLibraryAgent'); }
};

// Utility: Clear Strong cache to force regeneration with new format
export const clearStrongCache = async (): Promise<{ deleted: number; message: string }> => {
  try {
    const clearCacheFn = functions.httpsCallable('clearStrongCache');
    const result = await clearCacheFn({});
    const data = result.data as { success: boolean; deleted: number; message: string };
    // Also clear in-memory session cache for Strong translations
    const keysToDelete: string[] = [];
    sessionCache.forEach((_, key) => {
      if (key.includes('Almeida_com_Strong') || key.includes('Strong')) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => sessionCache.delete(key));
    return { deleted: data.deleted, message: data.message };
  } catch (err) { throw handleApiError(err, 'clearStrongCache'); }
};
