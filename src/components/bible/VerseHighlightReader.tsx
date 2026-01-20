import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useAudio } from '../../contexts/AudioContext';
import { Language } from '../../types';

interface Verse {
    number: number;
    text: string;
}

interface VerseHighlightReaderProps {
    bibleText: string;
    onStrongClick?: (word: string, code: string) => void;
}

/**
 * Parse Bible text into verse objects
 * Supports multiple formats:
 * - **1.** Verse text
 * - **1** Verse text  
 * - 1. Verse text
 */
const parseVerses = (text: string): Verse[] => {
    if (!text) return [];

    const verses: Verse[] = [];
    const lines = text.split('\n');
    let currentVerse: Verse | null = null;

    for (const line of lines) {
        // Match multiple verse patterns
        const verseMatch = line.match(/^\*\*(\d+)\.?\*\*\s*(.*)/) || // **1.** or **1**
            line.match(/^(\d+)\.\s+(.+)/);            // 1. text

        if (verseMatch) {
            if (currentVerse) {
                verses.push(currentVerse);
            }
            currentVerse = {
                number: parseInt(verseMatch[1]),
                text: verseMatch[2]
            };
        } else if (currentVerse && line.trim() && !line.startsWith('(') && !line.startsWith('#')) {
            // Continuation of current verse (skip parallel refs and headers)
            currentVerse.text += ' ' + line.trim();
        }
    }

    if (currentVerse) {
        verses.push(currentVerse);
    }

    return verses;
};

