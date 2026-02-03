import React, { useEffect, useMemo, useRef, useState } from 'react';
import { exportToPNG } from '../lib/exportUtils';

export default function NFLAnytimeTDV2() {
  const [picks, setPicks] = useState([]);
  const [metadata, setMetadata] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tierFilter, setTierFilter] = useState('all');
  const [sortBy, setSortBy] = useState('edge');
  const exportRef = useRef(null);

  useEffect(() => {
    loadPicks(false);
  }, []);

  const loadPicks = async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);

      const url = forceRefresh ? '/api/nfl-anytime-td-v2?refresh=1' : '/api/nfl-anytime-td-v2';
      const response = await fetch(url);

      if (!response.ok) {
        // fallback to static file
        const fallback = await fetch('/data/nfl/nfl-anytime-td-v2-live.json');
        if (fallback.ok) {
          const data = await fallback.json();
          setPicks(data.picks || []);
          setMetadata(data.metadata || {});
        } else {
          setPicks([]);
          setMetadata({});
        }
        return;
      }

      const data = await response.json();
      setPicks(data.picks || []);
      setMetadata(data.metadata || {});

      if (forceRefresh) alert('✅ Refreshed successfully');
    } catch (e) {
      console.error('Error loading NFL Anytime TD v2 picks:', e);
      setPicks([]);
      if (forceRefresh) alert('❌ Refresh failed: ' + e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatOdds = (odds) => {
    const american = Number(odds);
    if (!Number.isFinite(american) || american === 0) return 'EVEN';
    return american > 0 ? `+${Math.round(american)}` : `${Math.round(american)}`;
  };

  const computeUnits = (kelly) => {
    // generator already outputs kelly fraction-ish; keep a simple cap similar to NBA
    const k = Number(kelly) || 0;
    const units = Math.max(0, k) * 400;
    return Math.round(Math.min(units, 6) * 10) / 10;
  };

  const tierBadge = (tier) => {
    const t = String(tier || '').toUpperCase();
    if (t.includes('TIER_1')) return { bg: '#fee2e2', fg: '#991b1b', label: t.replaceAll('_', ' ') };
    if (t.includes('TIER_2')) return { bg: '#ffedd5', fg: '#9a3412', label: t.replaceAll('_', ' ') };
    return { bg: '#e5e7eb', fg: '#374151', label: t ? t.replaceAll('_', ' ') : 'N/A' };
  };

  const filtered = useMemo(() => {
    const arr = [...(picks || [])];
    const tiered = tierFilter === 'all' ? arr : arr.filter(p => String(p.tier || '').toUpperCase() === tierFilter);

    return tiered.sort((a, b) => {
      if (sortBy === 'player') return String(a.player || '').localeCompare(String(b.player || ''));
      if (sortBy === 'prob') return (Number(b.modelProbability) || 0) - (Number(a.modelProbability) || 0);
      if (sortBy === 'kelly') return (Number(b.kelly) || 0) - (Number(a.kelly) || 0);
      // default edge
      return (Number(b.edge) || 0) - (Number(a.edge) || 0);
    });
  }, [picks, tierFilter, sortBy]);

  const exportCSV = () => {
    if (!filtered.length) return alert('No picks to export');

    const rows = [
      ['player','team','opponent','position','modelProbability','odds','impliedProbability','edge','kelly','units','book','tier','commenceTime']
    ];
    for (const p of filtered) {
      rows.push([
        p.player ?? '',
        p.team ?? '',
        p.opponent ?? '',
        p.position ?? '',
        p.modelProbability ?? '',
        p.odds ?? '',
        p.impliedProbability ?? '',
        p.edge ?? '',
        p.kelly ?? '',
        computeUnits(p.kelly),
        p.book ?? '',
        p.tier ?? '',
        p.commenceTime ?? ''
      ]);
    }

    const csv = rows
      .map(r => r.map(x => {
        const s = String(x ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replaceAll('"', '""')}"` : s;
      }).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nfl-anytime-td-v2-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPNG = async () => {
    if (!exportRef.current) return;
    if (!filtered.length) return alert('No picks to export');

    try {
      const filename = `nfl-anytime-td-v2-${new Date().toISOString().slice(0,10)}`;
      await exportToPNG(exportRef.current, filename, { scale: 2 });
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + error.message);
    }
  };

  const tiersForDropdown = useMemo(() => {
    const set = new Set((picks || []).map(p => String(p.tier || '').toUpperCase()).filter(Boolean));
    return Array.from(set).sort();
  }, [picks]);

  const lastUpdated = () => {
    const g = metadata.generated_at || metadata.generatedAt || metadata.generated;
    if (!g) return 'Unknown';
    try {
      return new Date(g).toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">NFL Anytime TD V2</h1>
          <div className="text-sm text-gray-600">
            Updated: <span className="font-medium">{lastUpdated()}</span>
            {metadata.date_from && metadata.date_to ? (
              <span> · Window: {metadata.date_from} → {metadata.date_to}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => loadPicks(true)}
            disabled={refreshing}
            className={`px-3 py-2 rounded-md text-sm font-medium border ${refreshing ? 'opacity-50' : 'hover:bg-gray-50'}`}
            title="Refresh pulls from /api/nfl-anytime-td-v2?refresh=1 (requires Netlify ODDS_API_KEY)">
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button onClick={exportCSV} className="px-3 py-2 rounded-md text-sm font-medium border hover:bg-gray-50">Export CSV</button>
          <button onClick={exportPNG} className="px-3 py-2 rounded-md text-sm font-medium border hover:bg-gray-50">Export PNG</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-600">Tier</div>
          <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className="border rounded-md px-2 py-1 text-sm">
            <option value="all">All</option>
            {tiersForDropdown.map(t => (
              <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-600">Sort</div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="border rounded-md px-2 py-1 text-sm">
            <option value="edge">Edge</option>
            <option value="kelly">Kelly</option>
            <option value="prob">Model Prob</option>
            <option value="player">Player</option>
          </select>
        </div>

        <div className="text-sm text-gray-600">
          Showing <span className="font-semibold">{filtered.length}</span> picks
          {metadata.total_games !== undefined ? <span> · Games: {metadata.total_games}</span> : null}
        </div>
      </div>

      {loading ? (
        <div className="text-gray-600">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border p-4 text-gray-700">
          No picks available for this window.
          <div className="text-sm text-gray-500 mt-1">
            If you just deployed, the daily generator may not have run yet.
          </div>
        </div>
      ) : (
        <div ref={exportRef} className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left p-2">Player</th>
                <th className="text-left p-2">Game</th>
                <th className="text-center p-2">Prob</th>
                <th className="text-center p-2">Odds</th>
                <th className="text-center p-2">Edge</th>
                <th className="text-center p-2">Units</th>
                <th className="text-left p-2">Book</th>
                <th className="text-left p-2">Tier</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => {
                const badge = tierBadge(p.tier);
                return (
                  <tr key={`${p.player}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="p-2">
                      <div className="font-semibold">{p.player}</div>
                      <div className="text-xs text-gray-500">{p.team}{p.position ? ` · ${p.position}` : ''}</div>
                    </td>
                    <td className="p-2">
                      <div>{p.team} vs {p.opponent}</div>
                      {p.commenceTime ? <div className="text-xs text-gray-500">{String(p.commenceTime)}</div> : null}
                    </td>
                    <td className="p-2 text-center font-medium">{((Number(p.modelProbability) || 0) * 100).toFixed(2)}%</td>
                    <td className="p-2 text-center font-medium">{formatOdds(p.odds)}</td>
                    <td className="p-2 text-center font-semibold text-green-700">{(Number(p.edge) || 0).toFixed(1)}%</td>
                    <td className="p-2 text-center font-semibold text-amber-600">{computeUnits(p.kelly).toFixed(1)}U</td>
                    <td className="p-2">{p.book || ''}</td>
                    <td className="p-2">
                      <span style={{ background: badge.bg, color: badge.fg }} className="inline-block px-2 py-1 rounded-full text-xs font-semibold">
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-500 mt-4">
        Refresh requires Netlify env var <code className="font-mono">ODDS_API_KEY</code>. The key is never stored in repo code.
      </div>
    </div>
  );
}
