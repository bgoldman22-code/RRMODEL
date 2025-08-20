// netlify/functions/odds-refresh-multi.cjs
// Uses The Odds API per-event endpoint for player props to avoid INVALID_MARKET on /odds
// CommonJS (.cjs), Node 18+ native fetch, explicit Netlify Blobs credentials

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

function uniq(arr){ return Array.from(new Set((arr||[]).filter(Boolean))); }

const BAD_PLAYER_MARKETS = new Set([
  "player_home_runs","player_total_bases","player_rbis",
  "player_runs","player_hits","pitcher_strikeouts"
]);

function mapPropsLabelToKey(label){
  const s = String(label||"").toLowerCase();
  if (s === "home runs") return "player_home_runs";
  if (s === "total bases") return "player_total_bases";
  if (s === "runs batted in" || s === "rbis" || s === "rbi") return "player_rbis";
  if (s === "runs") return "player_runs";
  if (s === "hits") return "player_hits";
  if (s === "strikeouts" || s === "pitcher strikeouts") return "pitcher_strikeouts";
  return "player_props";
}

async function fetchJSON(url){
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${url} -> ${res.status}: ${text}`);
  }
  return res.json();
}

// 1) Get today's/upcoming events (ids)
async function getEvents({ sport, apiKey }){
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events`);
  url.searchParams.set("apiKey", apiKey);
  // Optional: filter by daysFrom now via date range params if needed in future
  return fetchJSON(url);
}

// 2) For each event, fetch player_props via /events/:id/odds
async function getEventProps({ sport, eventId, apiKey, regions }){
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", regions.join(","));
  url.searchParams.set("markets", "player_props");
  url.searchParams.set("oddsFormat", "american");
  return fetchJSON(url);
}

function normalizeOffers(eventsWithBooks, { sport }){
  const offers = [];
  const counts = {};
  const inc = (k)=>counts[k]=(counts[k]||0)+1;
  for (const pack of eventsWithBooks) {
    const gameId = pack.id || pack.event_id || pack.key || "";
    for (const bk of (pack.bookmakers||[])) {
      const bookKey = bk.key || bk.bookmaker || bk.bookmaker_key || "book";
      for (const mk of (bk.markets||[])) {
        let marketKey = mk.key || mk.market || "unknown";
        if (marketKey === "player_props") {
          marketKey = mapPropsLabelToKey(mk.name || mk.title || mk.key || "player_props");
        }
        for (const out of (mk.outcomes||[])) {
          offers.push({
            id: `${out.name||out.description||out.player||out.participant||"?"}|${marketKey}|${gameId}|${bookKey}`,
            american: Number(out.price || out.american || out.odds || 0),
            market: marketKey,
            sport,
            gameId,
            player: out.description || out.player || out.participant || null,
            team: out.name && !out.player ? out.name : null,
            outcome: out.name || out.label || out.outcome || null,
            book: bk.title || bk.name || bookKey,
            bookKey,
            sgpOk: Boolean(mk.sgp_enabled || out.sgp_enabled || false),
            groupKey: `${gameId}:${marketKey}`
          });
          inc(marketKey);
        }
      }
    }
  }
  return { offers, counts };
}

exports.handler = async function(){
  const started = Date.now();
  try {
    const sport = process.env.ODDS_SPORT || "baseball_mlb";
    const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
    if (!apiKey) throw new Error("Missing THEODDS_API_KEY");

    const regions = sanitizeRegions(process.env.ODDS_REGIONS || process.env.ODDSAPI_REGION || "us,us2");
    const storeName = process.env.BLOBS_STORE || "mlb-odds";
    const store = makeStore(storeName);

    // Step 1: list events
    const events = await getEvents({ sport, apiKey });

    // Step 2: fetch props per event (sequence to respect rate limits; parallel if your plan allows)
    const outPacks = [];
    for (const ev of events || []) {
      try {
        const evOdds = await getEventProps({ sport, eventId: ev.id, apiKey, regions });
        // normalize event id into each response block
        outPacks.push({ id: ev.id, bookmakers: evOdds.bookmakers || [] });
      } catch (e) {
        // ignore events with no props or temporary 404/422; continue
      }
    }

    const { offers, counts } = normalizeOffers(outPacks, { sport });

    const payload = {
      provider: "theoddsapi",
      regions,
      sports: [sport],
      markets: ["player_props"],
      fetched: new Date().toISOString(),
      count: offers.length,
      offers,
      diag: {
        eventsChecked: (events||[]).length,
        countsByMarket: counts
      }
    };

    await store.setJSON("latest.json", payload);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok:true, wrote:"latest.json", count: offers.length, eventsChecked: (events||[]).length, timeMs: Date.now()-started })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message||err), stack: String(err.stack||"") }) };
  }
};