export const VerseHighlightReader: React.FC<VerseHighlightReaderProps> = ({
    bibleText,
    onStrongClick
}) => {
    const {
        currentVerseIndex,
        isVerseReading,
        startVerseReading,
        stopVerseReading,
        pauseVerseReading,
        resumeVerseReading,
        isSpeaking,
        speechRate,
        setSpeechRate,
        audioTargetLang,
        setAudioTargetLang
    } = useAudio();

    const verseRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const containerRef = useRef<HTMLDivElement>(null);

    // Parse verses from text
    const verses = useMemo(() => parseVerses(bibleText), [bibleText]);

    // Auto-scroll to current verse
    useEffect(() => {
        if (isVerseReading && currentVerseIndex >= 0) {
            const verseEl = verseRefs.current.get(currentVerseIndex);
            if (verseEl) {
                verseEl.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }
    }, [currentVerseIndex, isVerseReading]);

    const setVerseRef = useCallback((index: number, el: HTMLDivElement | null) => {
        if (el) {
            verseRefs.current.set(index, el);
        } else {
            verseRefs.current.delete(index);
        }
    }, []);

    const handleVerseClick = useCallback((index: number) => {
        if (isVerseReading) {
            stopVerseReading();
            setTimeout(() => startVerseReading(verses, index), 100);
        }
    }, [isVerseReading, stopVerseReading, startVerseReading, verses]);

    // Render verse text with Strong code support
    const renderVerseText = (text: string) => {
        if (!onStrongClick || !text.includes('<')) {
            return text;
        }

        const parts = text.split(/([\wÀ-ÿ-]+\s*<[HG]\d+>)/g);
        return parts.map((part, i) => {
            const match = part.match(/^([\wÀ-ÿ-]+)\s*<([HG]\d+)>$/);
            if (match) {
                const [, word, code] = match;
                return (
                    <span
                        key={i}
                        onClick={(e) => {
                            e.stopPropagation();
                            onStrongClick(word, code);
                        }}
                        className="cursor-pointer border-b border-dotted border-bible-accent/50 hover:bg-bible-secondary hover:text-bible-accent transition-colors"
                        title={`Strong: ${code}`}
                    >
                        {word}
                    </span>
                );
            }
            return <span key={i}>{part}</span>;
        });
    };

    return (
        <div ref={containerRef} className="verse-highlight-reader">
            {/* Compact Audio Controls - inline with content flow */}
            <div className="flex items-center justify-between gap-3 mb-4 py-2 px-3 bg-bible-secondary/50 rounded-lg border border-bible-border">
                {/* Play/Pause Controls */}
                <div className="flex items-center gap-2">
                    {!isVerseReading ? (
                        <button
                            onClick={() => startVerseReading(verses, 0)}
                            disabled={verses.length === 0}
                            className="w-8 h-8 flex items-center justify-center bg-bible-accent text-white rounded-full hover:bg-bible-accent-hover transition-all shadow-sm disabled:opacity-50"
                            title="Ouvir Capítulo"
                        >
                            <i className="fas fa-play text-xs"></i>
                        </button>
                    ) : (
                        <>
                            {isSpeaking ? (
                                <button
                                    onClick={pauseVerseReading}
                                    className="w-8 h-8 flex items-center justify-center bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition-all"
                                    title="Pausar"
                                >
                                    <i className="fas fa-pause text-xs"></i>
                                </button>
                            ) : (
                                <button
                                    onClick={resumeVerseReading}
                                    className="w-8 h-8 flex items-center justify-center bg-green-500 text-white rounded-full hover:bg-green-600 transition-all"
                                    title="Continuar"
                                >
                                    <i className="fas fa-play text-xs"></i>
                                </button>
                            )}
                            <button
                                onClick={stopVerseReading}
                                className="w-8 h-8 flex items-center justify-center bg-red-500 text-white rounded-full hover:bg-red-600 transition-all"
                                title="Parar"
                            >
                                <i className="fas fa-stop text-xs"></i>
                            </button>
                        </>
                    )}

                    {/* Current verse indicator */}
                    {isVerseReading && currentVerseIndex >= 0 && (
                        <span className="text-xs text-bible-accent font-bold ml-1">
                            v.{verses[currentVerseIndex]?.number || '-'}
                        </span>
                    )}
                </div>

                {/* Speed & Language */}
                <div className="flex items-center gap-3">
                    {/* Speed */}
                    <div className="flex items-center gap-1">
                        <i className="fas fa-tachometer-alt text-[10px] text-bible-text-light"></i>
                        <input
                            type="range"
                            min="0.5"
                            max="2"
                            step="0.25"
                            value={speechRate}
                            onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                            className="w-12 h-1 bg-bible-border rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-[10px] font-mono text-bible-text-light w-6">{speechRate}x</span>
                    </div>

                    {/* Language */}
                    <select
                        value={audioTargetLang}
                        onChange={(e) => setAudioTargetLang(e.target.value as Language)}
                        className="text-[10px] bg-bible-card border border-bible-border rounded px-1 py-0.5 text-bible-text cursor-pointer"
                    >
                        <option value="pt">🇧🇷 PT</option>
                        <option value="en">🇺🇸 EN</option>
                        <option value="es">🇪🇸 ES</option>
                    </select>
                </div>
            </div>

            {/* Verses */}
            <div className="space-y-1">
                {verses.map((verse, index) => (
                    <div
                        key={verse.number}
                        ref={(el) => setVerseRef(index, el)}
                        onClick={() => handleVerseClick(index)}
                        className={`
              py-2 px-3 rounded-lg transition-all duration-300 cursor-pointer
              ${isVerseReading && currentVerseIndex === index
                                ? 'reading-highlight animate-pulse-subtle'
                                : 'hover:bg-bible-hover/50'
                            }
            `}
                    >
                        <span
                            className="text-bible-accent font-bold mr-2 select-none"
                            data-verse={verse.number}
                        >
                            {verse.number}
                        </span>
                        <span className="text-bible-text font-serif text-lg leading-relaxed">
                            {renderVerseText(verse.text)}
                        </span>
                    </div>
                ))}
            </div>

            {/* Empty state */}
            {verses.length === 0 && bibleText && (
                <div className="text-center py-10 text-bible-text-light">
                    <i className="fas fa-exclamation-circle text-4xl mb-4 opacity-50"></i>
                    <p>Formato de texto não reconhecido</p>
                </div>
            )}
        </div>
    );
};

export default VerseHighlightReader;
