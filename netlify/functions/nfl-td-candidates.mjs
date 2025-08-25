// netlify/functions/nfl-td-candidates.mjs
// Builds a quick candidate list with real names from rosters
import { nflStore } from './_lib/blobs.js';

export const handler = async () => {
  try {
    const store = await nflStore();
    const schedule = await store.get('weeks/2025/1/schedule.json', { type: 'json' });
    if (!schedule) return json(400, { ok:false, error:'schedule unavailable' });

    const teamIds = [...new Set(schedule.games.flatMap(g => [g.home.id, g.away.id]))].filter(Boolean);

    // Load rosters we wrote in bootstrap
    const rosterByTeam = {};
    for (const id of teamIds) {
      const r = await store.get(`weeks/2025/1/depth/${id}.json`, { type: 'json' });
      rosterByTeam[id] = r;
    }

    const oppByTeam = {};
    for (const g of schedule.games) {
      oppByTeam[g.home.id] = g.away.abbrev;
      oppByTeam[g.away.id] = g.home.abbrev;
    }

    // Dumb model: pick top RB/WR/TE per team if found
    const pickPositions = new Set(['RB', 'WR', 'TE']);
    const candidates = [];

    for (const id of teamIds) {
      const roster = rosterByTeam[id];
      const athletes = roster?.athletes?.flatMap(g => g?.items || []) || [];
      // prioritise RB>WR>TE
      for (const pos of ['RB','WR','TE']) {
        const player = athletes.find(a => a?.position?.abbreviation === pos);
        if (player) {
          const why = `${player?.position?.abbreviation} • ${player?.jersey||'#?'} • vs ${oppByTeam[id]||'?'}`;
          candidates.push({
            player: player?.fullName || player?.displayName || 'Unknown',
            pos,
            modelTD: pos === 'RB' ? 0.365 : pos === 'WR' ? 0.28 : 0.22,
            rz: pos === 'RB' ? 0.248 : pos === 'WR' ? 0.19 : 0.16,
            exp: pos === 'RB' ? 0.117 : pos === 'WR' ? 0.09 : 0.06,
            why,
          });
          break;
        }
      }
    }

    // Sort by modelTD desc, take top N
    candidates.sort((a,b)=>b.modelTD - a.modelTD);
    const top = candidates.slice(0, 50);

    await store.set('weeks/2025/1/candidates.json', JSON.stringify({ ok:true, season:2025, week:1, candidates: top }), { contentType: 'application/json' });

    return json(200, { ok:true, season:2025, week:1, count: top.length });

  } catch (err) {
    return json(500, { ok:false, error: String(err) });
  }
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(obj),
  };
}