import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { BibleReference } from '../types';
import { BIBLE_BOOKS } from '../utils/constants';

interface BibleContextData {
  bibleRef: BibleReference;
  setBibleRef: React.Dispatch<React.SetStateAction<BibleReference>>;
  translation: string;
  setTranslation: (trans: string) => void;

  // Compare Mode
  compareMode: boolean;
  setCompareMode: (mode: boolean) => void;
  secondaryBibleRef: BibleReference | null;
  setSecondaryBibleRef: React.Dispatch<React.SetStateAction<BibleReference | null>>;
  secondaryTranslation: string;
  setSecondaryTranslation: (trans: string) => void;

  // Navigation Helper Actions
  goToNextChapter: () => void;
  goToPreviousChapter: () => void;
  goToBook: (bookName: string) => void;
  goToChapter: (chapter: number) => void;
}

const BibleContext = createContext<BibleContextData>({} as BibleContextData);

export const BibleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Estado único da referência (incluindo tradução)
  const [bibleRef, setBibleRefState] = useState<BibleReference>({
    book: 'Gênesis',
    chapter: 1,
    translation: 'NVI'
  });

  // Helper para expor 'setBibleRef'
  const setBibleRef: React.Dispatch<React.SetStateAction<BibleReference>> = (refOrFn) => {
    setBibleRefState(refOrFn);
  };

  // Helper para 'translation' separado (mantendo compatibilidade)
  const translation = bibleRef.translation;
  const setTranslation = (t: string) => {
    setBibleRefState((prev) => ({ ...prev, translation: t }));
  };

  // Secundário (Lado Direito - Comparação)
  const [compareMode, setCompareMode] = useState(false);
  const [secondaryTranslation, setSecondaryTranslationState] = useState('KJV');
  const [secondaryBibleRef, setSecondaryBibleRef] = useState<BibleReference | null>(null);

  // Sincronizar secondaryTranslation com secondaryBibleRef
  const setSecondaryTranslation = (trans: string) => {
    setSecondaryTranslationState(trans);
    // Atualizar o secondaryBibleRef com a nova tradução
    setSecondaryBibleRef((prev) => prev ? { ...prev, translation: trans } : null);
  };

  // Quando compareMode é ativado, inicializar secondaryBibleRef
  useEffect(() => {
    if (compareMode && !secondaryBibleRef) {
      setSecondaryBibleRef({
        book: bibleRef.book,
        chapter: bibleRef.chapter,
        translation: secondaryTranslation
      });
    }
  }, [compareMode, bibleRef, secondaryTranslation]);

  // Sincronizar livro e capítulo quando bibleRef muda (no modo comparação)
  useEffect(() => {
    if (compareMode && secondaryBibleRef) {
      setSecondaryBibleRef((prev) => prev ? {
        ...prev,
        book: bibleRef.book,
        chapter: bibleRef.chapter
      } : null);
    }
  }, [bibleRef.book, bibleRef.chapter, compareMode]);

  const goToNextChapter = () => {
    setBibleRefState((prev) => {
      const currentBookData = BIBLE_BOOKS.find((b) => b.name === prev.book);
      if (!currentBookData) return prev;

      if (prev.chapter < currentBookData.chapters) {
        return { ...prev, chapter: prev.chapter + 1 };
      } else {
        // Avançar para próximo livro
        const currentIndex = BIBLE_BOOKS.indexOf(currentBookData);
        if (currentIndex < BIBLE_BOOKS.length - 1) {
          const nextBook = BIBLE_BOOKS[currentIndex + 1];
          return { ...prev, book: nextBook.name, chapter: 1 };
        }
      }
      return prev;
    });
  };

  const goToPreviousChapter = () => {
    setBibleRefState((prev) => {
      if (prev.chapter > 1) {
        return { ...prev, chapter: prev.chapter - 1 };
      } else {
        // Voltar para livro anterior
        const currentBookData = BIBLE_BOOKS.find((b) => b.name === prev.book);
        if (currentBookData) {
          const currentIndex = BIBLE_BOOKS.indexOf(currentBookData);
          if (currentIndex > 0) {
            const prevBook = BIBLE_BOOKS[currentIndex - 1];
            return { ...prev, book: prevBook.name, chapter: prevBook.chapters };
          }
        }
      }
      return prev;
    });
  };

  const goToBook = (bookName: string) => {
    setBibleRefState((prev) => ({ ...prev, book: bookName, chapter: 1 }));
  };

  const goToChapter = (chapter: number) => {
    setBibleRefState((prev) => ({ ...prev, chapter }));
  };

  return (
    <BibleContext.Provider
      value={{
        bibleRef,
        setBibleRef,
        translation,
        setTranslation,
        compareMode,
        setCompareMode,
        secondaryBibleRef,
        setSecondaryBibleRef,
        secondaryTranslation,
        setSecondaryTranslation,
        goToNextChapter,
        goToPreviousChapter,
        goToBook,
        goToChapter
      }}
    >
      {children}
    </BibleContext.Provider>
  );
};

export const useBible = () => {
  const context = useContext(BibleContext);
  if (!context) throw new Error('useBible must be used within a BibleProvider');
  return context;
};
