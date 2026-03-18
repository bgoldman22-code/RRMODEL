/**
 * NBA Aggregator Daily Save — Scheduled Function
 * 
 * Runs daily at noon ET (17:00 UTC) via Netlify cron.
 * Calls the same endpoints as NBATodaysBets.jsx, merges all picks,
 * applies smart staking, and saves the full snapshot to Netlify Blobs
 * keyed by date:  nba-aggregator/{YYYY-MM-DD}.json
 * 
 * Also maintains a rolling index at  nba-aggregator/_index.json
 * so we can list all available dates without scanning.
 * 
 * Blob store: "nba-aggregator"
 */

import { getStore } from '@netlify/blobs';
import fetch from 'node-fetch';

// ─── Config ─────────────────────────────────────────────────────────────────
const SITE = process.env.URL || 'https://bgroundrobin.com';
const STORE_NAME = 'nba-aggregator';

// ─── Smart Staking (mirrors NBATodaysBets.jsx) ─────────────────────────────
function assignUnits(bet) {
  if (bet.units && bet.units > 0) return bet.units;
  const edge = Math.abs(bet.edge || 0);
  if (edge >= 8) return 4;
  if (edge >= 6) return 3;
  if (edge >= 4) return 2;
  return 1;
}

// ─── Helpers (mirror NBATodaysBets.jsx prop logic) ──────────────────────────
function createPickKey(pick) {
  const player = (pick.player || '').toLowerCase().trim();
  const propType = (pick.propType || '').toLowerCase();
  const line = pick.vegasLine || pick.line;
  const side = (pick.betSide || '').toUpperCase();
  return `${player}|${propType}|${line}|${side}`;
}

function getHitRate(pick, window) {
  if (pick.hitRates) {
    const key = `L${window}_hitRate`;
    return pick.hitRates[key] !== undefined ? pick.hitRates[key] / 100 : null;
  }
  const overKey = `L${window}_over_pct`;
  if (pick[overKey] !== undefined) return pick[overKey];
  return null;
}

function meetsPhase35(pick) {
  const l5 = getHitRate(pick, 5);
  const l10 = getHitRate(pick, 10);
  const l20 = getHitRate(pick, 20);
  if (l5 === null || l5 <= 0.50) return false;
  return (l10 !== null && l10 >= 0.60) || (l20 !== null && l20 >= 0.60);
}

// ─── Today in ET ────────────────────────────────────────────────────────────
function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  // returns "YYYY-MM-DD"
}

// ─── Main ───────────────────────────────────────────────────────────────────
export default async (req) => {
  const dateKey = todayET();
  console.log(`🏀 NBA Aggregator Save — ${dateKey}`);
  const bets = [];
  const meta = {
    date: dateKey,
    savedAt: new Date().toISOString(),
    sources: {},
  };

  // ─── 1. Elite V2.1 Game Predictions ─────────────────────────────────────
  try {
    const url = `${SITE}/.netlify/functions/nba-predictions-elite-v2-1?_t=${Date.now()}`;
    console.log(`  → Fetching Elite V2.1…`);
    const res = await fetch(url, { headers: { 'User-Agent': 'AggregatorCron/1.0' } });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.predictions) {
        data.predictions.forEach(pred => {
          (pred.opportunities || []).forEach(opp => {
            const isTotalMkt = (opp.market || '').toLowerCase().includes('total');
            const edgeVal = opp.edgePercent || opp.edge || 0;
            // Totals already passed calibration curve — don't filter on edgePercent
            if (!isTotalMkt && edgeVal < 2) return;

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
        meta.sources.elite = { ok: true, count: bets.filter(b => b.source === 'Elite V2.1').length };
      } else {
        meta.sources.elite = { ok: false, error: 'No predictions in response' };
      }
    } else {
      meta.sources.elite = { ok: false, error: `HTTP ${res.status}` };
    }
  } catch (err) {
    console.error('  ✗ Elite V2.1 error:', err.message);
    meta.sources.elite = { ok: false, error: err.message };
  }

  // ─── 2. Props: Strong Signals + Points (from static JSONs) ──────────────
  try {
    console.log(`  → Fetching Props V1 + V2…`);
    const [v1Res, v2Res] = await Promise.all([
      fetch(`${SITE}/data/nba/nba-player-props-live.json`),
      fetch(`${SITE}/data/nba/nba-props-v2-live.json`),
    ]);
    const v1Data = v1Res.ok ? ((await v1Res.json()).predictions || []) : [];
    const v2Raw = v2Res.ok ? await v2Res.json() : {};
    const v2Data = v2Raw.predictions || v2Raw.picks || [];

    // Aligned = both models agree
    const v1Keys = new Map();
    v1Data.forEach(pick => v1Keys.set(createPickKey(pick), pick));

    const aligned = [];
    v2Data.forEach(v2Pick => {
      const key = createPickKey(v2Pick);
      if (v1Keys.has(key)) aligned.push({ ...v2Pick, isAligned: true });
    });

    // Strong Signals = aligned + Phase 3.5
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
        line,
        edge: Math.abs(Number(pred.edge) || 0),
        odds: pred.odds || 0,
        book: pred.book || '',
        units: 0,
        confidence: pred.modelProbability || pred.confidence || 0,
      });
    });
    meta.sources.strongSignals = { ok: true, count: strongSignals.length };

    // Phase 3.5 Points (V2 only, 8%+ edge, not already in strong signals)
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
        line,
        edge: Math.abs(Number(pred.edge) || 0),
        odds: pred.odds || 0,
        book: pred.book || '',
        units: 0,
        confidence: pred.modelProbability || pred.confidence || 0,
      });
    });
    meta.sources.points = { ok: true, count: pointsPicks.length };

  } catch (err) {
    console.error('  ✗ Props error:', err.message);
    meta.sources.strongSignals = { ok: false, error: err.message };
    meta.sources.points = { ok: false, error: err.message };
  }

  // ─── Smart Staking Pass ─────────────────────────────────────────────────
  bets.forEach(bet => { bet.units = assignUnits(bet); });

  // Sort by edge descending
  bets.sort((a, b) => b.edge - a.edge);

  const totalUnits = Math.round(bets.reduce((s, b) => s + (b.units || 0), 0) * 10) / 10;

  // ─── Save to Blobs ──────────────────────────────────────────────────────
  const payload = {
    ...meta,
    totalPicks: bets.length,
    totalUnits,
    picks: bets,
  };

  if (bets.length === 0) {
    console.log('⚠️  No picks found — likely no games today. Skipping save.');
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no-picks', date: dateKey }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const store = getStore(STORE_NAME);

  // Save today's snapshot
  await store.setJSON(dateKey, payload);
  console.log(`✅ Saved ${bets.length} picks (${totalUnits}U) → ${STORE_NAME}/${dateKey}`);

  // Update index (rolling list of saved dates)
  let index = [];
  try {
    const existing = await store.get('_index', { type: 'json' });
    if (Array.isArray(existing)) index = existing;
  } catch { /* first run */ }

  if (!index.includes(dateKey)) {
    index.push(dateKey);
    index.sort();
    await store.setJSON('_index', index);
    console.log(`📋 Index updated: ${index.length} dates`);
  }

  return new Response(JSON.stringify({
    ok: true,
    date: dateKey,
    totalPicks: bets.length,
    totalUnits,
    sources: meta.sources,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// V2 scheduled function config — noon ET (17:00 UTC) daily
export const config = {
  schedule: '0 17 * * *',
};
