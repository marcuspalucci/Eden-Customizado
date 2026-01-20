import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useBible } from './BibleContext';
import { useAuth } from './AuthContext';
import { getBibleContent, translateForAudio } from '../services/geminiService';
import { Language } from '../types';
import { AVAILABLE_TRANSLATIONS } from '../utils/constants';
import { logger } from '../utils/logger';

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
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

// Wake Lock helper to keep screen on during audio playback
let wakeLock: WakeLockSentinel | null = null;

const requestWakeLock = async () => {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      logger.log('Wake Lock activated - screen will stay on');
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
      logger.log('Wake Lock released');
    } catch (err) {
      logger.warn('Wake Lock release failed:', err);
    }
  }
};

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { bibleRef } = useBible();
  const { user } = useAuth();
  const currentLang = user?.language || 'pt';

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [playingSource, setPlayingSource] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [audioTargetLang, setAudioTargetLang] = useState<Language>('pt');
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [activeAudioSettingsPanel, setActiveAudioSettingsPanel] = useState<string | null>(null);

  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

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

  // Re-acquire wake lock when tab becomes visible again (handles screen lock/unlock)
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
      .replace(/<[HG]\d+>/g, '')       // Remove marcadores Strong
      .replace(/\*\*\d+\.\*\*/g, '')   // Remove "**1.**" markdown
      .replace(/^\d+\s+/gm, '')        // Remove números no início de linha (versículos)
      .replace(/\b\d+:\d+\b/g, '')     // Remove referências tipo "3:16"
      .replace(/[*#]/g, '')             // Remove asteriscos e hashes
      .replace(/\(.*?\)/g, '')          // Remove parênteses
      .replace(/\s+/g, ' ')             // Normaliza espaços
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
    releaseWakeLock();
  }, []);

  const handleSpeak = useCallback(
    async (textToSpeak: string, sourceId: string, contextType: 'bible' | 'generated') => {
      if (!textToSpeak) return;
      if (isSpeaking && playingSource === sourceId) {
        handleStopSpeak();
        return;
      }
      window.speechSynthesis.cancel();
      setIsPreparingAudio(true);
      setPlayingSource(sourceId);

      // Request Wake Lock to keep screen on
      await requestWakeLock();

      let finalSpeechText = cleanTextForSpeech(textToSpeak);
      const targetLang = audioTargetLang || currentLang;

      if (targetLang !== currentLang) {
        try {
          if (contextType === 'bible') {
            let targetTranslation = 'NIV';
            if (targetLang === 'pt') targetTranslation = 'NVI';
            if (targetLang === 'es') targetTranslation = 'RVR1960';
            const t1Label =
              AVAILABLE_TRANSLATIONS.find((t) => t.id === targetTranslation)?.label ||
              targetTranslation;
            const translatedContent = await getBibleContent(
              bibleRef.book,
              bibleRef.chapter,
              t1Label,
              targetLang
            );
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
      const targetLangCode = targetLang || 'pt';
      const bestVoice = selectBestVoice(targetLangCode, voices);

      if (bestVoice) {
        utterance.voice = bestVoice;
        utterance.lang = bestVoice.lang;
      } else {
        utterance.lang =
          targetLangCode === 'pt' ? 'pt-BR' : targetLangCode === 'en' ? 'en-US' : 'es-ES';
      }

      utterance.rate = speechRate;
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
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        setIsSpeaking(false);
        setPlayingSource(null);
        releaseWakeLock();
      };

      speechRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [
      cleanTextForSpeech,
      selectBestVoice,
      speechRate,
      isSpeaking,
      playingSource,
      voices,
      audioTargetLang,
      currentLang,
      bibleRef,
      handleStopSpeak
    ]
  );

  return (
    <AudioContext.Provider
      value={{
        isSpeaking,
        playingSource,
        isPreparingAudio,
        speechRate,
        setSpeechRate,
        audioTargetLang,
        setAudioTargetLang,
        activeAudioSettingsPanel,
        setActiveAudioSettingsPanel,
        handleSpeak,
        handleStopSpeak
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
