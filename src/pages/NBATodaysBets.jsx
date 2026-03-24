import React, { useState, useEffect, useRef } from 'react';

/**
 * Today's NBA Bets - Aggregated Picks Across All Models
 * 
 * Sources:
 * 1. NBA Elite V2.1 - Game Predictions (Spread, Moneyline, Totals w/ V4 Kelly Staking)
 * 2. NBA Player Props V1 - Rebounds + Assists (Baseline model)
 * 3. NBA Player Props V2 - Phase 3.5 PRA (Logistic + LightGBM)
 * 
 * Smart Staking: Unit-based sizing with daily budget distribution
 * Export: PNG with BNGBets watermark
 */

// iOS detection and file sharing helpers
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const canShareFiles = () => {
  return navigator.share && navigator.canShare;
};

const saveCanvasAsPNG = async (canvas, filename) => {
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (isIOS() && canShareFiles()) {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename.replace('.png', '') });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
  }
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL();
  link.click();
};

// ─── Smart Staking Logic ────────────────────────────────────────────────────
// Assigns units based on source model confidence tier
function assignUnits(bet) {
  // If the source already provided units, use those
  if (bet.units && bet.units > 0) return bet.units;

  const edge = Math.abs(bet.edge || 0);
  
  // Tier-based staking
  if (edge >= 8) return 4;   // Max conviction
  if (edge >= 6) return 3;   // Strong
  if (edge >= 4) return 2;   // Standard
  if (edge >= 2) return 1;   // Light
  return 1;                   // Minimum
}

