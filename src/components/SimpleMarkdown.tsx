import React, { memo, useState } from 'react';
import { ABBREVIATION_MAP, BIBLE_BOOKS } from '../utils/constants';

interface SimpleMarkdownProps {
  text: string;
  onParallelClick?: (ref: string) => void;
  onStrongClick?: (word: string, code: string) => void;
  enableParagraphTracking?: boolean;
}

const ParallelList = ({ refs, onParallelClick }: { refs: string[], onParallelClick: (ref: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (refs.length === 0) return null;

  return (
    <div className="mb-4 -mt-1 ml-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-bold text-bible-text-light hover:text-bible-accent transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-bible-secondary"
      >
        <i className={`fas fa-chevron-${isOpen ? 'down' : 'right'} text-[10px]`}></i>
        <i className="fas fa-link text-[10px]"></i>
        {refs.length} Referências Cruzadas
      </button>

      {isOpen && (
        <div className="flex flex-wrap gap-2 items-center mt-2 pl-2 border-l-2 border-bible-accent/20 animate-in fade-in slide-in-from-top-1 duration-200">
          {refs.map((ref, idx) => (
            <button
              key={idx}
              onClick={() => onParallelClick(ref)}
              className="px-2 py-1 rounded bg-bible-secondary border border-bible-border text-xs text-bible-accent hover:text-white hover:bg-bible-accent transition-all font-mono"
              title="Abrir em modo de comparação"
            >
              <i className="fas fa-columns mr-1 text-[10px]"></i> {ref}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const SimpleMarkdown = memo(({ text, onParallelClick, onStrongClick, enableParagraphTracking }: SimpleMarkdownProps) => {
  if (!text) return null;

  if (text.startsWith('⚠️')) {
    return (
      <div className="my-6 p-6 bg-red-100 border border-red-200 rounded-xl flex items-start gap-4 text-red-900 shadow-sm">
        <i className="fas fa-exclamation-triangle text-2xl text-red-500 mt-1"></i>
        <div>
          <h3 className="font-bold text-lg text-red-700 mb-1">Atenção</h3>
          <p className="text-sm leading-relaxed">{text.replace('⚠️', '').trim()}</p>
        </div>
      </div>
    );
  }

  const paragraphs = text.split('\n').map((line, i) => {
    // Optimization: Check for parallel line signature early
    const trimmed = line.trim();

    // Check if line looks like a reference line: (Ref1; Ref2)
    // It must start with '(' and end with ')' and contain at least one known book name (abbr or full)
    const hasParentheses = trimmed.startsWith('(') && trimmed.endsWith(')');
    let isParallelLine = false;

    if (hasParentheses) {
      // Check for abbreviations
      const hasAbbr = Object.keys(ABBREVIATION_MAP).some((abbr) => line.includes(abbr));
      // Check for full names (e.g., Mateus, Lucas, Gênesis)
      const hasFullName = BIBLE_BOOKS.some(
        (b) => line.includes(b.name) || line.includes(b.nameEn) || line.includes(b.nameEs)
      );

      if (hasAbbr || hasFullName) {
        isParallelLine = true;
      }
    }

    if (isParallelLine && onParallelClick) {
      const refs = line
        .replace(/[()]/g, '')
        .split(';')
        .map((s) => s.trim())
        .filter(s => s.length > 0);

      return <ParallelList key={i} refs={refs} onParallelClick={onParallelClick} />;
    }

    const parts = line.split(/(\*\*.*?\*\*)/g);
    return (
      <div
        key={i}
        className="mb-2 min-h-[1em] transition-all duration-300"
        data-paragraph-index={enableParagraphTracking ? i : undefined}
      >
        {parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            // Verse numbers - extract number for data-verse
            const verseText = part.slice(2, -2);
            const verseNum = parseInt(verseText.replace(/[^\d]/g, ''));
            return (
              <strong
                key={j}
                className="text-bible-accent font-bold mr-1"
                data-verse={isNaN(verseNum) ? undefined : verseNum}
              >
                {verseText}
              </strong>
            );
          }
          if (part.startsWith('# '))
            return (
              <h1
                key={j}
                className="text-3xl font-serif font-bold text-bible-text my-4 pb-2 border-b border-bible-border"
              >
                {part.substring(2)}
              </h1>
            );
          if (part.startsWith('## '))
            return (
              <h2 key={j} className="text-xl font-bold text-bible-text-light mt-6 mb-3">
                {part.substring(3)}
              </h2>
            );

          // Check for Strong codes formatted as Word<H1234> or Word <H1234>
          if (onStrongClick && part.includes('<')) {
            // Split by regex allowing for optional whitespace before the bracket
            const subParts = part.split(/([\wÀ-ÿ-]+\s*<[HG]\d+>)/g);
            return (
              <span key={j}>
                {subParts.map((sub, k) => {
                  const match = sub.match(/^([\wÀ-ÿ-]+)\s*<([HG]\d+)>$/);
                  if (match) {
                    const [, word, code] = match;
                    return (
                      <span
                        key={k}
                        onClick={() => onStrongClick(word, code)}
                        className="cursor-pointer border-b border-dotted border-bible-accent/50 hover:bg-bible-secondary hover:text-bible-accent transition-colors"
                        title={`Strong: ${code}`}
                      >
                        {word}
                      </span>
                    );
                  }
                  return <span key={k}>{sub}</span>;
                })}
              </span>
            );
          }

          return <span key={j}>{part}</span>;
        })}
      </div>
    );
  });

  return (
    <div className="text-bible-text leading-relaxed font-serif text-lg md:text-xl">
      {paragraphs}
    </div>
  );
});

export default SimpleMarkdown;
