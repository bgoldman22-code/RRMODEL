// netlify/functions/nfl-rosters.mjs
// ESM Netlify function: fetch NFL depth charts/rosters without blobs.
// Uses SportsData.io (aka FantasyData) DepthCharts endpoint if API key is present.
// Falls back to a lightweight placeholder structure when no key present (so build doesn't explode).

const TEAM_ABBREV = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
  9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
  17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
  25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

async function getJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url} :: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function normalizeDepthCharts(depthCharts) {
  // depthCharts: array from SportsData.io DepthCharts endpoint
  // Build { [teamAbbrev]: { QB:[], RB:[], WR:[], TE:[] } }
  const out = {};
  for (const t of depthCharts || []) {
    const teamId = t?.TeamID ?? t?.TeamId ?? t?.Team?.TeamID;
    const abbrev = (t?.Team ?? t?.TeamAbbreviation ?? TEAM_ABBREV[teamId]) || t?.Key || "UNK";
    const room = out[abbrev] || (out[abbrev] = { QB: [], RB: [], WR: [], TE: [] });

    const positions = ["QB", "RB", "WR", "TE"];
    for (const pos of positions) {
      const slot = t?.[pos] || t?.[`${pos}1`];
      // SportsData returns specific fields; we attempt a best-effort mapping across possible shapes.
      const list = [];
      const pushIf = (p, idx) => {
        if (!p) return;
        const player = {
          playerId: p.PlayerID ?? p.PlayerId ?? p.Player?.PlayerID ?? p?.id ?? null,
          name: [p.FirstName, p.LastName].filter(Boolean).join(" ") || p.Name || p?.playerName || null,
          jersey: p.Jersey ?? p.JerseyNumber ?? p.Number ?? null,
          position: pos,
          depth: idx + 1,
        };
        list.push(player);
      };

      if (Array.isArray(slot)) {
        slot.forEach((p, i) => pushIf(p, i));
      } else if (slot && typeof slot === "object") {
        const parts = [slot, t?.[`${pos}2`], t?.[`${pos}3`], t?.[`${pos}4`]].filter(Boolean);
        parts.forEach((p, i) => pushIf(p, i));
      }

      room[pos].push(...list);
    }
  }
  return out;
}

export async function handler(event) {
  try {
    const url = new URL(event.rawUrl || ("https://dummy.local" + (event.path || "")));
    const season = parseInt(url.searchParams.get("season") || "2025", 10);
    const week = parseInt(url.searchParams.get("week") || "1", 10);
    const debug = url.searchParams.get("debug") === "1" || url.searchParams.get("debug") === "true";

    const API_KEY = url.searchParams.get("key")
      || process.env.SPORTSDATA_API_KEY
      || process.env.FANTASYDATA_API_KEY
      || process.env.SPORTSDATA_IO_API_KEY
      || process.env.FANTASYDATA_IO_API_KEY;

    if (!API_KEY) {
      // No key yet -> placeholder so downstream pages stay up
      return json(200, { ok: true, season, week, teams: 0, used: "placeholder", rosters: {} });
    }

    // SportsData Depth Charts endpoint (scores API)
    // Doc: https://sportsdata.io/developers/api-documentation/nfl#/ (Depth Charts)
    const endpoint = `https://api.sportsdata.io/v3/nfl/scores/json/DepthCharts/${season}?key=${API_KEY}`;
    const raw = await getJSON(endpoint);
    const rosters = normalizeDepthCharts(raw);

    return json(200, { ok: true, season, week, teams: Object.keys(rosters).length, used: "sportsdata_depthcharts", rosters });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.stack || err) });
  }
}
