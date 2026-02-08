import React from 'react';
import SimpleMarkdown from '../SimpleMarkdown';
import { AudioControls } from '../bible/AudioControls';
import { useLanguage } from '../../contexts/LanguageContext';

interface AnalysisViewProps {
  loading: boolean;
  content: string | null;
  type: 'theology' | 'studyGuide' | 'exegesis';
  onGenerate?: () => void;
  bookChapter?: string;
}

const typeLabels = {
  theology: { title: 'Teologia', icon: 'fa-cross', action: 'Gerar Análise Teológica', description: 'Explore os aspectos teológicos deste capítulo' },
  studyGuide: { title: 'Estudo', icon: 'fa-list-check', action: 'Gerar Guia de Estudo', description: 'Crie um guia completo para estudar este capítulo' },
  exegesis: { title: 'Exegese', icon: 'fa-scroll', action: 'Gerar Exegese', description: 'Análise profunda do texto bíblico original' }
};

export const AnalysisView: React.FC<AnalysisViewProps> = ({ loading, content, type, onGenerate, bookChapter }) => {
  const { t } = useLanguage();
  const labels = typeLabels[type];

  const formatShareText = () => {
    if (!content) return '';
    const appUrl = window.location.origin;
    const dateStr = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    const header = `*${labels.title} - ÉDEN*\nData: ${dateStr}\n`;

    return `${header}\n${content}\n\nVia App ÉDEN: ${appUrl}`;
  };

  const shareToSocial = (platform: 'whatsapp' | 'copy') => {
    const text = formatShareText();
    const encoded = encodeURIComponent(text);
    if (platform === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    } else if (platform === 'copy') {
      navigator.clipboard.writeText(text);
      alert(t('copied') || 'Copiado para a área de transferência!');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-70">
        <i className="fas fa-circle-notch fa-spin text-4xl text-bible-accent mb-4"></i>
        <p className="text-sm font-bold uppercase tracking-widest">
          {type === 'studyGuide'
            ? 'Gerando Estudo...'
            : type === 'theology'
              ? 'Analisando Teologia...'
              : 'Preparando Exegese...'}
        </p>
      </div>
    );
  }

  // Show generate button when no content
  if (!content && onGenerate) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="bg-bible-card border border-bible-border rounded-xl p-8 text-center max-w-md shadow-lg">
          <div className="w-16 h-16 bg-bible-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className={`fas ${labels.icon} text-2xl text-bible-accent`}></i>
          </div>
          <h3 className="text-xl font-bold text-bible-text mb-2">{labels.title}</h3>
          {bookChapter && (
            <p className="text-bible-text-light mb-4 text-sm">{bookChapter}</p>
          )}
          <p className="text-bible-text-light mb-6">{labels.description}</p>
          <button
            onClick={onGenerate}
            className="bg-bible-accent hover:bg-bible-accent-hover text-white font-bold py-3 px-6 rounded-lg transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            <i className={`fas ${labels.icon} mr-2`}></i>
            {labels.action}
          </button>
        </div>
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex justify-end mb-4">
        <AudioControls content={content} sourceId={type} type="generated" />
      </div>
      <SimpleMarkdown text={content} enableParagraphTracking={true} />

      <div className="flex justify-center gap-3 sm:gap-4 border-t border-bible-border pt-4 sm:pt-6 mt-6 sm:mt-8 pb-8">
        <button
          onClick={() => shareToSocial('whatsapp')}
          className="w-12 h-12 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
          title="Compartilhar no WhatsApp"
        >
          <i className="fab fa-whatsapp text-2xl"></i>
        </button>
        <button
          onClick={() => shareToSocial('copy')}
          className="w-12 h-12 rounded-full bg-bible-text text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
          title="Copiar"
        >
          <i className="fas fa-copy text-xl"></i>
        </button>
      </div>
    </div>
  );
};

