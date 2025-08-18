// netlify/functions/hr-leaders.mjs
// ESM function (repo has "type":"module").
// Uses built-in global `fetch` (Node 18+). No node-fetch.
// Blobs is OPTIONAL: try auto context, then siteID/token, else no-cache.

import { getStore } from "@netlify/blobs";

const STORE_NAME = process.env.BLOBS_STORE || "rrmodelblobs";
const CACHE_KEY  = "leaders_hr_top50.json";
const TTL_MS     = 30 * 60 * 1000; // 30 minutes

async function initStore() {
  // Try auto env (works if Blobs enabled on the site)
  try {
    const s = getStore(STORE_NAME);
    await s.get("__ping__"); // probe
    return s;
  } catch {}
  // Try explicit siteID/token if provided
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    try {
      const s = getStore({ name: STORE_NAME, siteID, token });
      await s.get("__ping__");
      return s;
    } catch {}
  }
  return null; // operate without cache
}

export const handler = async (event) => {
  try {
    const store = await initStore();

    // Serve cache if present and fresh
    if (store) {
      try {
        const cachedStr = await store.get(CACHE_KEY);
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (cached?.fetchedAt && Date.now() - new Date(cached.fetchedAt).getTime() < TTL_MS) {
            return ok({ source: "cache", count: cached?.leaders?.length || 0, leaders: cached.leaders });
          }
        }
      } catch {}
    }

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

    if (store) {
      try { await store.set(CACHE_KEY, JSON.stringify(payload), { contentType: "application/json" }); } catch {}
    }

    return ok({ source: store ? "live" : "live_nocache", count: top.length, leaders: top });
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
