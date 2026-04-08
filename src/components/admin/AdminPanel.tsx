import React, { useState } from 'react';
import { TokenUsageDashboard } from './TokenUsageDashboard';
import { functions } from '../../services/firebase';

type Tab = 'tokens' | 'maintenance';

const MaintenancePanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleCleanCache = async () => {
    if (!confirm('Limpar caches antigos do Firestore?')) return;
    setLoading(true);
    setResult(null);
    try {
      const fn = functions.httpsCallable('cleanOldCache');
      const res = await fn();
      const data = res.data as { message: string };
      setResult(`✅ ${data.message}`);
    } catch (e: any) {
      setResult(`❌ ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-bible-card border border-bible-border rounded-xl p-4">
        <h3 className="font-semibold text-bible-text mb-1">Limpeza de Cache</h3>
        <p className="text-xs text-bible-text-light mb-4">
          Remove entradas do Firestore sem data de expiração (obsoletas).
        </p>
        <button
          onClick={handleCleanCache}
          disabled={loading}
          className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
        >
          {loading ? 'Limpando…' : 'Limpar Cache Antigo'}
        </button>
      </div>
      {result && (
        <div className={`rounded-xl p-4 text-sm ${result.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {result}
        </div>
      )}
    </div>
  );
};

export const AdminPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = useState<Tab>('tokens');

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-bible-paper w-full max-w-4xl rounded-2xl shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-bible-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-bible-accent/10 rounded-lg flex items-center justify-center">
              <i className="fas fa-shield-alt text-bible-accent text-sm" />
            </div>
            <div>
              <h2 className="font-bold text-bible-text">Painel Admin</h2>
              <p className="text-xs text-bible-text-light">Acesso restrito</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-bible-hover rounded-lg text-bible-text-light transition"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-bible-border px-5">
          {([
            { id: 'tokens',      icon: 'fa-chart-bar',  label: 'Tokens & Custo' },
            { id: 'maintenance', icon: 'fa-tools',       label: 'Manutenção' },
          ] as { id: Tab; icon: string; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition -mb-px ${
                tab === t.id
                  ? 'border-bible-accent text-bible-accent font-semibold'
                  : 'border-transparent text-bible-text-light hover:text-bible-text'
              }`}
            >
              <i className={`fas ${t.icon} text-xs`} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5">
          {tab === 'tokens'      && <TokenUsageDashboard />}
          {tab === 'maintenance' && <MaintenancePanel />}
        </div>
      </div>
    </div>
  );
};
