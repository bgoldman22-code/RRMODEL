// netlify/functions/nfl-td-candidates.mjs
// Minimal version that reads schedule + depth and emits dummy candidates with real team names from schedule.
import { getStore } from '@netlify/blobs';

const NFL_STORE_NAME = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';

export async function handler(event) {
  try {
    const store = getStore({ name: NFL_STORE_NAME });
    const sched = await store.get('weeks/2025/1/schedule.json', { type: 'json' });
    const depth = await store.get('depth-charts.json', { type: 'json' });
    if (!sched) {
      return json(400, { ok: false, error: 'schedule unavailable' });
    }
    // If depth is present, attempt to pick a few placeholders per game.
    const candidates = [];
    for (const g of (sched.games || [])) {
      // placeholder player labels using team abbrevs; real naming handled in later patch
      candidates.push({
        id: `RB1-${g.home.id}`,
        player: `RB1 ${g.home.abbrev}`,
        pos: 'RB',
        why: `RB • depth 1 • vs ${g.away.abbrev}`,
        modelTdPct: 0.366
      });
    }
    return json(200, { ok: true, season: sched.season, week: sched.week, games: (sched.games||[]).length, candidates });
  } catch (err) {
    return json(500, { ok: false, error: String(err), store: NFL_STORE_NAME });
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  };
}
