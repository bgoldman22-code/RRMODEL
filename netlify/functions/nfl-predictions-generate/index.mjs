// netlify/functions/nfl-predictions-generate/index.mjs
// Read team_form.json from Blobs, merge with odds to produce picks

import { loadFromBlobs, makeStore } from '../_lib/blobs-helper.mjs';

const LOG_PREFIX = '[NFL-PICKS]';

function confFromEdge(edge) {
  // map model edge (difference in win prob from 0.5) into 50-85% range
  const base = 0.5;
  const maxBoost = 0.35; // allows up to 85%
  const clamped = Math.max(-0.5, Math.min(0.5, edge));
  return base + maxBoost * Math.abs(clamped);
}

function pickMoneyline(homeTeam, awayTeam, features) {
  const hf = features[homeTeam] || { net_ppg: 0 };
  const af = features[awayTeam] || { net_ppg: 0 };
  const edge = (hf.net_ppg - af.net_ppg) / 20; // crude normalization
  const pickTeam = edge >= 0 ? homeTeam : awayTeam;
  const conf = confFromEdge(edge);
  return { pick: pickTeam, confidence: conf };
}

function pickSpread(homeTeam, awayTeam, spread) {
  if (spread == null || isNaN(spread)) return null;
  const side = spread <= 0 ? homeTeam : awayTeam; // negative spread means home favorite
  return { pick: `${side} ${Math.abs(spread)}`, confidence: 0.53 };
}

function pickTotal(total) {
  if (total == null || isNaN(total)) return null;
  // Dummy: prefer under around 41-45, else over
  const underBias = total >= 41 && total <= 45;
  return { pick: `${underBias ? 'UNDER' : 'OVER'} ${total}`, confidence: underBias ? 0.56 : 0.54 };
}

// Fake odds source for now; your frontend already passes pre-joined odds strings; we only need team names here.
function formatMoneylineText(team, price) {
  return price == null ? team : `${team} (${price >= 0 ? price : price})`;
}

export async function handler(event) {
  const qs = event.queryStringParameters || {};
  const force = qs.force || qs.f || null;

  const store = makeStore();
  const features = await loadFromBlobs('team_form.json', { storeName: store });
  if (!features) {
    console.warn(LOG_PREFIX, 'no team_form.json in blobs store', store);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, rows: [], meta: { source: 'stub', force } }),
    };
  }

  // The schedule/odds join normally lives elsewhere. To keep function self-contained,
  // we read a lightweight schedule from env if present, else return empty for page grace.
  const scheduleEnv = process.env.NFL_SCHEDULE_JSON || '[]';
  let schedule = [];
  try { schedule = JSON.parse(scheduleEnv); } catch {}

  const rows = [];
  for (const g of schedule) {
    const { matchup, kickoff, homeTeam, awayTeam, ml_home, ml_away, spread_point, total_points } = g;
    const mlPick = pickMoneyline(homeTeam, awayTeam, features);
    const spreadPick = pickSpread(homeTeam, awayTeam, Number(spread_point));
    const totalPick = pickTotal(Number(total_points));

    const row = {
      id: g.id || `${homeTeam}-${awayTeam}-${kickoff}`,
      matchup: matchup || `${awayTeam} @ ${homeTeam}`,
      kickoff,
      moneylineText: formatMoneylineText(mlPick.pick, mlPick.price || (mlPick.pick === homeTeam ? ml_home : ml_away)),
      moneylineConf: mlPick.confidence,
      spreadText: spreadPick ? `${spreadPick.pick} (${g.spread_home_line ?? g.spread_away_line ?? ''})` : '–',
      spreadConf: spreadPick ? spreadPick.confidence : null,
      totalText: totalPick ? totalPick.pick : '–',
      totalConf: totalPick ? totalPick.confidence : null,
    };
    console.log('[PREDICTION]', JSON.stringify(row));
    rows.push(row);
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true, rows, meta: { source: 'model-epa', force, store } }),
  };
}

export default { handler };
