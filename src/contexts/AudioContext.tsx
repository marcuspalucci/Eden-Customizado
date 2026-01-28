import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useBible } from './BibleContext';
import { useLanguage } from './LanguageContext';
import { getBibleContent, translateForAudio } from '../services/geminiService';
import { Language } from '../types';
import { AVAILABLE_TRANSLATIONS } from '../utils/constants';
import { logger } from '../utils/logger';

interface ParsedVerse {
  number: number;
  text: string;
}

interface AudioContextType {
  isSpeaking: boolean;
  playingSource: string | null;
  isPreparingAudio: boolean;
  speechRate: number;
  setSpeechRate: (rate: number) => void;
  audioTargetLang: Language;
  setAudioTargetLang: (lang: Language) => void;
  activeAudioSettingsPanel: string | null;
  setActiveAudioSettingsPanel: (id: string | null) => void;
  handleSpeak: (
    text: string,
    sourceId: string,
    contextType: 'bible' | 'generated'
  ) => Promise<void>;
  handleStopSpeak: () => void;
  // Verse-by-verse reading
  currentReadingVerse: number;
  isVerseMode: boolean;
  startVerseReading: (text: string) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

// Wake Lock helper
let wakeLock: WakeLockSentinel | null = null;

const requestWakeLock = async () => {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      logger.log('Wake Lock activated');
    }
  } catch (err) {
    logger.warn('Wake Lock not available:', err);
  }
};

const releaseWakeLock = async () => {
  if (wakeLock) {
    try {
      await wakeLock.release();
      wakeLock = null;
    } catch (err) {
      logger.warn('Wake Lock release failed:', err);
    }
  }
};

