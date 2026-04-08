import React, { useState, useCallback } from 'react';
import { getTokenUsageStats, TokenUsageStats } from '../../services/geminiService';

// Taxa de câmbio USD → BRL (atualize conforme necessário)
const USD_TO_BRL = 5.75;

const fmt = (n: number) => n.toLocaleString('pt-BR');
const fmtBRL = (usd: number) => {
  const brl = usd * USD_TO_BRL;
  if (brl < 0.01) return `R$ ${(brl * 100).toFixed(4)}¢`;
  return brl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4 });
};

const Card: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({
  label, value, sub, color = 'text-bible-accent',
}) => (
  <div className="bg-bible-card border border-bible-border rounded-xl p-4 flex flex-col gap-1">
    <span className="text-xs text-bible-text-light uppercase tracking-wide">{label}</span>
    <span className={`text-2xl font-bold font-mono ${color}`}>{value}</span>
    {sub && <span className="text-xs text-bible-text-light">{sub}</span>}
  </div>
);

type Row = { name: string; tokens: number; costUSD: number; calls: number };

const Table: React.FC<{ title: string; rows: Row[] }> = ({ title, rows }) => {
  const sorted = [...rows].sort((a, b) => b.costUSD - a.costUSD);
  const max = sorted[0]?.costUSD || 1;
  return (
    <div className="bg-bible-card border border-bible-border rounded-xl p-4">
      <h3 className="font-semibold text-bible-text mb-3 text-sm uppercase tracking-wide">{title}</h3>
      <div className="space-y-2">
        {sorted.map(row => (
          <div key={row.name}>
            <div className="flex justify-between items-center text-xs mb-0.5">
              <span className="font-mono text-bible-text truncate max-w-[60%]">{row.name}</span>
              <div className="flex gap-3 text-right text-bible-text-light">
                <span>{fmt(row.tokens)} tok</span>
                <span>{row.calls} calls</span>
                <span className="text-bible-accent font-semibold w-20 text-right">{fmtBRL(row.costUSD)}</span>
              </div>
            </div>
            <div className="w-full bg-bible-border/30 rounded-full h-1.5">
              <div
                className="bg-bible-accent h-1.5 rounded-full transition-all"
                style={{ width: `${(row.costUSD / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="text-bible-text-light text-xs text-center py-4">Sem dados</p>
        )}
      </div>
    </div>
  );
};

const DailyTable: React.FC<{ byDay: TokenUsageStats['byDay'] }> = ({ byDay }) => {
  const rows = Object.entries(byDay)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="bg-bible-card border border-bible-border rounded-xl p-4">
      <h3 className="font-semibold text-bible-text mb-3 text-sm uppercase tracking-wide">Por dia</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-bible-text-light border-b border-bible-border">
              <th className="text-left pb-2">Data</th>
              <th className="text-right pb-2">Tokens</th>
              <th className="text-right pb-2">Calls</th>
              <th className="text-right pb-2">Custo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.date} className="border-b border-bible-border/30 hover:bg-bible-hover/30">
                <td className="py-1.5 font-mono">{r.date}</td>
                <td className="py-1.5 text-right">{fmt(r.tokens)}</td>
                <td className="py-1.5 text-right">{r.calls}</td>
                <td className="py-1.5 text-right text-bible-accent font-semibold">{fmtBRL(r.costUSD)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-4 text-bible-text-light">Sem dados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const TokenUsageDashboard: React.FC = () => {
  const now = new Date();
  const currentMonth = now.toISOString().substring(0, 7);

  const [month, setMonth] = useState(currentMonth);
  const [stats, setStats] = useState<TokenUsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTokenUsageStats('month', m);
      setStats(data);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar estatísticas');
    } finally {
      setLoading(false);
    }
  }, []);

  // Carrega mês atual na primeira renderização
  React.useEffect(() => { load(currentMonth); }, []);

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMonth(e.target.value);
    load(e.target.value);
  };

  const functionRows: Row[] = stats
    ? Object.entries(stats.byFunction).map(([name, v]) => ({ name, ...v }))
    : [];

  const userRows: Row[] = stats
    ? Object.entries(stats.byUser).map(([name, v]) => ({
        name: name === 'guest' ? '👤 guest (não logado)' : `🔑 ${name.slice(0, 12)}…`,
        ...v,
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Header + filtro */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-bible-text">Consumo de Tokens</h2>
          <p className="text-xs text-bible-text-light mt-0.5">Custo estimado em R$ (USD × {USD_TO_BRL.toFixed(2)}) — preços oficiais Gemini</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-bible-text-light">Mês:</label>
          <input
            type="month"
            value={month}
            max={currentMonth}
            onChange={handleMonthChange}
            className="text-sm border border-bible-border rounded-lg px-3 py-1.5 bg-bible-card text-bible-text focus:outline-none focus:ring-2 focus:ring-bible-accent"
          />
          <button
            onClick={() => load(month)}
            disabled={loading}
            className="px-3 py-1.5 text-xs bg-bible-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? '…' : 'Atualizar'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {loading && !stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-bible-card border border-bible-border rounded-xl p-4 h-20 animate-pulse" />
          ))}
        </div>
      )}

      {stats && (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card
              label="Custo estimado"
              value={fmtBRL(stats.totalCostUSD)}
              sub={`em ${stats.value}`}
              color="text-green-600"
            />
            <Card
              label="Total de tokens"
              value={fmt(stats.totalTokens)}
              sub="prompt + resposta"
            />
            <Card
              label="Chamadas à IA"
              value={fmt(stats.callCount)}
              sub="requisições Gemini"
            />
            <Card
              label="Custo médio/call"
              value={fmtBRL(stats.callCount > 0 ? stats.totalCostUSD / stats.callCount : 0)}
              sub="por chamada"
            />
          </div>

          {/* Por função e por usuário */}
          <div className="grid md:grid-cols-2 gap-4">
            <Table title="Por feature (função)" rows={functionRows} />
            <Table title="Por usuário" rows={userRows} />
          </div>

          {/* Por dia */}
          <DailyTable byDay={stats.byDay} />
        </>
      )}
    </div>
  );
};
