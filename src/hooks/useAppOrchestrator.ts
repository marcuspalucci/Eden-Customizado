/**
 * useAppOrchestrator
 *
 * Orchestrator central do ÉDEN. Consolida todo o estado de features e os
 * handlers de geração de IA que antes viviam no App.tsx monolítico.
 *
 * App.tsx agora é apenas uma camada de renderização que consome este hook.
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import firebase from 'firebase/compat/app';
import {
  findBiblicalLocations,
  searchBibleReferences,
  generateStudyGuide,
  generateInterlinearChapter,
  generateTheologyAnalysis,
  generateExegesisAnalysis,
  getWordDefinition,
  generateCustomMap,
  askLibraryAgent,
  generateThematicStudy,
  generateDailyDevotional,
} from '../services/geminiService';
import {
  BibleReference,
  LocationResult,
  TabView,
  LoadingState,
  SearchResult,
  RightPanelTab,
  InterlinearVerse,
  InterlinearWord,
  LexiconEntry,
  AIStudioClient,
  Language,
  DevotionalContent,
  StudyRestorePoint,
} from '../types';
import { auth, db } from '../services/firebase';
import { logger } from '../utils/logger';
import { useAuth } from '../contexts/AuthContext';
import { useBible } from '../contexts/BibleContext';
import { useBibleReader } from './useBibleReader';
import { useAudio } from '../contexts/AudioContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useRestorePoints } from './useRestorePoints';
import { useLibrary } from './useLibrary';
import { useErrorHandler } from './useErrorHandler';
import { useNotesManager } from './useNotesManager';
import { useDailyDevotionalQuery } from './queries/useDailyDevotionalQuery';
import { BIBLE_BOOKS, ABBREVIATION_MAP } from '../utils/constants';

// ── Route ↔ TabView helpers ───────────────────────────────────────────────

export const tabToPath: Record<TabView, string> = {
  [TabView.READING]:       '/',
  [TabView.DEVOTIONALS]:   '/devotionals',
  [TabView.LOCATIONS]:     '/maps',
  [TabView.INTERLINEAR]:   '/interlinear',
  [TabView.THEOLOGY]:      '/theology',
  [TabView.EXEGESIS]:      '/exegesis',
  [TabView.STUDY_GUIDE]:   '/study',
  [TabView.VISUALS]:       '/visuals',
  [TabView.VISUAL_SUMMARY]:'/visual-summary',
  [TabView.THEMATIC_STUDY]:'/thematic-study',
  [TabView.LIBRARY]:       '/library',
};

export const pathToTab: Record<string, TabView> = Object.fromEntries(
  Object.entries(tabToPath).map(([tab, path]) => [path, tab as TabView])
) as Record<string, TabView>;

const INITIAL_LOADING: LoadingState = {
  text: false,
  image: false,
  locations: false,
  visualSummary: false,
  search: false,
  studyGuide: false,
  thematicStudy: false,
  wordStudy: false,
  interlinear: false,
  theology: false,
  exegesis: false,
  lexicon: false,
  libraryAgent: false,
  devotional: false,
  restorePoints: false,
};

export const useAppOrchestrator = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { handleError } = useErrorHandler();
  const { user, loading: loadingAuth, isAdmin } = useAuth();
  const { t, currentLang, setLanguage } = useLanguage();
  const {
    bibleRef,
    setBibleRef,
    compareMode,
    setCompareMode,
    secondaryBibleRef,
    setSecondaryBibleRef,
    secondaryTranslation,
    setIsCrossReference,
  } = useBible();
  const { bibleText, secondaryBibleText, loadingText, refetch } = useBibleReader();
  const { handleStopSpeak } = useAudio();
  const {
    restorePoints,
    loading: loadingRestorePoints,
    saveRestorePoint,
    deleteRestorePoint,
  } = useRestorePoints();
  const {
    resources: libraryResources,
    loading: loadingLibrary,
    uploadResource,
    deleteResource: deleteLibraryResource,
    uploading: uploadingLibrary,
    fetchResources: fetchLibraryResources,
  } = useLibrary();

  const isGuest = user?.email === 'guest@dev.local';
  const notes = useNotesManager(isGuest);

  // TanStack Query — devocional do dia
  const dailyDevotionalQuery = useDailyDevotionalQuery(currentLang);

  // activeTab derivado da URL atual
  const activeTab: TabView = pathToTab[location.pathname] ?? TabView.READING;

  // UI state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [apiKeyReady, setApiKeyReady] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<RightPanelTab>(RightPanelTab.SEARCH);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

  // Feature states
  const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
  const [studyGuideContent, setStudyGuideContent] = useState<string | null>(null);
  const [thematicStudyContent, setThematicStudyContent] = useState<string | null>(null);
  const [interlinearData, setInterlinearData] = useState<InterlinearVerse[] | null>(null);
  const [theologyContent, setTheologyContent] = useState<string | null>(null);
  const [exegesisContent, setExegesisContent] = useState<string | null>(null);
  const [selectedLexiconItem, setSelectedLexiconItem] = useState<LexiconEntry | null>(null);
  const [devotionalTopic, setDevotionalTopic] = useState('');
  const [devotionalContent, setDevotionalContent] = useState<DevotionalContent | null>(null);
  const [featureError, setFeatureError] = useState<Record<string, string | undefined>>({});
  const [libraryAgentQuery, setLibraryAgentQuery] = useState('');
  const [libraryAgentResponse, setLibraryAgentResponse] = useState('');
  const [exegesisInput, setExegesisInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [customMapQuery, setCustomMapQuery] = useState('');
  const [loading, setLoading] = useState<LoadingState>(INITIAL_LOADING);

  // Helpers
  const setLoadingKey = useCallback(
    (key: keyof LoadingState, value: boolean) =>
      setLoading((prev) => ({ ...prev, [key]: value })),
    []
  );

  const saveHistory = useCallback(
    async (action: string, details: string) => {
      if (!auth.currentUser || isGuest) return;
      try {
        await db.collection('history').add({
          uid: auth.currentUser.uid,
          action,
          details,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        handleError(e);
      }
    },
    [isGuest, handleError]
  );

  const applyAgePersonalization = useCallback(
    (age: number, lang: Language) => {
      let translation = lang === 'en' ? 'NIV' : lang === 'es' ? 'NVI-ES' : 'NVI';
      if (age > 0 && age < 12) {
        translation =
          lang === 'pt' ? 'Bíblia Infantil' : lang === 'en' ? 'Kids Bible' : 'Biblia Niños';
      } else if (age >= 12 && age < 18 && lang === 'pt') {
        translation = 'Bíblia Teen';
      }
      setBibleRef((prev: BibleReference) => ({ ...prev, translation }));
    },
    [setBibleRef]
  );

  // ── Restore Points ────────────────────────────────────────────────────────

  const handleSaveRestorePoint = useCallback(async () => {
    await saveRestorePoint({
      reference: bibleRef,
      activeTab,
      noteContent: notes.noteContent,
      compareMode,
      secondaryReference: compareMode ? secondaryBibleRef : null,
    });
  }, [saveRestorePoint, bibleRef, activeTab, notes.noteContent, compareMode, secondaryBibleRef]);

  const handleLoadRestorePoint = useCallback(
    (point: StudyRestorePoint) => {
      setBibleRef(point.reference);
      navigate(tabToPath[point.activeTab]);
      notes.setNoteContent(point.noteContent);
      setCompareMode(point.compareMode);
      if (point.secondaryReference) setSecondaryBibleRef(point.secondaryReference);
      setIsRightPanelOpen(false);
      setLocationResult(null);
      setStudyGuideContent(null);
      setTheologyContent(null);
      setExegesisContent(null);
      setInterlinearData(null);
    },
    [setBibleRef, notes, setCompareMode, setSecondaryBibleRef]
  );

  // ── Interlinear ───────────────────────────────────────────────────────────

  const handleLoadMoreInterlinear = useCallback(
    async (reset = false) => {
      setLoadingKey('interlinear', true);
      try {
        const start = reset
          ? 1
          : interlinearData
            ? interlinearData[interlinearData.length - 1].verseNumber + 1
            : 1;
        const newData = await generateInterlinearChapter(
          bibleRef.book,
          bibleRef.chapter,
          start,
          start + 4,
          currentLang
        );
        if (reset) setInterlinearData(newData);
        else setInterlinearData((prev) => [...(prev || []), ...newData]);
      } catch (e) {
        handleError(e);
      } finally {
        setLoadingKey('interlinear', false);
      }
    },
    [interlinearData, bibleRef.book, bibleRef.chapter, currentLang, handleError, setLoadingKey]
  );

  // ── Tab change ────────────────────────────────────────────────────────────

  // Navega para uma tab programaticamente (ex: botão fechar painel)
  const handleTabChange = useCallback(
    (tab: TabView) => navigate(tabToPath[tab]),
    [navigate]
  );

  // Side effects quando a rota (activeTab) muda — separado da navegação
  useEffect(() => {
    if (activeTab !== TabView.READING) setCompareMode(false);

    if (activeTab === TabView.THEMATIC_STUDY && !thematicStudyContent) {
      setLoadingKey('thematicStudy', true);
      generateThematicStudy(`${bibleRef.book} ${bibleRef.chapter}`, user?.age, currentLang)
        .then(setThematicStudyContent)
        .catch(handleError)
        .finally(() => setLoadingKey('thematicStudy', false));
    }

    if (activeTab === TabView.INTERLINEAR && !interlinearData) {
      handleLoadMoreInterlinear(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Search ────────────────────────────────────────────────────────────────

  const performSearch = useCallback(async () => {
    if (!searchQuery) return;
    setIsRightPanelOpen(true);
    setActiveRightTab(RightPanelTab.SEARCH);
    setLoadingKey('search', true);
    try {
      const results = await searchBibleReferences(searchQuery, currentLang);
      setSearchResults(results);
    } catch (e) {
      handleError(e);
    } finally {
      setLoadingKey('search', false);
    }
  }, [searchQuery, currentLang, handleError, setLoadingKey]);

  // ── Feature generators ────────────────────────────────────────────────────

  const handleGenerateLocations = useCallback(async () => {
    setLoadingKey('locations', true);
    try {
      const res = await findBiblicalLocations(
        bibleRef.book,
        bibleRef.chapter,
        bibleText,
        user?.age,
        currentLang
      );
      setLocationResult(res);
    } catch (e) {
      handleError(e);
    } finally {
      setLoadingKey('locations', false);
    }
  }, [bibleRef.book, bibleRef.chapter, bibleText, user?.age, currentLang, handleError, setLoadingKey]);

  const handleGenerateStudyGuide = useCallback(async () => {
    setLoadingKey('studyGuide', true);
    try {
      const res = await generateStudyGuide(
        `${bibleRef.book} ${bibleRef.chapter}`,
        bibleText,
        user?.age,
        currentLang
      );
      setStudyGuideContent(res);
    } catch (e) {
      handleError(e);
    } finally {
      setLoadingKey('studyGuide', false);
    }
  }, [bibleRef.book, bibleRef.chapter, bibleText, user?.age, currentLang, handleError, setLoadingKey]);

  const handleGenerateTheology = useCallback(async () => {
    setLoadingKey('theology', true);
    try {
      const res = await generateTheologyAnalysis(
        bibleRef.book,
        bibleRef.chapter,
        bibleText,
        currentLang,
        user?.age
      );
      setTheologyContent(res);
    } catch (e) {
      handleError(e);
    } finally {
      setLoadingKey('theology', false);
    }
  }, [bibleRef.book, bibleRef.chapter, bibleText, currentLang, user?.age, handleError, setLoadingKey]);

  const handleGenerateExegesis = useCallback(async () => {
    setLoadingKey('exegesis', true);
    try {
      const res = await generateExegesisAnalysis(
        `${bibleRef.book} ${bibleRef.chapter}`,
        bibleText,
        currentLang,
        user?.age
      );
      setExegesisContent(res);
    } catch (e) {
      handleError(e);
    } finally {
      setLoadingKey('exegesis', false);
    }
  }, [bibleRef.book, bibleRef.chapter, bibleText, currentLang, user?.age, handleError, setLoadingKey]);

  const handleCustomExegesis = useCallback(async () => {
    if (!exegesisInput.trim()) return;
    setLoadingKey('exegesis', true);
    try {
      const content = await generateExegesisAnalysis(
        'Texto Selecionado',
        exegesisInput,
        currentLang,
        user?.age
      );
      setExegesisContent(content);
      if (auth.currentUser) saveHistory('custom_exegesis', exegesisInput.substring(0, 50));
    } catch (e) {
      handleError(e);
    } finally {
      setLoadingKey('exegesis', false);
    }
  }, [exegesisInput, currentLang, user?.age, handleError, saveHistory, setLoadingKey]);

  const handleResetExegesis = useCallback(async () => {
    setExegesisInput('');
    setLoadingKey('exegesis', true);
    try {
      const data = await generateExegesisAnalysis(
        `${bibleRef.book} ${bibleRef.chapter}`,
        bibleText,
        currentLang,
        user?.age
      );
      setExegesisContent(data);
    } catch (e) {
      handleError(e);
    } finally {
      setLoadingKey('exegesis', false);
    }
  }, [bibleRef.book, bibleRef.chapter, bibleText, currentLang, user?.age, handleError, setLoadingKey]);

  const handleGenerateDevotional = useCallback(async () => {
    if (!devotionalTopic.trim()) return;
    setLoadingKey('devotional', true);
    setFeatureError((prev) => ({ ...prev, devotional: undefined }));
    try {
      const content = await generateDailyDevotional(devotionalTopic, undefined, currentLang);
      if (content) {
        setDevotionalContent(content);
        if (auth.currentUser) saveHistory('generate_devotional', devotionalTopic);
      } else {
        setFeatureError((prev) => ({ ...prev, devotional: 'Não foi possível gerar o devocional.' }));
      }
    } catch (e) {
      handleError(e);
      setFeatureError((prev) => ({ ...prev, devotional: 'Erro de conexão.' }));
    } finally {
      setLoadingKey('devotional', false);
    }
  }, [devotionalTopic, currentLang, handleError, saveHistory, setLoadingKey]);

  const handleGetDailyDevotional = useCallback(async () => {
    setFeatureError((prev) => ({ ...prev, devotional: undefined }));
    try {
      const { data, error } = await dailyDevotionalQuery.refetch();
      if (error) {
        logger.warn('Erro ao obter devocional do dia:', error);
        setFeatureError((prev) => ({
          ...prev,
          devotional: 'Erro ao carregar devocional do dia. Tente novamente.',
        }));
      } else if (data) {
        setDevotionalTopic('[Devocional do Dia]');
        if (auth.currentUser) saveHistory('daily_devotional', 'Devocional do Dia');
      }
    } catch (e) {
      logger.warn('Erro ao obter devocional do dia:', e);
      setFeatureError((prev) => ({
        ...prev,
        devotional: 'Erro ao carregar devocional do dia. Tente novamente.',
      }));
    }
  }, [dailyDevotionalQuery, saveHistory]);

  const handleCustomMapGeneration = useCallback(async () => {
    if (!customMapQuery) return;
    setLoadingKey('locations', true);
    try {
      const res = await generateCustomMap(customMapQuery, user?.age, currentLang);
      setLocationResult(res);
    } catch (e) {
      handleError(e);
    } finally {
      setLoadingKey('locations', false);
    }
  }, [customMapQuery, user?.age, currentLang, handleError, setLoadingKey]);

  const handleStrongClick = useCallback(
    async (word: string, code: string) => {
      setIsRightPanelOpen(true);
      setActiveRightTab(RightPanelTab.WORD_STUDY);
      setLoadingKey('lexicon', true);
      try {
        const def = await getWordDefinition(
          word,
          code,
          `${bibleRef.book} ${bibleRef.chapter}`,
          currentLang
        );
        setSelectedLexiconItem(def);
      } catch (e) {
        handleError(e);
      } finally {
        setLoadingKey('lexicon', false);
      }
    },
    [bibleRef.book, bibleRef.chapter, currentLang, handleError, setLoadingKey]
  );

  const handleWordClick = useCallback(
    (word: InterlinearWord) => {
      handleStrongClick(word.original, word.strong);
    },
    [handleStrongClick]
  );

  const handleParallelClick = useCallback(
    (ref: string) => {
      const match = ref.match(/^(.*?)\s+(\d+):(\d+).*$/);
      if (!match) return;
      const [, bookRaw, chapter] = match;
      const targetBook = bookRaw.trim().toLowerCase();

      const bookObj = BIBLE_BOOKS.find((b) => {
        if (
          b.name.toLowerCase() === targetBook ||
          b.nameEn.toLowerCase() === targetBook ||
          b.nameEs.toLowerCase() === targetBook
        )
          return true;
        const abbrKey = Object.keys(ABBREVIATION_MAP).find(
          (k) => k.toLowerCase() === targetBook
        );
        if (abbrKey) return ABBREVIATION_MAP[abbrKey] === b.name;
        return false;
      });

      if (bookObj) {
        setIsCrossReference(true);
        setSecondaryBibleRef({
          book: bookObj.name,
          chapter: parseInt(chapter),
          translation: secondaryTranslation,
        });
        setCompareMode(true);
      }
    },
    [secondaryTranslation, setSecondaryBibleRef, setCompareMode, setIsCrossReference]
  );

  const handleDeleteResource = useCallback(
    async (id: string, fileUrl?: string) => {
      if (window.confirm('Tem certeza que deseja excluir este recurso permanentemente?')) {
        await deleteLibraryResource(id, fileUrl);
      }
    },
    [deleteLibraryResource]
  );

  const handleLibraryAgentAsk = useCallback(async () => {
    if (!libraryAgentQuery) return;
    setLoadingKey('libraryAgent', true);
    try {
      const response = await askLibraryAgent(libraryAgentQuery, libraryResources, currentLang);
      setLibraryAgentResponse(response);
    } catch (e) {
      handleError(e);
    } finally {
      setLoadingKey('libraryAgent', false);
    }
  }, [libraryAgentQuery, libraryResources, currentLang, handleError, setLoadingKey]);

  // ── Sync TanStack Query → local state ────────────────────────────────────

  useEffect(() => {
    if (dailyDevotionalQuery.data) {
      setDevotionalContent(dailyDevotionalQuery.data);
    }
  }, [dailyDevotionalQuery.data]);

  useEffect(() => {
    setLoadingKey('devotional', dailyDevotionalQuery.isFetching);
  }, [dailyDevotionalQuery.isFetching, setLoadingKey]);

  // ── Side effects ──────────────────────────────────────────────────────────

  useEffect(() => {
    const checkApiKey = async () => {
      const aiStudio = (window as unknown as { aistudio: AIStudioClient }).aistudio;
      if (aiStudio) {
        setApiKeyReady(Boolean(await aiStudio.hasSelectedApiKey()));
      } else {
        setApiKeyReady(true);
      }
    };
    checkApiKey();
  }, []);

  useEffect(() => {
    if (user && !isGuest) {
      if (user.language && user.language !== currentLang) setLanguage(user.language);
      applyAgePersonalization(user.age, user.language || 'pt');

      const loadNotes = async () => {
        try {
          if (auth.currentUser) {
            const doc = await db
              .collection('users')
              .doc(auth.currentUser.uid)
              .collection('notes')
              .doc('default')
              .get();
            if (doc.exists) notes.setNoteContent(doc.data()?.content || '');
          }
        } catch (e) {
          logger.warn('Erro ao ler notas:', e);
        }
      };
      loadNotes();
    } else if (!user && !loadingAuth) {
      notes.setNoteContent('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadingAuth]);

  useEffect(() => {
    if (!secondaryBibleRef && compareMode) {
      setSecondaryBibleRef({ ...bibleRef, translation: secondaryTranslation });
    }
  }, [bibleRef, compareMode]);

  useEffect(() => {
    if (apiKeyReady && user && !loadingAuth) {
      handleStopSpeak();
    }
  }, [bibleRef, compareMode, secondaryTranslation, secondaryBibleRef, apiKeyReady, user, loadingAuth, currentLang]);

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    // Auth
    user,
    loadingAuth,
    isAdmin,
    isGuest,

    // Lang
    t,
    currentLang,

    // Bible
    bibleRef,
    setBibleRef,
    bibleText,
    secondaryBibleText,
    loadingText,
    refetch,
    compareMode,
    setCompareMode,
    setIsCrossReference,

    // UI
    showProfileModal,
    setShowProfileModal,
    apiKeyReady,
    setApiKeyReady,
    activeTab,
    isRightPanelOpen,
    setIsRightPanelOpen,
    activeRightTab,
    setActiveRightTab,
    fullScreenImage,
    setFullScreenImage,

    // Notes
    notes,

    // Features
    locationResult,
    studyGuideContent,
    thematicStudyContent,
    interlinearData,
    theologyContent,
    exegesisContent,
    selectedLexiconItem,
    devotionalTopic,
    setDevotionalTopic,
    devotionalContent,
    featureError,
    libraryAgentQuery,
    setLibraryAgentQuery,
    libraryAgentResponse,
    exegesisInput,
    setExegesisInput,
    searchQuery,
    setSearchQuery,
    searchResults,
    customMapQuery,
    setCustomMapQuery,
    loading,

    // Library
    libraryResources,
    loadingLibrary,
    uploadResource,
    uploadingLibrary,

    // Restore Points
    restorePoints,
    loadingRestorePoints,

    // Handlers
    handleTabChange,
    performSearch,
    handleSaveRestorePoint,
    handleLoadRestorePoint,
    handleDeleteRestorePoint: deleteRestorePoint,
    handleLoadMoreInterlinear,
    handleGenerateLocations,
    handleGenerateStudyGuide,
    handleGenerateTheology,
    handleGenerateExegesis,
    handleCustomExegesis,
    handleResetExegesis,
    handleGenerateDevotional,
    handleGetDailyDevotional,
    handleCustomMapGeneration,
    handleStrongClick,
    handleWordClick,
    handleParallelClick,
    handleDeleteResource,
    handleLibraryAgentAsk,
  };
};
