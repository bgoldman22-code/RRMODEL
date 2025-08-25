// netlify/functions/nfl-td-candidates.mjs
import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  try {
    const origin = new URL(event.rawUrl || `https://${event.headers.host}`).origin;

    // 1) Ensure schedule & depth via bootstrap (auto week with roll-forward)
    const bootUrl = `${origin}/.netlify/functions/nfl-bootstrap?mode=auto`;
    const bootRes = await fetch(bootUrl);
    const boot = await bootRes.json().catch(() => null);
    if (!boot?.schedule?.games?.length) {
      return json({ ok: false, error: 'schedule unavailable', diag: [{ step: 'bootstrap', ok: !!boot }] }, 503);
    }
    const { season, week } = boot;
    const games = boot.schedule.games;

    // 2) Build opponent maps
    const oppByTeamId = new Map();
    for (const g of games) {
      oppByTeamId.set(String(g.home.id), g.away.abbrev);
      oppByTeamId.set(String(g.away.id), g.home.abbrev);
    }

    // 3) Pull rosters from Blobs
    const store = getStore({ name: 'nfl' });
    async function loadTeamRoster(teamId) {
      const key = `weeks/${season}/${week}/depth/${teamId}.json`;
      return await store.get(key, { type: 'json' });
    }

    // 4) Utility: flatten ESPN roster JSON
    function flattenRoster(rjson) {
      const flat = [];
      const groups = rjson?.athletes || [];
      for (const grp of groups) {
        for (const it of (grp.items || [])) flat.push(it);
      }
      return flat;
    }

    // 5) Starter heuristics by pos
    function starters(rosterFlat) {
      const out = { RB: [], WR: [], TE: [] };
      for (const p of rosterFlat) {
        const pos = p?.position?.abbreviation || p?.position?.name || p?.position || '';
        if (out[pos]) out[pos].push(p);
      }
      // no perfect ordering flag; leave as-rostered
      return {
        RB1: out.RB[0] || null,
        WR1: out.WR[0] || null,
        WR2: out.WR[1] || null,
        TE1: out.TE[0] || null,
      };
    }

    const baseTD = { RB: 0.32, WR: 0.22, TE: 0.18 };
    const tdPct = (pos) => (baseTD[pos] ?? 0.15);

    const candidates = [];
    // Pull once per team
    const teamIds = new Set();
    for (const g of games) { teamIds.add(String(g.home.id)); teamIds.add(String(g.away.id)); }
    const rosterByTeamId = new Map();
    await Promise.all(Array.from(teamIds).map(async (tid) => {
      const r = await loadTeamRoster(tid);
      rosterByTeamId.set(tid, flattenRoster(r || {}));
    }));

    for (const tid of teamIds) {
      const opp = oppByTeamId.get(tid) || '?';
      const rosterFlat = rosterByTeamId.get(tid) || [];
      const s = starters(rosterFlat);

      const picks = [
        { p: s.RB1, pos: 'RB' },
        { p: s.WR1, pos: 'WR' },
        { p: s.TE1, pos: 'TE' },
      ];
      for (const pick of picks) {
        if (!pick.p) continue;
        const name = pick.p.displayName || pick.p.fullName || [pick.p.firstName, pick.p.lastName].filter(Boolean).join(' ') || 'Unknown';
        const pos = pick.pos;
        const model = tdPct(pos);
        candidates.push({
          player: name,
          pos,
          teamId: tid,
          modelTD: Number((model * 100).toFixed(1)),
          rzPath: Number((model * 0.68 * 100).toFixed(1)),
          expPath: Number((model * 0.32 * 100).toFixed(1)),
          why: `${name} (${pos}) vs ${opp}`,
        });
      }
    }

    candidates.sort((a,b) => b.modelTD - a.modelTD);
    const out = candidates.slice(0, 100);

    return json({ ok: true, season, week, games: games.length, candidates: out });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
};

const json = (body, statusCode = 200) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});