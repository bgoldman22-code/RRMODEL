import { makeStore } from "./_lib/blobs-helper.mjs";

const ESPN_DATES = "20250904-20250910"; // Week 1 2025 window
const ESPN_URL = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${ESPN_DATES}`;

function mapGame(e) {
  const comp = e.competitions?.[0];
  if (!comp) return null;
  const home = comp.competitors?.find(c => c.homeAway === "home");
  const away = comp.competitors?.find(c => c.homeAway === "away");
  return {
    id: e.id,
    date: e.date,
    home: {
      id: home?.team?.id,
      abbrev: home?.team?.abbreviation,
      displayName: home?.team?.displayName,
    },
    away: {
      id: away?.team?.id,
      abbrev: away?.team?.abbreviation,
      displayName: away?.team?.displayName,
    }
  };
}

export async function handler(event) {
  const params = event.queryStringParameters || {};
  const refresh = params.refresh === '1';
  const debug = params.debug === '1';
  const noblobs = params.noblobs === '1';

  const store = noblobs ? null : makeStore();
  const cacheKey = `weeks/2025/1/schedule.json`;

  try {
    if (!refresh && store) {
      const cached = await store.getJSON(cacheKey);
      if (cached) {
        return new Response(JSON.stringify({ ok:true, ...cached, used:{ mode:"cache" } }), { status:200 });
      }
    }

    const res = await fetch(ESPN_URL, { headers: { "cache-control":"no-cache" } });
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    const data = await res.json();
    const events = data.events || [];
    const games = events.map(mapGame).filter(Boolean);
    const schedule = { season: 2025, week: 1, games };

    const payload = { ok:true, season:2025, week:1, games:games.length, schedule, used:{ mode:"espn-dates" } };

    if (store) {
      await store.setJSON(cacheKey, payload);
    }

    const body = debug ? { ...payload, fetchLog:[{ url:ESPN_URL, ok:true, status:res.status }] } : payload;
    return new Response(JSON.stringify(body), { status:200 });

  } catch (err) {
    const body = { ok:false, error:String(err), blobs:{
      NFL_STORE_NAME: process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td",
      HAS_NETLIFY_BLOBS_CONTEXT: !!(process.env.NETLIFY && process.env.NETLIFY_SITE_ID),
      HAS_NETLIFY_SITE_ID: !!process.env.NETLIFY_SITE_ID
    }};
    return new Response(JSON.stringify(body), { status:500 });
  }
}
