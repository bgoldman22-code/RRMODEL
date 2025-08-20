
// patch-over05-v2-2025-08-20/netlify/functions/odds-refresh-multi.cjs
// v2: Robust Over 0.5 detection (supports 'Over'+point=0.5, 'Yes', 'Over 0.5', 'O 0.5').
//     Tries featured markets (player_home_runs, batter_home_runs), then per-event with both
//     player_home_runs and player_props. Adds rich diagnostics to help see where filtering occurs.

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

function canonicalHRMarket(label) {
  const s = String(label||"").toLowerCase();
  if (s.includes("home runs")) return "player_home_runs";
  if (s.includes("batter") && s.includes("home") && s.includes("run")) return "player_home_runs";
  return "player_props";
}

function isOverPointFiveFromOutcome(out) {
  const name = String(out.name || out.label || out.outcome || out.description || "").toLowerCase().trim();
  const point = (out.point !== undefined && out.point !== null) ? Number(out.point) : NaN;
  if (name === "over" && point === 0.5) return true;
  if (name.includes("over 0.5")) return true;
  if (name === "yes") return true;
  if (name.startsWith("o ") && name.includes("0.5")) return true;
  if ((name === "over" || name === "o") && isFinite(point) && Math.abs(point - 0.5) < 1e-9) return true;
  return false;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch(e) { throw new Error(`Bad JSON from ${url}: ${text.slice(0,200)}`); }
}

async function tryFeaturedMarket(sport, market, regions, apiKey, diag) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", regions.join(","));
  url.searchParams.set("markets", market);
  url.searchParams.set("oddsFormat", "american");
  try {
    const data = await fetchJSON(url);
    const normalized = normalizeFromFeatured(data, sport, market, diag);
    diag.featuredAttempts.push({ market, events: (data||[]).length, kept: normalized.length });
    return normalized;
  } catch (e) {
    if (!String(e.message).includes("INVALID_MARKET")) throw e;
    diag.featuredAttempts.push({ market, error: "INVALID_MARKET" });
    return [];
  }
}

function normalizeFromFeatured(events, sport, marketKey, diag) {
  const offers = [];
  diag.featuredRaw += (events||[]).length;
  for (const ev of (events||[])) {
    const gameId = ev.id || ev.key || ev.event_id || "";
    for (const bk of (ev.bookmakers||[])) {
      const bookKey = bk.key || "book";
      for (const mk of (bk.markets||[])) {
        const mkey = mk.key || marketKey;
        for (const out of (mk.outcomes||[])) {
          diag.featuredOutcomesTotal++;
          if (!isOverPointFiveFromOutcome(out)) { diag.featuredOutcomesFiltered++; continue; }
          offers.push({
            id: `${out.name||out.description||out.player||out.participant||"?"}|${mkey}|${gameId}|${bookKey}`,
            american: Number(out.price || out.american || out.odds || 0),
            market: mkey,
            sport,
            gameId,
            player: out.description || out.player || out.participant || null,
            team: out.name && !out.player ? out.name : null,
            outcome: out.name || out.label || out.outcome || null,
            point: (out.point !== undefined ? out.point : undefined),
            book: bk.title || bk.name || bookKey,
            bookKey,
            sgpOk: Boolean(out.sgp_enabled || false),
            groupKey: `${gameId}:${mkey||marketKey}`
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

async function fetchEventOdds(sport, eventId, regions, apiKey, marketsCsv) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", regions.join(","));
  url.searchParams.set("markets", marketsCsv);
  url.searchParams.set("oddsFormat", "american");
  return fetchJSON(url);
}

function normalizeFromEvent(pack, sport, diag) {
  const out = [];
  const gameId = pack.id || pack.event_id || "";
  for (const bk of (pack.bookmakers||[])) {
    for (const mk of (bk.markets||[])) {
      const label = mk.name || mk.title || mk.key || "";
      const ckey = canonicalHRMarket(label);
      if (ckey !== "player_home_runs") continue;
      for (const oc of (mk.outcomes||[])) {
        diag.eventOutcomesTotal++;
        if (!isOverPointFiveFromOutcome(oc)) { diag.eventOutcomesFiltered++; continue; }
        out.push({
          id: `${oc.name||oc.description||oc.player||oc.participant||"?"}|${ckey}|${gameId}|${bk.key||"book"}`,
          american: Number(oc.price || oc.american || oc.odds || 0),
          market: ckey,
          sport,
          gameId,
          player: oc.description || oc.player || oc.participant || null,
          team: oc.name && !oc.player ? oc.name : null,
          outcome: oc.name || oc.label || oc.outcome || null,
          point: (oc.point !== undefined ? oc.point : undefined),
          book: bk.title || bk.name || bk.key || "book",
          bookKey: bk.key || "book",
          sgpOk: Boolean(oc.sgp_enabled || false),
          groupKey: `${gameId}:${ckey}`
        });
      }
    }
  }
  return out;
}

exports.handler = async function() {
  const started = Date.now();
  const diag = {
    featuredAttempts: [],
    featuredRaw: 0,
    featuredOutcomesTotal: 0,
    featuredOutcomesFiltered: 0,
    eventsCount: 0,
    eventOutcomesTotal: 0,
    eventOutcomesFiltered: 0
  };
  try {
    const sport = process.env.ODDS_SPORT || "baseball_mlb";
    const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
    if (!apiKey) throw new Error("Missing THEODDS_API_KEY");

    const regions = sanitizeRegions(process.env.ODDS_REGIONS || process.env.ODDSAPI_REGION || "us,us2");
    const storeName = process.env.BLOBS_STORE || "mlb-odds";
    const store = makeStore(storeName);

    let combined = [];

    for (const m of ["player_home_runs","batter_home_runs"]) {
      const chunk = await tryFeaturedMarket(sport, m, regions, apiKey, diag);
      if (chunk.length) combined = combined.concat(chunk);
    }

    if (combined.length === 0) {
      const events = await listEvents(sport, apiKey);
      diag.eventsCount = (events||[]).length;
      for (const ev of (events||[])) {
        try {
          const evOdds = await fetchEventOdds(sport, ev.id, regions, apiKey, "player_home_runs,player_props");
          const pack = { id: ev.id, bookmakers: evOdds.bookmakers || [] };
          const adds = normalizeFromEvent(pack, sport, diag);
          if (adds.length) combined = combined.concat(adds);
        } catch (e) {
          // continue
        }
      }
    }

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
      offers,
      diag
    };

    await store.setJSON("latest.json", payload);
    await store.setJSON("mlb-hr-over05.json", payload);

    return {
      statusCode: 200,
      body: JSON.stringify({"ok":true, "wrote":["latest.json","mlb-hr-over05.json"], "count": offers.length, "diag": diag, "timeMs": Date.now()-started })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message||err) }) };
  }
};
