
// netlify/functions/nfl-td-candidates.mjs
import { getNFLStore, blobsJson } from './_blobs.mjs';

/**
 * Produces placeholder TD candidates from cached blobs so the UI renders.
 * Later, replace scoring logic with your model + TheOddsAPI.
 */
export const handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `https://x${event.path}`);
    const params = url.searchParams;
    const season = Number(params.get('season') || 2025);
    const week = Number(params.get('week') || 1);

    const store = getNFLStore();
    const schedule = await blobsJson.get(store, `weeks/${season}/${week}/schedule.json`);
    if (!schedule) {
      return json(500, { ok: false, error: 'schedule unavailable' });
    }

    // Pull a tiny bit of player data from cached rosters to show real names.
    const byTeam = {};
    for (const g of schedule.games) {
      for (const side of ['home', 'away']) {
        const t = g[side];
        const roster = await blobsJson.get(store, `weeks/${season}/${week}/depth/${t.id}.json`, { athletes: [] });
        const players = (roster.athletes || []).flatMap(grp => (grp.items || []));
        // Find top RB + WR + TE as placeholders
        const rb = players.find(p => p.position?.abbreviation === 'RB');
        const wr = players.find(p => p.position?.abbreviation === 'WR');
        const te = players.find(p => p.position?.abbreviation === 'TE');
        byTeam[t.id] = { team: t, rb, wr, te, opp: (side === 'home' ? g.away : g.home) };
      }
    }

    // Make simple candidate rows
    const rows = [];
    for (const teamId of Object.keys(byTeam)) {
      const { team, opp, rb, wr, te } = byTeam[teamId];
      const push = (pl, pos, base = 0.32) => {
        if (!pl) return;
        rows.push({
          player: pl.displayName || pl.fullName || pl.name || `${pos} ${team.abbrev}`,
          team: team.abbrev,
          game: `${team.abbrev} vs ${opp.abbrev}`,
          pos,
          model: Number((base + Math.random() * 0.08).toFixed(3)),
          rz: Number((base * 0.68).toFixed(3)),
          exp: Number((base * 0.32).toFixed(3)),
          why: `${pos} • depth 1 • vs ${opp.abbrev}`
        });
      };
      push(rb, 'RB');
      push(wr, 'WR', 0.25);
      push(te, 'TE', 0.22);
    }

    rows.sort((a, b) => b.model - a.model);
    // Return a trimmed table
    return json(200, { ok: true, season, week, count: rows.length, rows: rows.slice(0, 60) });
  } catch (err) {
    return json(500, { ok: false, error: String(err) });
  }
};

function json(status, obj) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(obj)
  };
}
