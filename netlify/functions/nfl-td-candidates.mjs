import { getJSON, setJSON } from './_lib/blobs.js';

export const handler = async (event) => {
  try {
    const season = 2025;
    const week = 1;

    const schedule = await getJSON(`weeks/${season}/${week}/schedule.json`);
    if (!schedule?.games?.length) {
      return json({
        ok: false,
        error: 'schedule unavailable',
        diag: [{ step: 'load schedule cache', ok: false, season }],
        bootstrap: null
      }, 500);
    }

    // Load team rosters we cached during bootstrap
    const teamIds = Array.from(
      new Set(schedule.games.flatMap(g => [g.home?.id, g.away?.id]).filter(Boolean))
    );

    const teamMap = {};   // teamId -> { abbrev, displayName }
    const oppMap = {};    // teamId -> opponent teamId in week 1
    for (const g of schedule.games) {
      if (g.home?.id) teamMap[g.home.id] = { abbrev: g.home.abbrev, displayName: g.home.displayName };
      if (g.away?.id) teamMap[g.away.id] = { abbrev: g.away.abbrev, displayName: g.away.displayName };
      if (g.home?.id && g.away?.id) {
        oppMap[g.home.id] = g.away.id;
        oppMap[g.away.id] = g.home.id;
      }
    }

    // Build naive candidates from roster data (RB/WR/TE starters if present)
    const candidates = [];
    for (const id of teamIds) {
      const depthOrRoster = await getJSON(`weeks/${season}/${week}/depth/${id}.json`);
      if (!depthOrRoster) continue;

      // Normalize: ESPN roster payload has "athletes" grouped by position
      const normalized = normalizeRoster(depthOrRoster);
      // crude starter picks
      const starters = pickStarters(normalized);

      // Attach matchup + fake model % (until we wire the real model)
      const oppId = oppMap[id];
      const oppAbbrev = teamMap[oppId]?.abbrev || '?';

      for (const s of starters) {
        candidates.push({
          player: s.name,
          team: teamMap[id]?.abbrev || id,
          pos: s.pos,
          modelTD: s.modelTD,      // %
          rz: s.rz,                // %
          exp: s.exp,              // %
          why: `${s.pos} • depth ${s.depth} • vs ${oppAbbrev}`
        });
      }
    }

    // Sort by model TD
    candidates.sort((a, b) => b.modelTD - a.modelTD);

    // cache
    await setJSON(`weeks/${season}/${week}/candidates.json`, { season, week, candidates });

    return json({ ok: true, season, week, candidates });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
};

function normalizeRoster(payload) {
  // ESPN /roster format -> flatten to { pos, name }[]
  const out = [];
  const groups = payload?.athletes || [];
  for (const g of groups) {
    const pos = g?.position?.abbreviation || g?.position || '?';
    for (const a of g?.items || []) {
      const name = a?.fullName || a?.displayName || a?.name || '—';
      out.push({ pos, name });
    }
  }
  return out;
}

function pickStarters(roster) {
  // Extremely naive: take first of RB/WR/TE as "starter"
  const starters = [];
  const want = ['RB', 'WR', 'TE'];
  for (const pos of want) {
    const list = roster.filter(p => (p.pos || '').toUpperCase() === pos);
    if (list.length) {
      const p = list[0];
      starters.push({
        pos,
        name: p.name,
        depth: 1,
        // placeholder percentages — wire in your model when ready
        modelTD: 0.365,
        rz: 0.248,
        exp: 0.117
      });
    }
  }
  return starters;
}

function json(obj, status = 200) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
