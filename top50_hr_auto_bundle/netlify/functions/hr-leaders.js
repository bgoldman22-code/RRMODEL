// netlify/functions/hr-leaders.js
// CommonJS Netlify Function to fetch Top 50 HR leaders from MLB StatsAPI and cache in Netlify Blobs
const fetch = require("node-fetch");
const { getStore } = require("@netlify/blobs");

const STORE_NAME = process.env.BLOBS_STORE || "rrmodelblobs";
const CACHE_KEY = "leaders_hr_top50.json";
const TTL_MS = 30 * 60 * 1000; // 30 minutes

exports.handler = async function (event, context) {
  try {
    const store = getStore({ name: STORE_NAME });
    // Try cache first
    const cachedStr = await store.get(CACHE_KEY);
    let cached = null;
    if (cachedStr) {
      try { cached = JSON.parse(cachedStr); } catch {}
      if (cached?.fetchedAt && Date.now() - new Date(cached.fetchedAt).getTime() < TTL_MS) {
        return ok({ source: "cache", count: cached?.leaders?.length || 0, leaders: cached.leaders });
      }
    }

    // MLB StatsAPI leaders endpoint (unofficial but public)
    // Example: https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=homeRuns&season=2025&sportId=1&limit=50
    const season = (event.queryStringParameters && event.queryStringParameters.season) || new Date().getFullYear();
    const url = `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=homeRuns&season=${season}&sportId=1&limit=50`;
    const resp = await fetch(url, { headers: { "accept": "application/json" } });
    if (!resp.ok) {
      return error(`Upstream ${resp.status} for ${url}`);
    }
    const data = await resp.json();
    // Normalize leaders array
    const leaders = [];
    const cats = data?.leagueLeaders || data?.stats || data?.leaderLeaders || [];
    const arr = Array.isArray(cats) ? cats : [];
    for (const cat of arr) {
      const people = cat?.leaders || [];
      for (const p of people) {
        const person = p?.person || p?.player || {};
        leaders.push({
          name: person?.fullName || person?.displayName || "",
          id: person?.id || null,
          value: Number(p?.value || p?.stat?.homeRuns || p?.rank || 0),
          team: (p?.team && (p?.team?.abbreviation || p?.team?.name)) || "",
          rank: Number(p?.rank || leaders.length + 1),
        });
      }
    }
    // Fall back if structure differs
    const top = leaders
      .filter(x => x.name)
      .sort((a,b) => (b.value||0) - (a.value||0))
      .slice(0, 50);

    const payload = { ok: true, season, fetchedAt: new Date().toISOString(), leaders: top };
    await store.set(CACHE_KEY, JSON.stringify(payload), { contentType: "application/json" });
    return ok({ source: "live", count: top.length, leaders: top });
  } catch (e) {
    return error(e.message || String(e));
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