// Parse verses from bible text - supports multiple formats:
// - **1.** Texto (markdown bold with period)
// - **1** Texto (markdown bold without period)  
// - 1. Texto (number with period)
// - 1 Texto (simple number followed by text)
const parseVerses = (text: string): ParsedVerse[] => {
  if (!text) return [];
  const verses: ParsedVerse[] = [];
  const lines = text.split('\n');
  let currentVerse: ParsedVerse | null = null;

  for (const line of lines) {
    // Try multiple patterns
    const verseMatch =
      line.match(/^\*\*(\d+)\.?\*\*\s*(.*)/) ||  // **1.** or **1**
      line.match(/^(\d+)\.\s+(.+)/) ||            // 1. text
      line.match(/^(\d+)\s+([A-ZÀ-Ú].+)/);        // 1 Text (uppercase start indicates verse text)

    if (verseMatch) {
      if (currentVerse) verses.push(currentVerse);
      currentVerse = { number: parseInt(verseMatch[1]), text: verseMatch[2] };
    } else if (currentVerse && line.trim() && !line.startsWith('(') && !line.startsWith('#')) {
      currentVerse.text += ' ' + line.trim();
    }
  }
  if (currentVerse) verses.push(currentVerse);

  // Log for debugging
  if (verses.length === 0 && text.length > 0) {
    logger.warn('No verses parsed. First 200 chars:', text.substring(0, 200));
  } else {
    logger.log(`Parsed ${verses.length} verses`);
  }

  return verses;
};

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { bibleRef } = useBible();
  // Usa LanguageContext como fonte única de idioma
  const { currentLang } = useLanguage();

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [playingSource, setPlayingSource] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechRate, setSpeechRateState] = useState(1.0);
  const [audioTargetLang, setAudioTargetLang] = useState<Language>('pt');
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [activeAudioSettingsPanel, setActiveAudioSettingsPanel] = useState<string | null>(null);

  // Verse reading state
  const [currentReadingVerse, setCurrentReadingVerse] = useState(-1);
  const [isVerseMode, setIsVerseMode] = useState(false);
  const versesRef = useRef<ParsedVerse[]>([]);
  const verseIndexRef = useRef(0);
  const speechRateRef = useRef(1.0);

  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Keep speechRateRef in sync
  const setSpeechRate = useCallback((rate: number) => {
    setSpeechRateState(rate);
    speechRateRef.current = rate;
  }, []);

  useEffect(() => {
    setAudioTargetLang(currentLang);
  }, [currentLang]);

  useEffect(() => {
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length > 0) setVoices(available);
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    const interval = setInterval(() => {
      const available = window.speechSynthesis.getVoices();
      if (available.length > 0) {
        setVoices(available);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Re-acquire wake lock on visibility change
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isSpeaking) {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isSpeaking]);

  const cleanTextForSpeech = useCallback((text: string): string => {
    if (!text) return '';
    return text
      .replace(/<[HG]\d+>/g, '')
      .replace(/\*\*\d+\.?\*\*/g, '')
      .replace(/^\d+\s+/gm, '')
      .replace(/\b\d+:\d+\b/g, '')
      .replace(/[*#]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  const PREFERRED_VOICE_LANGS: Record<string, string[]> = {
    pt: ['pt-BR', 'pt-PT', 'pt'],
    en: ['en-US', 'en-GB', 'en-AU', 'en'],
    es: ['es-ES', 'es-MX', 'es-419', 'es'],
  };

  const selectBestVoice = useCallback((targetLang: string, availableVoices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
    const preferredLangs = PREFERRED_VOICE_LANGS[targetLang] || [targetLang];
    for (const langCode of preferredLangs) {
      const qualityVoice = availableVoices.find(
        (v) => v.lang === langCode && !v.name.toLowerCase().includes('compact')
      );
      if (qualityVoice) return qualityVoice;
      const anyVoice = availableVoices.find((v) => v.lang === langCode);
      if (anyVoice) return anyVoice;
    }
    return null;
  }, []);

  const handleStopSpeak = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setPlayingSource(null);
    setCurrentReadingVerse(-1);
    setIsVerseMode(false);
    versesRef.current = [];
    verseIndexRef.current = 0;
    releaseWakeLock();

    // Clear all highlights from DOM
    document.querySelectorAll('.reading-highlight').forEach(el => {
      el.classList.remove('reading-highlight', 'animate-pulse-subtle');
    });
  }, []);

  // Speak a single verse and call callback when done
  const speakSingleVerse = useCallback((verse: ParsedVerse, onEnd: () => void) => {
    const cleanedText = cleanTextForSpeech(verse.text);
    if (!cleanedText) {
      onEnd();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    const bestVoice = selectBestVoice(audioTargetLang, voices);

    if (bestVoice) {
      utterance.voice = bestVoice;
      utterance.lang = bestVoice.lang;
    } else {
      utterance.lang = audioTargetLang === 'pt' ? 'pt-BR' : audioTargetLang === 'en' ? 'en-US' : 'es-ES';
    }

    utterance.rate = speechRateRef.current;

    utterance.onstart = () => {
      setCurrentReadingVerse(verse.number);

      // Remove highlight from previous verse
      document.querySelectorAll('.reading-highlight').forEach(el => {
        el.classList.remove('reading-highlight', 'animate-pulse-subtle');
      });

      // Try multiple strategies to find the verse element
      let verseEl: Element | null = null;
      let lineContainer: Element | null = null;

      // Strategy 1: Look for data-verse attribute
      verseEl = document.querySelector(`[data-verse="${verse.number}"]`);
      if (verseEl) {
        lineContainer = verseEl.closest('.mb-2') || verseEl.parentElement;
      }

      // Strategy 2: Look for strong with data-verse
      if (!lineContainer) {
        verseEl = document.querySelector(`strong[data-verse="${verse.number}"]`);
        if (verseEl) {
          lineContainer = verseEl.closest('.mb-2') || verseEl.parentElement;
        }
      }

      // Strategy 3: Find div.mb-2 that starts with the verse number
      if (!lineContainer) {
        const allVerseLines = document.querySelectorAll('.bible-content .mb-2, .prose .mb-2, div.mb-2');
        for (const line of allVerseLines) {
          const text = line.textContent || '';
          // Check if line starts with verse number (e.g., "1 No princípio" or "1. No princípio")
          if (text.match(new RegExp(`^${verse.number}[.\\s]`))) {
            lineContainer = line;
            verseEl = line;
            break;
          }
        }
      }

      if (lineContainer) {
        lineContainer.classList.add('reading-highlight', 'animate-pulse-subtle');
        lineContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        logger.warn(`Could not find verse ${verse.number} in DOM`);
      }
    };

    utterance.onend = onEnd;
    utterance.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        logger.error('Speech error:', e.error);
      }
      onEnd();
    };

    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [cleanTextForSpeech, selectBestVoice, audioTargetLang, voices]);

  // Read next verse in sequence
  const readNextVerse = useCallback(() => {
    const verses = versesRef.current;
    const index = verseIndexRef.current;

    if (index >= verses.length) {
      handleStopSpeak();
      return;
    }

    speakSingleVerse(verses[index], () => {
      verseIndexRef.current = index + 1;
      // Small delay between verses for natural pause
      setTimeout(() => {
        if (versesRef.current.length > 0) { // Check if still reading
          readNextVerse();
        }
      }, 300);
    });
  }, [speakSingleVerse, handleStopSpeak]);

  // Start verse-by-verse reading
  const startVerseReading = useCallback((text: string) => {
    window.speechSynthesis.cancel();
    const parsed = parseVerses(text);

    if (parsed.length === 0) {
      logger.warn('No verses parsed from text');
      return;
    }

    versesRef.current = parsed;
    verseIndexRef.current = 0;
    setIsVerseMode(true);
    setIsSpeaking(true);
    setPlayingSource('bible-verse');

    requestWakeLock();
    readNextVerse();
  }, [readNextVerse]);

  // Legacy speak function for non-bible content
  const handleSpeak = useCallback(
    async (textToSpeak: string, sourceId: string, contextType: 'bible' | 'generated') => {
      if (!textToSpeak) return;

      // If bible, use verse mode
      if (contextType === 'bible' && sourceId === 'bible') {
        if (isSpeaking && isVerseMode) {
          handleStopSpeak();
          return;
        }

        // Check if we need to fetch translated content
        const targetLang = audioTargetLang || currentLang;
        let textForReading = textToSpeak;

        if (targetLang !== currentLang) {
          setIsPreparingAudio(true);
          setPlayingSource('bible');
          try {
            let targetTranslation = 'NIV';
            if (targetLang === 'pt') targetTranslation = 'NVI';
            if (targetLang === 'es') targetTranslation = 'RVR1960';
            const t1Label = AVAILABLE_TRANSLATIONS.find((t) => t.id === targetTranslation)?.label || targetTranslation;
            const translatedContent = await getBibleContent(bibleRef.book, bibleRef.chapter, t1Label, targetLang);
            textForReading = translatedContent;
            logger.log(`Fetched ${targetLang} translation for audio`);
          } catch (e) {
            logger.error('Failed to fetch translation for audio', e);
          }
          setIsPreparingAudio(false);
        }

        await requestWakeLock();
        startVerseReading(textForReading);
        return;
      }

      // Non-bible content: use legacy mode
      if (isSpeaking && playingSource === sourceId) {
        handleStopSpeak();
        return;
      }

      window.speechSynthesis.cancel();
      setIsPreparingAudio(true);
      setPlayingSource(sourceId);
      await requestWakeLock();

      let finalSpeechText = cleanTextForSpeech(textToSpeak);
      const targetLang = audioTargetLang || currentLang;

      if (targetLang !== currentLang) {
        try {
          if (contextType === 'bible') {
            let targetTranslation = 'NIV';
            if (targetLang === 'pt') targetTranslation = 'NVI';
            if (targetLang === 'es') targetTranslation = 'RVR1960';
            const t1Label = AVAILABLE_TRANSLATIONS.find((t) => t.id === targetTranslation)?.label || targetTranslation;
            const translatedContent = await getBibleContent(bibleRef.book, bibleRef.chapter, t1Label, targetLang);
            finalSpeechText = cleanTextForSpeech(translatedContent);
          } else {
            finalSpeechText = await translateForAudio(finalSpeechText, targetLang);
          }
        } catch (e) {
          logger.error('Audio conversion failed', e);
        }
      }

      setIsPreparingAudio(false);
      const utterance = new SpeechSynthesisUtterance(finalSpeechText);
      const bestVoice = selectBestVoice(targetLang || 'pt', voices);

      if (bestVoice) {
        utterance.voice = bestVoice;
        utterance.lang = bestVoice.lang;
      } else {
        utterance.lang = targetLang === 'pt' ? 'pt-BR' : targetLang === 'en' ? 'en-US' : 'es-ES';
      }

      utterance.rate = speechRateRef.current;
      utterance.onstart = () => {
        setIsSpeaking(true);
        setPlayingSource(sourceId);
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        setPlayingSource(null);
        releaseWakeLock();
      };
      utterance.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          setIsSpeaking(false);
          setPlayingSource(null);
          releaseWakeLock();
        }
      };

      speechRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [
      cleanTextForSpeech,
      selectBestVoice,
      isSpeaking,
      isVerseMode,
      playingSource,
      voices,
      audioTargetLang,
      currentLang,
      bibleRef,
      handleStopSpeak,
      startVerseReading
    ]
  );

  return (
    <AudioContext.Provider
      value={{
        isSpeaking,
        playingSource,
        isPreparingAudio,
        speechRate: speechRateRef.current,
        setSpeechRate,
        audioTargetLang,
        setAudioTargetLang,
        activeAudioSettingsPanel,
        setActiveAudioSettingsPanel,
        handleSpeak,
        handleStopSpeak,
        currentReadingVerse,
        isVerseMode,
        startVerseReading
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) throw new Error('useAudio must be used within an AudioProvider');
  return context;
};
