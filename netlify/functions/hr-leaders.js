// netlify/functions/hr-leaders.js
// ESM version (package.json has "type":"module")
// Uses built-in global `fetch` (Node 18+ on Netlify) — no node-fetch needed.
import { getStore } from './_blobs.js';

const STORE_NAME = process.env.BLOBS_STORE || "rrmodelblobs";
const CACHE_KEY = "leaders_hr_top50.json";
const TTL_MS = 30 * 60 * 1000; // 30 minutes

export const handler = async (event, context) => {
  try {
    const store = getStore({ name: STORE_NAME });
    // 1) Try cache
    const cachedStr = await store.get(CACHE_KEY);
    if (cachedStr) {
      try {
        const cached = JSON.parse(cachedStr);
        if (cached?.fetchedAt && Date.now() - new Date(cached.fetchedAt).getTime() < TTL_MS) {
          return ok({ source: "cache", count: cached?.leaders?.length || 0, leaders: cached.leaders });
        }
      } catch {}
    }

    // 2) Fetch live from MLB StatsAPI (public)
    const qp = event?.queryStringParameters || {};
    const season = qp.season || new Date().getFullYear();
    const url = `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=homeRuns&season=${season}&sportId=1&limit=50`;

    const resp = await fetch(url, { headers: { accept: "application/json" } });
    if (!resp.ok) return error(`Upstream ${resp.status} for ${url}`);
    const data = await resp.json();

    // Normalize
    const leaders = [];
    const cats = Array.isArray(data?.leagueLeaders) ? data.leagueLeaders : [];
    for (const cat of cats) {
      const list = Array.isArray(cat?.leaders) ? cat.leaders : [];
      for (const p of list) {
        const person = p?.person || p?.player || {};
        leaders.push({
          name: person?.fullName || person?.displayName || "",
          id: person?.id || null,
          value: Number(p?.value || 0),
          team: (p?.team && (p?.team?.abbreviation || p?.team?.name)) || "",
          rank: Number(p?.rank || leaders.length + 1),
        });
      }
    }

    const top = leaders
      .filter(x => x.name)
      .sort((a,b) => (b.value||0) - (a.value||0))
      .slice(0, 50);

    const payload = { ok: true, season, fetchedAt: new Date().toISOString(), leaders: top };
    await store.set(CACHE_KEY, JSON.stringify(payload), { contentType: "application/json" });

    return ok({ source: "live", count: top.length, leaders: top });
  } catch (e) {
    return error(e?.message || String(e));
  }
};

function ok(body) {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify({ ok: true, ...body }),
  };
}
function error(msg) {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: false, error: msg }),
  };
}
