import React, { useState } from 'react';
import { LocationResult } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';

interface LocationsViewProps {
  loading: boolean;
  result: LocationResult | null;
  customQuery: string;
  onQueryChange: (val: string) => void;
  onSearch: () => void;
  onGenerate?: () => void;
  bookChapter?: string;
}

export const LocationsView: React.FC<LocationsViewProps> = ({
  loading,
  result,
  customQuery,
  onQueryChange,
  onSearch,
  onGenerate,
  bookChapter
}) => {
  const { t } = useLanguage();
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

  // Show generate button when no result and not loading
  if (!result && !loading && onGenerate) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="bg-bible-card border border-bible-border rounded-xl p-8 text-center max-w-md shadow-lg">
          <div className="w-16 h-16 bg-bible-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-map-location-dot text-2xl text-bible-accent"></i>
          </div>
          <h3 className="text-xl font-bold text-bible-text mb-2">Mapas Bíblicos</h3>
          {bookChapter && (
            <p className="text-bible-text-light mb-4 text-sm">{bookChapter}</p>
          )}
          <p className="text-bible-text-light mb-6">Visualize os locais mencionados neste capítulo em um mapa gerado por IA</p>
          <button
            onClick={onGenerate}
            className="bg-bible-accent hover:bg-bible-accent-hover text-white font-bold py-3 px-6 rounded-lg transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            <i className="fas fa-map-location-dot mr-2"></i>
            Gerar Mapa
          </button>
        </div>

        {/* Custom search section below */}
        <div className="mt-8 w-full max-w-md">
          <p className="text-sm text-bible-text-light mb-2 text-center">Ou pesquise um local específico:</p>
          <div className="flex gap-2">
            <input
              value={customQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              className="border border-bible-border p-2 rounded flex-1 bg-bible-card text-bible-text"
              placeholder={t('maps')}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            />
            <button onClick={onSearch} className="bg-bible-accent text-white px-4 rounded">
              Ir
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          value={customQuery}
          onChange={(e) => onQueryChange(e.target.value)}
          className="border p-2 rounded flex-1"
          placeholder={t('maps')}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
        />
        <button onClick={onSearch} className="bg-bible-accent text-white px-4 rounded">
          Go
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-10 opacity-70">
          <i className="fas fa-circle-notch fa-spin text-4xl text-bible-accent mb-4"></i>
          <p className="text-sm font-bold uppercase tracking-widest">{t('loading')}</p>
        </div>
      )}

      {!loading && result?.mapUrl && (
        <div className="mb-6 rounded-xl overflow-hidden shadow-lg border border-bible-border relative group">
          <img
            src={result.mapUrl}
            alt="Mapa Bíblico"
            className="w-full h-auto object-cover cursor-zoom-in"
            onClick={() => setFullScreenImage(result.mapUrl!)}
            loading="lazy"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity text-center">
            Gerado por IA
          </div>
          <button
            onClick={() => setFullScreenImage(result.mapUrl!)}
            className="absolute top-2 right-2 bg-bible-card/80 p-2 rounded-full text-bible-text hover:bg-bible-card"
          >
            <i className="fas fa-expand"></i>
          </button>
        </div>
      )}

      {!loading &&
        result &&
        result.locations.map((l, i) => (
          <div key={i} className="mb-4">
            <h3 className="font-bold">{l.biblicalName}</h3>
            <p>{l.description}</p>
          </div>
        ))}

      {fullScreenImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center cursor-zoom-out"
          onClick={() => setFullScreenImage(null)}
        >
          <img src={fullScreenImage} className="max-w-full max-h-full p-4" alt="Full Screen Map" />

          {/* Botão de Download */}
          <a
            href={fullScreenImage}
            download={`eden_bible_map_${Date.now()}.png`}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/10 hover:bg-white/20 backdrop-blur text-white px-6 py-3 rounded-full flex items-center gap-2 transition-all border border-white/20 shadow-lg group pointer-events-auto"
          >
            <i className="fas fa-download group-hover:scale-110 transition-transform"></i>
            <span className="font-bold text-sm tracking-wide">BAIXAR MAPA</span>
          </a>
        </div>
      )}
    </div>
  );
};