export default function NBATodaysBets() {
  const [allBets, setAllBets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [marketFilter, setMarketFilter] = useState('all');
  const [sources, setSources] = useState({
    elite: { loaded: false, count: 0, error: null },
    strongSignals: { loaded: false, count: 0, error: null },
    points: { loaded: false, count: 0, error: null },
  });

  useEffect(() => {
    loadAllSources();
  }, []);

  const loadAllSources = async () => {
    setLoading(true);
    const bets = [];
    const sourceStatus = { 
      elite: { loaded: false, count: 0, error: null },
      strongSignals: { loaded: false, count: 0, error: null },
      points: { loaded: false, count: 0, error: null },
    };

    // ─── 1. Elite V2.1 Game Predictions ──────────────────────────────────────
    try {
      const timestamp = Date.now();
      const eliteRes = await fetch(`/.netlify/functions/nba-predictions-elite-v2-1?_t=${timestamp}`);
      if (eliteRes.ok) {
        const data = await eliteRes.json();
        if (data.ok && data.predictions) {
          data.predictions.forEach(pred => {
            // Extract opportunities (spread, ML, total bets)
            pred.opportunities?.forEach(opp => {
              // Use edge in POINTS for spreads & totals (the meaningful metric).
              // Only moneyline uses edgePercent (win-probability edge).
              const isTotalMarket = opp.market === 'Total' || opp.market?.startsWith('Team Total');
              const isML = opp.market === 'Moneyline';
              const edgeVal = isML ? (opp.edgePercent || opp.edge || 0) : (parseFloat(opp.edge) || 0);
              // Elite V2.1 totals already filtered by calibration curve (>52.38% WR).
              // Only apply min-edge filter to non-total markets.
              if (!isTotalMarket && edgeVal < 2) return;

              const pickDisplay = opp.market === 'Moneyline' && opp.modelWinProb 
                ? `${opp.pick} (${opp.modelWinProb})`
                : opp.pick;

              bets.push({
                source: 'Elite V2.1',
                sourceShort: 'GAME',
                game: pred.game || `${pred.teams?.away?.abbreviation || '?'} @ ${pred.teams?.home?.abbreviation || '?'}`,
                market: opp.market || 'Unknown',
                pick: pickDisplay,
                line: opp.line || '',
                edge: edgeVal,
                odds: opp.odds || 0,
                book: opp.book || '',
                units: opp.units || 0,
                confidence: pred.prediction?.confidence || 0,
              });
            });
          });
          sourceStatus.elite = { loaded: true, count: bets.filter(b => b.source === 'Elite V2.1').length, error: null };
        }
      }
    } catch (err) {
      sourceStatus.elite = { loaded: false, count: 0, error: err.message };
    }

    // ─── 2. Props: Strong Signals + Aligned + Points (from /nba-props-aligned) ─
    // Replicates exact logic from NBAPropsAligned.jsx "Strong Signals" tab
    // + Phase 3.5 Points picks with 8%+ edge
    try {
      // Load both V1 and V2 JSONs
      const [v1Res, v2Res] = await Promise.all([
        fetch('/data/nba/nba-player-props-live.json'),
        fetch('/data/nba/nba-props-v2-live.json'),
      ]);
      const v1Data = v1Res.ok ? ((await v1Res.json()).predictions || []) : [];
      const v2Data = v2Res.ok ? (d => d.predictions || d.picks || [])(await v2Res.json()) : [];

      // ── Helper: create matching key (same as NBAPropsAligned) ──
      const createPickKey = (pick) => {
        const player = pick.player?.toLowerCase().trim();
        const propType = pick.propType?.toLowerCase();
        const line = pick.vegasLine || pick.line;
        const side = pick.betSide?.toUpperCase();
        return `${player}|${propType}|${line}|${side}`;
      };

      // ── Helper: get hit rate from V2's hitRates object ──
      const getHitRate = (pick, window) => {
        if (pick.hitRates) {
          const key = `L${window}_hitRate`;
          return pick.hitRates[key] !== undefined ? pick.hitRates[key] / 100 : null;
        }
        const overKey = `L${window}_over_pct`;
        if (pick[overKey] !== undefined) return pick[overKey];
        return null;
      };

      // ── Phase 3.5 criteria: L5 > 50% AND (L10 ≥ 60% OR L20 ≥ 60%) ──
      const meetsPhase35 = (pick) => {
        const l5 = getHitRate(pick, 5);
        const l10 = getHitRate(pick, 10);
        const l20 = getHitRate(pick, 20);
        if (l5 === null || l5 <= 0.50) return false;
        const l10Pass = l10 !== null && l10 >= 0.60;
        const l20Pass = l20 !== null && l20 >= 0.60;
        return l10Pass || l20Pass;
      };

      // ── Find aligned picks (both models agree) ──
      const v1Keys = new Map();
      v1Data.forEach(pick => v1Keys.set(createPickKey(pick), pick));

      const aligned = [];
      v2Data.forEach(v2Pick => {
        const key = createPickKey(v2Pick);
        if (v1Keys.has(key)) {
          aligned.push({ ...v2Pick, isAligned: true });
        }
      });

      // ── Strong Signals = Aligned + Phase 3.5 criteria ──
      const strongSignals = aligned.filter(meetsPhase35);

      strongSignals.forEach(pred => {
        const pt = (pred.propType || '').toLowerCase().replace('player_', '');
        const propLabel = pt === 'rebounds' ? 'Rebounds'
          : pt === 'assists' ? 'Assists'
          : pt === 'points' ? 'Points'
          : pt.charAt(0).toUpperCase() + pt.slice(1) || 'Prop';
        const shortMap = { rebounds: 'REB', assists: 'AST', points: 'PTS' };
        const line = pred.vegasLine ?? pred.line ?? '';

        bets.push({
          source: 'Strong Signal',
          sourceShort: shortMap[pt] || pt.toUpperCase().slice(0, 3),
          game: pred.game || `${pred.team} vs ${pred.opponent}`,
          market: propLabel,
          pick: `${pred.player} ${pred.betSide} ${line}`,
          line: line,
          edge: Math.abs(Number(pred.edge) || 0),
          odds: pred.odds || 0,
          book: pred.book || '',
          units: 0,
          confidence: pred.modelProbability || pred.confidence || 0,
        });
      });
      sourceStatus.strongSignals = { loaded: true, count: strongSignals.length, error: null };

      // ── Phase 3.5 Points (V2 only, 8%+ edge, Phase 3.5 criteria) ──
      // Exclude any points already included via strong signals
      const strongKeys = new Set(strongSignals.map(createPickKey));
      const pointsPicks = v2Data
        .filter(p => (p.propType || '').toLowerCase() === 'points')
        .filter(meetsPhase35)
        .filter(p => Math.abs(Number(p.edge) || 0) >= 8)
        .filter(p => !strongKeys.has(createPickKey(p)));

      pointsPicks.forEach(pred => {
        const line = pred.vegasLine ?? pred.line ?? '';
        bets.push({
          source: 'Points P3.5',
          sourceShort: 'PTS',
          game: pred.game || `${pred.team} vs ${pred.opponent}`,
          market: 'Points',
          pick: `${pred.player} ${pred.betSide} ${line}`,
          line: line,
          edge: Math.abs(Number(pred.edge) || 0),
          odds: pred.odds || 0,
          book: pred.book || '',
          units: 0,
          confidence: pred.modelProbability || pred.confidence || 0,
        });
      });
      sourceStatus.points = { loaded: true, count: pointsPicks.length, error: null };

    } catch (err) {
      sourceStatus.strongSignals = { loaded: false, count: 0, error: err.message };
      sourceStatus.points = { loaded: false, count: 0, error: err.message };
    }

    // ─── Smart Staking Pass ─────────────────────────────────────────────────
    bets.forEach(bet => {
      bet.units = assignUnits(bet);
    });

    // Sort by edge descending
    bets.sort((a, b) => b.edge - a.edge);

    setAllBets(bets);
    setSources(sourceStatus);
    setLoading(false);
  };

  // ─── Filters ──────────────────────────────────────────────────────────────
  const filteredBets = allBets
    .filter(b => sourceFilter === 'all' || b.source === sourceFilter)
    .filter(b => {
      if (marketFilter === 'all') return true;
      if (marketFilter === 'game') return ['Spread', 'Moneyline', 'Total'].includes(b.market);
      if (marketFilter === 'props') return ['Points', 'Rebounds', 'Assists'].includes(b.market);
      return b.market === marketFilter;
    });

  const totalUnits = Math.round(filteredBets.reduce((sum, b) => sum + (b.units || 0), 0) * 10) / 10;
  const totalBets = filteredBets.length;

  // ─── Format Helpers ───────────────────────────────────────────────────────
  const formatOdds = (odds) => {
    const n = Number(odds);
    if (!Number.isFinite(n) || n === 0) return 'EVEN';
    return n > 0 ? `+${Math.round(n)}` : `${Math.round(n)}`;
  };

  const getSourceColor = (source) => {
    switch (source) {
      case 'Elite V2.1': return '#3b82f6';
      case 'Strong Signal': return '#8b5cf6';
      case 'Points P3.5': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getEdgeTier = (edge) => {
    if (edge >= 8) return { label: '🔥 FIRE', color: '#ef4444', bg: '#fef2f2' };
    if (edge >= 6) return { label: '💪 STRONG', color: '#f59e0b', bg: '#fffbeb' };
    if (edge >= 4) return { label: '✅ SOLID', color: '#10b981', bg: '#ecfdf5' };
    return { label: '📊 LEAN', color: '#6b7280', bg: '#f9fafb' };
  };

  // ─── PNG Export ───────────────────────────────────────────────────────────
  const exportPNG = async () => {
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const today = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', month: 'long', day: 'numeric' 
      });
      const dateSlug = new Date().toISOString().split('T')[0];

      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      document.body.appendChild(container);

      const exportDiv = document.createElement('div');
      exportDiv.style.background = '#0f172a';
      exportDiv.style.padding = '30px';
      exportDiv.style.width = '900px';
      exportDiv.style.fontFamily = 'system-ui, -apple-system, sans-serif';

      // Build table rows
      const betsToExport = filteredBets.slice(0, 40); // Cap at 40 for readability
      const rows = betsToExport.map((bet, idx) => {
        const tier = getEdgeTier(bet.edge);
        const oddsStr = formatOdds(bet.odds);
        const bgColor = idx % 2 === 0 ? '#1e293b' : '#0f172a';
        return `
          <tr style="background: ${bgColor};">
            <td style="padding: 10px 12px; border-bottom: 1px solid #334155; color: #e2e8f0; font-size: 12px;">
              <span style="background: ${getSourceColor(bet.source)}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">${bet.sourceShort}</span>
            </td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #334155; color: #e2e8f0; font-size: 12px;">${bet.game}</td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #334155; color: #94a3b8; font-size: 12px;">${bet.market}</td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #334155; color: #f1f5f9; font-size: 12px; font-weight: 600;">${bet.pick}</td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #334155; text-align: center; color: ${tier.color}; font-size: 12px; font-weight: 700;">${bet.edge.toFixed(1)}%</td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #334155; text-align: center; color: #e2e8f0; font-size: 12px;">${oddsStr}</td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #334155; text-align: center; color: #22c55e; font-size: 13px; font-weight: 700;">${bet.units}U</td>
          </tr>
        `;
      }).join('');

      exportDiv.innerHTML = `
        <div>
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #334155;">
            <h1 style="font-size: 28px; font-weight: 800; margin: 0 0 6px 0; color: #f1f5f9;">🏀 Today's NBA Bets</h1>
            <p style="font-size: 14px; color: #94a3b8; margin: 0;">${today} • ${betsToExport.length} Picks • ${Math.round(betsToExport.reduce((s, b) => s + b.units, 0) * 10) / 10} Total Units</p>
          </div>

          <!-- Table -->
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #1e293b;">
                <th style="padding: 10px 12px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #334155;">Source</th>
                <th style="padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #334155;">Game</th>
                <th style="padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #334155;">Market</th>
                <th style="padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #334155;">Pick</th>
                <th style="padding: 10px 8px; text-align: center; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #334155;">Edge</th>
                <th style="padding: 10px 8px; text-align: center; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #334155;">Odds</th>
                <th style="padding: 10px 8px; text-align: center; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #334155;">Units</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <!-- Watermark -->
          <div style="margin-top: 20px; text-align: center;">
            <span style="font-size: 14px; font-weight: 700; color: #475569; letter-spacing: 2px;">BNGBets</span>
          </div>
        </div>
      `;

      container.appendChild(exportDiv);
      const canvas = await html2canvas(exportDiv, { scale: 2, backgroundColor: '#0f172a', logging: false });
      await saveCanvasAsPNG(canvas, `NBA_Bets_${dateSlug}.png`);
      document.body.removeChild(container);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to generate PNG. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏀</div>
          <div style={{ fontSize: '20px', fontWeight: 600 }}>Loading Today's Bets...</div>
          <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '8px' }}>Aggregating picks from all NBA models</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        
        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 800, margin: '0 0 8px 0' }}>
            <span>🏀 </span>
            <span style={{ background: 'linear-gradient(135deg, #3b82f6, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Today's NBA Bets</span>
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: '0 0 4px 0' }}>
            Aggregated picks from all NBA models • Smart unit staking
          </p>
          <p style={{ fontSize: '12px', color: '#64748b' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* ── Source Status Cards ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {[
            { key: 'elite', label: 'Elite V2.1', emoji: '⭐', color: '#3b82f6', desc: 'Spread • ML • Totals' },
            { key: 'strongSignals', label: 'Strong Signals', emoji: '🎯', color: '#8b5cf6', desc: 'Aligned R+A Props' },
            { key: 'points', label: 'Points P3.5', emoji: '🏀', color: '#10b981', desc: 'Phase 3.5 Points (8%+)' },
          ].map(s => (
            <div key={s.key} style={{
              background: '#1e293b', borderRadius: '12px', padding: '16px',
              border: `1px solid ${sources[s.key].loaded ? s.color + '40' : '#334155'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: s.color }}>{s.emoji} {s.label}</span>
                <span style={{
                  fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
                  background: sources[s.key].loaded ? '#16a34a20' : '#ef444420',
                  color: sources[s.key].loaded ? '#22c55e' : '#ef4444',
                }}>{sources[s.key].loaded ? '✓ LIVE' : '✗ FAIL'}</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9' }}>{sources[s.key].count}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>{s.desc}</div>
            </div>
          ))}

          {/* Summary Card */}
          <div style={{
            background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: '12px', padding: '16px',
            border: '1px solid #334155',
          }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#f59e0b', marginBottom: '8px' }}>📊 Today's Summary</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9' }}>{totalBets} picks</div>
            <div style={{ fontSize: '13px', color: '#22c55e', fontWeight: 600 }}>{totalUnits} total units</div>
          </div>
        </div>

        {/* ── Filters & Export ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
          {/* Source Filter */}
          <div style={{ display: 'flex', gap: '4px', background: '#1e293b', borderRadius: '8px', padding: '4px' }}>
            {[
              { value: 'all', label: 'All Sources' },
              { value: 'Elite V2.1', label: '⭐ Elite' },
              { value: 'Strong Signal', label: '🎯 Strong' },
              { value: 'Points P3.5', label: '🏀 Points' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setSourceFilter(opt.value)}
                style={{
                  padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 600, transition: 'all 0.2s',
                  background: sourceFilter === opt.value ? '#3b82f6' : 'transparent',
                  color: sourceFilter === opt.value ? 'white' : '#94a3b8',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Market Filter */}
          <div style={{ display: 'flex', gap: '4px', background: '#1e293b', borderRadius: '8px', padding: '4px' }}>
            {[
              { value: 'all', label: 'All Markets' },
              { value: 'game', label: 'Game Bets' },
              { value: 'props', label: 'Player Props' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setMarketFilter(opt.value)}
                style={{
                  padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 600, transition: 'all 0.2s',
                  background: marketFilter === opt.value ? '#10b981' : 'transparent',
                  color: marketFilter === opt.value ? 'white' : '#94a3b8',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Export Button */}
          <button
            onClick={exportPNG}
            disabled={exporting || filteredBets.length === 0}
            style={{
              marginLeft: 'auto',
              padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: 700,
              background: exporting ? '#334155' : 'linear-gradient(135deg, #3b82f6, #10b981)',
              color: 'white',
              opacity: filteredBets.length === 0 ? 0.5 : 1,
            }}
          >
            {exporting ? '⏳ Exporting...' : '📸 Export PNG'}
          </button>
        </div>

        {/* ── Bets Table ──────────────────────────────────────────────────────── */}
        {filteredBets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏀</div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>No bets available</div>
            <div style={{ fontSize: '14px', marginTop: '8px' }}>Check back when games are loaded for today's slate</div>
          </div>
        ) : (
          <div style={{ background: '#1e293b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #334155' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0f172a' }}>
                  <th style={{ padding: '12px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Source</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Game</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Market</th>
                  <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Pick</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Edge</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Odds</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Book</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Units</th>
                </tr>
              </thead>
              <tbody>
                {filteredBets.map((bet, idx) => {
                  const tier = getEdgeTier(bet.edge);
                  return (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#1e293b' : '#172033', borderBottom: '1px solid #334155', transition: 'background 0.15s' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          background: getSourceColor(bet.source), color: 'white',
                          padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
                        }}>{bet.sourceShort}</span>
                      </td>
                      <td style={{ padding: '10px 10px', color: '#e2e8f0', fontSize: '13px' }}>{bet.game}</td>
                      <td style={{ padding: '10px 10px', color: '#94a3b8', fontSize: '12px' }}>{bet.market}</td>
                      <td style={{ padding: '10px 10px', color: '#f1f5f9', fontSize: '13px', fontWeight: 600 }}>{bet.pick}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '12px', fontWeight: 700, color: tier.color,
                          background: tier.bg + '20', padding: '2px 8px', borderRadius: '4px',
                        }}>{bet.edge.toFixed(1)}%</span>
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', color: '#e2e8f0', fontSize: '12px' }}>{formatOdds(bet.odds)}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>{bet.book}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        <span style={{
                          color: '#22c55e', fontWeight: 800, fontSize: '14px',
                        }}>{bet.units}U</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Footer Summary ──────────────────────────────────────────────────── */}
        <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          {[
            { label: 'Total Picks', value: totalBets, color: '#3b82f6' },
            { label: 'Total Units', value: totalUnits, color: '#22c55e' },
            { label: '🔥 Fire (8%+)', value: filteredBets.filter(b => b.edge >= 8).length, color: '#ef4444' },
            { label: '💪 Strong (6%+)', value: filteredBets.filter(b => b.edge >= 6).length, color: '#f59e0b' },
            { label: '✅ Solid (4%+)', value: filteredBets.filter(b => b.edge >= 4).length, color: '#10b981' },
          ].map((stat, idx) => (
            <div key={idx} style={{ background: '#1e293b', borderRadius: '8px', padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>{stat.label}</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* ── Watermark ───────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #1e293b' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155', letterSpacing: '2px' }}>BNGBets</span>
        </div>
      </div>
    </div>
  );
}
