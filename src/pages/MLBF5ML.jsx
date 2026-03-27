import React, { useState, useEffect } from 'react';

// ── iOS detection + share sheet helpers ─────────────────────
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const canShareFiles = () => navigator.share && navigator.canShare;

const saveCanvasAsPNG = async (canvas, filename) => {
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  if (isIOS() && canShareFiles()) {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename.replace('.png', '') }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const a = document.createElement('a');
  a.download = filename;
  a.href = canvas.toDataURL();
  a.click();
};

// ── Formatting helpers ──────────────────────────────────────
const fmtOdds = (am) => {
  if (am == null || isNaN(am)) return '—';
  return am > 0 ? `+${am}` : `${am}`;
};
const pct = (v, d = 1) => (v == null || isNaN(v)) ? '—' : `${(v * 100).toFixed(d)}%`;
const edgeBadge = (edge) => {
  if (edge == null) return null;
  const e = edge * 100;
  if (e >= 15) return { label: 'A+', color: '#10b981' };
  if (e >= 12) return { label: 'A',  color: '#22c55e' };
  if (e >= 9)  return { label: 'B+', color: '#84cc16' };
  if (e >= 7)  return { label: 'B',  color: '#eab308' };
  return { label: 'C', color: '#f97316' };
};

const MLBF5ML = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { fetchPicks(); }, []);

  const fetchPicks = async () => {
    try {
      setLoading(true);
      setError(null);
      const ts = Date.now();
      const res = await fetch(`/.netlify/functions/f5-ml-latest?_t=${ts}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Bad response');
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Export as PNG ─────────────────────────────────────────
  const exportPNG = async () => {
    if (!data?.picks?.length) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const today = data.game_date || new Date().toISOString().slice(0, 10);

      const container = document.createElement('div');
      container.style.cssText = 'position:absolute;left:-9999px;top:0;';
      document.body.appendChild(container);

      const wrap = document.createElement('div');
      wrap.style.cssText = 'background:#0a0e27;padding:30px;width:900px;font-family:Helvetica,Arial,sans-serif;color:#e2e8f0;';

      let html = `
        <h1 style="text-align:center;font-size:26px;margin-bottom:4px;color:#38bdf8;">MLB F5 Moneyline Picks</h1>
        <p style="text-align:center;font-size:13px;color:#94a3b8;margin-bottom:20px;">${today} &bull; ${data.run_label || 'latest'} &bull; Model ${data.model_id || 'f5_ml_v2'}</p>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#1e293b;color:#94a3b8;">
              <th style="padding:10px 8px;text-align:left;border-bottom:2px solid #334155;">Pick</th>
              <th style="padding:10px 8px;text-align:center;border-bottom:2px solid #334155;">Odds</th>
              <th style="padding:10px 8px;text-align:center;border-bottom:2px solid #334155;">Model %</th>
              <th style="padding:10px 8px;text-align:center;border-bottom:2px solid #334155;">Edge</th>
              <th style="padding:10px 8px;text-align:center;border-bottom:2px solid #334155;">EV</th>
              <th style="padding:10px 8px;text-align:center;border-bottom:2px solid #334155;">Grade</th>
              <th style="padding:10px 8px;text-align:right;border-bottom:2px solid #334155;">Stake</th>
            </tr>
          </thead><tbody>`;

      data.picks.forEach((p, i) => {
        const bg = i % 2 === 0 ? '#0f172a' : '#1e293b';
        const badge = edgeBadge(p.edge);
        html += `
          <tr style="background:${bg};">
            <td style="padding:8px;border-bottom:1px solid #334155;">${p.bet_label}</td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid #334155;color:#38bdf8;">${fmtOdds(p.odds_american)}</td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid #334155;">${pct(p.p_model)}</td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid #334155;">${pct(p.edge)}</td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid #334155;color:#22c55e;">${pct(p.ev)}</td>
            <td style="padding:8px;text-align:center;border-bottom:1px solid #334155;"><span style="background:${badge?.color || '#555'};color:#000;padding:2px 8px;border-radius:4px;font-weight:700;">${badge?.label || '—'}</span></td>
            <td style="padding:8px;text-align:right;border-bottom:1px solid #334155;">$${p.stake}</td>
          </tr>`;
      });

      html += '</tbody></table>';
      html += `<p style="text-align:center;font-size:11px;color:#475569;margin-top:16px;">F5 ML v2 &bull; Consensus pricing &bull; ${data.picks.length} picks</p>`;
      html += `<p style="text-align:center;font-size:13px;color:#64748b;margin-top:6px;font-weight:600;letter-spacing:1px;">BNGBets</p>`;
      wrap.innerHTML = html;
      container.appendChild(wrap);

      const canvas = await html2canvas(wrap, { backgroundColor: '#0a0e27', scale: 2 });
      await saveCanvasAsPNG(canvas, `F5_ML_Picks_${today}.png`);
      document.body.removeChild(container);
    } catch (e) {
      console.error('Export error:', e);
    } finally {
      setExporting(false);
    }
  };

  // ── LOADING STATE ─────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: '#0a0e27', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#9918;</div>
          <div style={{ fontSize: 18 }}>Loading F5 ML picks…</div>
        </div>
      </div>
    );
  }

  // ── ERROR STATE ───────────────────────────────────────────
  if (error) {
    return (
      <div style={{ background: '#0a0e27', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', color: '#ef4444', maxWidth: 400 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#9888;&#65039;</div>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Error loading picks</div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{error}</div>
          <button onClick={fetchPicks} style={{ marginTop: 16, padding: '8px 20px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Retry</button>
        </div>
      </div>
    );
  }

  // ── OFFSEASON / NO DATA ───────────────────────────────────
  if (data?.offseason || !data?.picks?.length) {
    const ranToday = data?.game_date && !data?.offseason;
    const reason = data?.meta?.reason || '';
    return (
      <div style={{ background: '#0a0e27', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8', maxWidth: 450 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>&#9918;</div>
          <h2 style={{ fontSize: 22, color: '#e2e8f0', marginBottom: 8 }}>
            {ranToday ? 'No Qualifying Picks Today' : 'No F5 ML Picks Today'}
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            {ranToday
              ? `The model ran for ${data.game_date} (${data.run_label || 'latest'}) but no picks met the EV ≥ 10% / Edge ≥ 7% thresholds.${reason ? ' (' + reason + ')' : ''} Check back before the next slate.`
              : (data?.message || 'F5 ML picks will be available once enough 2026 season data has been collected. Check back soon!')}
          </p>
          {ranToday && data?.meta?.games_scored != null && (
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
              Games scored: {data.meta.games_scored} / {data.meta.games_on_slate || '?'}
            </p>
          )}
          <button onClick={fetchPicks} style={{ marginTop: 20, padding: '8px 20px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // ── MAIN RENDER ───────────────────────────────────────────
  const picks = data.picks;
  const meta  = data.meta || {};
  const sched = data.schedule_context || {};
  const gameDate = data.game_date || '—';
  const runLabel = data.run_label || 'latest';
  const updatedAt = data.generated_at ? new Date(data.generated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '';

  return (
    <div style={{ background: '#0a0e27', minHeight: '100vh', color: '#e2e8f0', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {/* ── Header ────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#38bdf8' }}>
            MLB F5 Moneyline
          </h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>
            {gameDate} &bull; <span style={{ textTransform: 'capitalize' }}>{runLabel.replace('_', ' ')}</span> run
            {sched.games_on_slate ? ` &bull; ${sched.games_on_slate} games` : ''}
          </p>
          {updatedAt && (
            <p style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
              Updated {updatedAt}
              {sched.first_pitch_et ? ` · First pitch ${sched.first_pitch_et} ET` : ''}
            </p>
          )}
        </div>

        {/* ── Stats bar ─────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Picks', value: picks.length },
            { label: 'Games Scored', value: meta.games_scored || '—' },
            { label: 'Best EV', value: picks.length ? pct(Math.max(...picks.map(p => p.ev))) : '—' },
            { label: 'Avg Edge', value: picks.length ? pct(picks.reduce((s, p) => s + p.edge, 0) / picks.length) : '—' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#38bdf8' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Export button ──────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <button
            onClick={exportPNG}
            disabled={exporting}
            style={{
              padding: '10px 24px', background: exporting ? '#334155' : '#1e40af',
              color: '#fff', border: 'none', borderRadius: 8, cursor: exporting ? 'default' : 'pointer',
              fontWeight: 600, fontSize: 14,
            }}
          >
            {exporting ? 'Exporting…' : 'Export as PNG'}
          </button>
          <button
            onClick={fetchPicks}
            style={{
              marginLeft: 12, padding: '10px 24px', background: '#1e293b',
              color: '#94a3b8', border: '1px solid #334155', borderRadius: 8, cursor: 'pointer',
              fontWeight: 600, fontSize: 14,
            }}
          >
            Refresh
          </button>
        </div>

        {/* ── Picks grid ────────────────────────────── */}
        <div style={{ display: 'grid', gap: 12 }}>
          {picks.map((p, i) => {
            const badge = edgeBadge(p.edge);
            return (
              <div key={p.pick_id || i} style={{
                background: '#1e293b', borderRadius: 10, padding: '16px 20px',
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
                border: '1px solid #334155',
              }}>
                {/* Left: pick info */}
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{p.bet_label}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {p.home_team} vs {p.away_team}
                    {p.game_date && ` · ${p.game_date}`}
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                    <Stat label="Odds" value={fmtOdds(p.odds_american)} color="#38bdf8" />
                    <Stat label="Model" value={pct(p.p_model)} />
                    <Stat label="Edge" value={pct(p.edge)} color={badge?.color} />
                    <Stat label="EV" value={pct(p.ev)} color="#22c55e" />
                    <Stat label="Profit" value={`$${p.potential_profit?.toFixed(0) || '—'}`} />
                  </div>
                </div>

                {/* Right: grade badge */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: `${badge?.color || '#555'}22`,
                    border: `2px solid ${badge?.color || '#555'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 18, color: badge?.color || '#aaa',
                  }}>
                    {badge?.label || '—'}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>${p.stake} unit</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer ────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginTop: 32, color: '#475569', fontSize: 12 }}>
          <p>F5 ML v2 · Consensus Pricing · EV &ge; 10% · Edge &ge; 7%</p>
          <p style={{ marginTop: 4, fontWeight: 600, letterSpacing: '1px' }}>BNGBets</p>
        </div>
      </div>
    </div>
  );
};

// ── Tiny stat component ───────────────────────────────────
const Stat = ({ label, value, color }) => (
  <div>
    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: color || '#e2e8f0' }}>{value}</div>
  </div>
);

export default MLBF5ML;
