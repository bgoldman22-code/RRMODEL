// patch-over05-2025-08-20/netlify/functions/odds-refresh-multi.cjs
// Pulls MLB HR props with strong fallbacks and exact "Over 0.5" handling.
// Order of attempts:
//   1) /odds?markets=player_home_runs
//   2) /odds?markets=batter_home_runs
//   3) Per-event: /events/:id/odds?markets=player_props (map "Home Runs" → canonical)
// Writes to Blobs: latest.json + mlb-hr-over05.json

const { getStore } = require("@netlify/blobs");

const SITE_ID = process.env.NETLIFY_SITE_ID || "967be648-eddc-4cc5-a7cc-e2ab7db8ac75";
const BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263";

function makeStore(name) {
  return getStore({ name, siteID: SITE_ID, token: BLOBS_TOKEN });
}

const VALID_REGIONS = new Set(["us","us2","uk","eu","au","ca","in","us_il","us_nj"]);
function sanitizeRegions(input) {
  const arr = String(input||"").split(",").map(s=>s.trim()).filter(Boolean);
  const out = arr.filter(r => VALID_REGIONS.has(r));
  return out.length ? out : ["us","us2"];
}

function uniq(arr) { return Array.from(new Set((arr||[]).filter(Boolean))); }

function canonicalHRMarket(label) {
  const s = String(label||"").toLowerCase();
  if (s.includes("home runs")) return "player_home_runs";
  return "player_props";
}

function isOverPointFive(outcome) {
  const s = String(outcome||"").toLowerCase();
  return s.includes("over 0.5") || s === "yes" || s.includes("o 0.5");
}

async function fetchJSON(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch(e) { throw new Error(`Bad JSON from ${url}: ${text.slice(0,200)}`); }
}

async function tryFeaturedMarket(sport, market, regions, apiKey) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", regions.join(","));
  url.searchParams.set("markets", market);
  url.searchParams.set("oddsFormat", "american");
  try {
    const data = await fetchJSON(url);
    return normalizeFromFeatured(data, sport, market);
  } catch (e) {
    // Only swallow INVALID_MARKET; rethrow others
    if (!String(e.message).includes("INVALID_MARKET")) throw e;
    return [];
  }
}

function normalizeFromFeatured(events, sport, marketKey) {
  const offers = [];
  for (const ev of (events||[])) {
    const gameId = ev.id || ev.key || ev.event_id || "";
    for (const bk of (ev.bookmakers||[])) {
      const bookKey = bk.key || "book";
      for (const mk of (bk.markets||[])) {
        const mkey = mk.key || marketKey;
        for (const out of (mk.outcomes||[])) {
          if (!isOverPointFive(out.name || out.label || out.outcome)) continue;
          offers.push({
            id: `${out.name||out.description||out.player||out.participant||"?"}|${mkey}|${gameId}|${bookKey}`,
            american: Number(out.price || out.american || out.odds || 0),
            market: mkey,
            sport,
            gameId,
            player: out.description || out.player || out.participant || null,
            team: out.name && !out.player ? out.name : null,
            outcome: out.name || out.label || out.outcome || null,
            book: bk.title || bk.name || bookKey,
            bookKey,
            sgpOk: Boolean(mk.sgp_enabled || out.sgp_enabled || false),
            groupKey: `${gameId}:${mkey}`
          });
        }
      }
    }
  }
  return offers;
}

async function listEvents(sport, apiKey) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events`);
  url.searchParams.set("apiKey", apiKey);
  return fetchJSON(url);
}

async function fetchEventProps(sport, eventId, regions, apiKey) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", regions.join(","));
  url.searchParams.set("markets", "player_props");
  url.searchParams.set("oddsFormat", "american");
  return fetchJSON(url);
}

function normalizeFromEventProps(pack, sport) {
  const offers = [];
  const gameId = pack.id || pack.event_id || "";
  for (const bk of (pack.bookmakers||[])) {
    const bookKey = bk.key || "book";
    for (const mk of (bk.markets||[])) {
      const label = mk.name || mk.title || mk.key || "";
      const ckey = canonicalHRMarket(label);
      if (ckey !== "player_home_runs") continue; // only HR props
      for (const out of (mk.outcomes||[])) {
        if (!isOverPointFive(out.name || out.label || out.outcome)) continue;
        offers.push({
          id: `${out.name||out.description||out.player||out.participant||"?"}|${ckey}|${gameId}|${bookKey}`,
          american: Number(out.price || out.american || out.odds || 0),
          market: ckey,
          sport,
          gameId,
          player: out.description || out.player || out.participant || null,
          team: out.name && !out.player ? out.name : null,
          outcome: out.name || out.label || out.outcome || null,
          book: bk.title || bk.name || bookKey,
          bookKey,
          sgpOk: Boolean(mk.sgp_enabled || out.sgp_enabled || false),
          groupKey: `${gameId}:${ckey}`
        });
      }
    }
  }
  return offers;
}

exports.handler = async function() {
  const started = Date.now();
  try {
    const sport = process.env.ODDS_SPORT || "baseball_mlb";
    const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
    if (!apiKey) throw new Error("Missing THEODDS_API_KEY");

    const regions = sanitizeRegions(process.env.ODDS_REGIONS || process.env.ODDSAPI_REGION || "us,us2");
    const storeName = process.env.BLOBS_STORE || "mlb-odds";
    const store = makeStore(storeName);

    // 1) Try featured HR markets first
    let combined = [];
    for (const m of ["player_home_runs","batter_home_runs"]) {
      try {
        const chunk = await tryFeaturedMarket(sport, m, regions, apiKey);
        if (chunk.length) combined = combined.concat(chunk);
      } catch (e) {
        // ignore invalid market; continue
      }
    }

    // 2) Fallback to per-event player_props (map to HR + Over 0.5)
    if (combined.length === 0) {
      const events = await listEvents(sport, apiKey);
      for (const ev of (events||[])) {
        try {
          const evOdds = await fetchEventProps(sport, ev.id, regions, apiKey);
          const pack = { id: ev.id, bookmakers: evOdds.bookmakers || [] };
          const adds = normalizeFromEventProps(pack, sport);
          if (adds.length) combined = combined.concat(adds);
        } catch (e) {
          // continue when event has no props yet
        }
      }
    }

    // Dedup identical ids
    const seen = new Set();
    const offers = [];
    for (const o of combined) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      offers.push(o);
    }

    const payload = {
      provider: "theoddsapi",
      regions,
      sports: [sport],
      markets: ["player_home_runs","batter_home_runs","player_props"],
      fetched: new Date().toISOString(),
      count: offers.length,
      offers
    };

    await store.setJSON("latest.json", payload);
    await store.setJSON("mlb-hr-over05.json", payload);

    return {
      statusCode: 200,
      body: JSON.stringify({ "ok": true, "wrote": ["latest.json","mlb-hr-over05.json"], "count": offers.length, "timeMs": Date.now()-started })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message||err) }) };
  }
};
