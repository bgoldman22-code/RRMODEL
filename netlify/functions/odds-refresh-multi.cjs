// patch-oddsapi-hr-only-us-fanduel-2025-08-20/netlify/functions/odds-refresh-multi.cjs
// MLB HR props (Over 0.5 / Yes) — OddsAPI primary (FanDuel, batter_home_runs) with SGO fallback.
// CommonJS, Node >=18 native fetch, explicit Netlify Blobs creds.

const { getStore } = require("@netlify/blobs");

const SITE_ID = process.env.NETLIFY_SITE_ID || "967be648-eddc-4cc5-a7cc-e2ab7db8ac75";
const BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263";

function storeFor(name) {
  return getStore({ name, siteID: SITE_ID, token: BLOBS_TOKEN });
}

function csv(input) {
  return String(input || "").split(",").map(s => s.trim()).filter(Boolean);
}

function sanitizeRegions(input) {
  // Lock default to 'us' to target FanDuel first
  const valid = new Set(["us","us2","uk","eu","au","ca","in","us_il","us_nj"]);
  const arr = csv(input);
  const out = arr.filter(r => valid.has(r));
  return out.length ? out : ["us"];
}

function isOver05(out) {
  const name = String(out.name || out.label || out.outcome || out.description || "").toLowerCase();
  const point = (out.point !== undefined && out.point !== null) ? Number(out.point) : NaN;
  if (name === "over" && point === 0.5) return true;
  if (name.includes("over 0.5")) return true;
  if (name.startsWith("o ") && name.includes("0.5")) return true;
  if (name === "yes") return true;
  return false;
}

function cleanOffers(list) {
  // Remove bogus team labels like 'Over', 'Under', 'Yes', 'No'
  const badTeam = new Set(["over","under","yes","no","o","u"]);
  return list.map(o => ({ 
    ...o, 
    team: o.team && badTeam.has(String(o.team).toLowerCase()) ? null : o.team, 
    player: o.player ? String(o.player).trim() : o.player 
  }));
}

function baseOffer(out, marketKey, sport, gameId, bk, labelHint) {
  const bookKey = bk.key || "book";
  return {
    id: `${out.name||out.description||out.player||out.participant||"?"}|${marketKey}|${gameId}|${bookKey}`,
    american: Number(out.price || out.american || out.odds || 0),
    market: marketKey,
    sport,
    gameId,
    player: out.description || out.player || out.participant || null,
    team: out.name && !out.player ? out.name : null,
    outcome: out.name || out.label || out.outcome || null,
    point: (out.point !== undefined ? out.point : undefined),
    book: bk.title || bk.name || bookKey,
    bookKey,
    sgpOk: Boolean(out.sgp_enabled || false),
    labelHint: labelHint || undefined,
    groupKey: `${gameId}:${marketKey}`
  };
}

async function fetchJSON(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch (e) { throw new Error(`Bad JSON from ${url}: ${text.slice(0,200)}`); }
}

async function oddsapiListEvents(sport, apiKey) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events`);
  url.searchParams.set("apiKey", apiKey);
  return fetchJSON(url);
}

async function oddsapiEventOdds({ sport, eventId, apiKey, regions, market, bookmakers }) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", regions.join(","));
  url.searchParams.set("markets", market); // we will use batter_home_runs only
  if (bookmakers && bookmakers.length) url.searchParams.set("bookmakers", bookmakers.join(","));
  url.searchParams.set("oddsFormat", "american");
  return fetchJSON(url);
}

function normalizeOddsapiEvent(evOdds, sport, eventId, wantMarket, diag) {
  const out = [];
  const bookmakers = evOdds.bookmakers || [];
  for (const bk of bookmakers) {
    for (const mk of (bk.markets || [])) {
      const key = mk.key || "";
      const name = mk.name || mk.title || "";
      diag.marketLabels.push([key, name]);
      if (key !== wantMarket) continue;
      for (const oc of (mk.outcomes || [])) {
        diag.outcomesSeen++;
        if (!isOver05(oc)) { diag.outcomesFiltered++; continue; }
        out.push(baseOffer(oc, key, sport, eventId, bk, name));
      }
    }
  }
  return out;
}

async function oddsapiCollectHR({ sport, apiKey, regions, bookmakers, diag }) {
  const wantMarket = "batter_home_runs"; // hard-lock
  const events = await oddsapiListEvents(sport, apiKey);
  let offers = [];
  for (const ev of (events || [])) {
    try {
      const evOdds = await oddsapiEventOdds({ sport, eventId: ev.id, apiKey, regions, market: wantMarket, bookmakers });
      const adds = normalizeOddsapiEvent(evOdds, sport, ev.id, wantMarket, diag);
      if (adds.length) offers = offers.concat(adds);
    } catch (e) {
      // If OddsAPI rejects the market, log and continue (SGO may still save the run)
      diag.errors.push(String(e.message||e));
    }
  }
  return offers;
}

// ---- SGO fallback (scaffold; adjust to your endpoint) ----
async function sgoFetchHR(diag) {
  const base = process.env.SGO_BASE;
  const key = process.env.SPORTSGAMEODDS_KEY || process.env.SGO_KEY;
  if (!base || !key) {
    diag.sgo = "missing_base_or_key";
    return [];
  }
  const u = new URL(base.replace(/\/$/, '') + "/mlb/batter_home_runs");
  u.searchParams.set("apiKey", key);
  try {
    const data = await fetchJSON(u.toString());
    const arr = Array.isArray(data) ? data : (data.offers || []);
    // Convert to our offer shape; best-effort mapping until we confirm exact fields
    const out = [];
    for (const row of arr) {
      const name = String(row.outcome || row.name || row.selection || "").toLowerCase();
      const point = (row.point !== undefined && row.point !== null) ? Number(row.point) : (row.line !== undefined ? Number(row.line) : NaN);
      if (!(name.includes("over 0.5") || name === "yes" || (name === "over" && point === 0.5))) continue;
      const bkKey = (row.bookKey || row.book || "").toLowerCase() || "book";
      out.push({
        id: `${row.outcome||row.name||"?"}|batter_home_runs|${row.gameId||row.eventId||"?"}|${bkKey}`,
        american: Number(row.american || row.odds || row.price || 0),
        market: "batter_home_runs",
        sport: "baseball_mlb",
        gameId: row.gameId || row.eventId || null,
        player: row.player || row.participant || null,
        team: row.team || null,
        outcome: row.outcome || row.name || null,
        point: isFinite(point) ? point : undefined,
        book: row.book || row.bookName || bkKey,
        bookKey: bkKey,
        sgpOk: Boolean(row.sgpOk || row.sgp_enabled || false),
        groupKey: `${row.gameId||row.eventId||"?"}:batter_home_runs`
      });
    }
    return out;
  } catch (e) {
    diag.sgoErrors = (diag.sgoErrors || []);
    diag.sgoErrors.push(String(e.message||e));
    return [];
  }
}

exports.handler = async function () {
  const started = Date.now();
  const diag = { mode: "hr-only-us+fanduel+sgo-fallback", errors: [], marketLabels: [], outcomesSeen: 0, outcomesFiltered: 0, bookmakerFiltered: 0 };
  try {
    const sport = process.env.ODDS_SPORT || "baseball_mlb";
    const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
    if (!apiKey) throw new Error("Missing THEODDS_API_KEY");

    const regions = sanitizeRegions(process.env.ODDS_REGIONS || process.env.ODDSAPI_REGION || "us");
    const bookmakers = csv(process.env.ODDS_BOOKMAKERS || "fanduel");

    const store = storeFor(process.env.BLOBS_STORE || "mlb-odds");

    // Primary OddsAPI
    let offers = [];
    try {
      offers = await oddsapiCollectHR({ sport, apiKey, regions, bookmakers, diag });
    } catch (e) {
      diag.errors.push("oddsapiCollectHR: " + String(e.message||e));
    }

    // Fallback: SGO
    if (offers.length === 0) {
      const sgo = await sgoFetchHR(diag);
      if (sgo.length) offers = sgo;
    }

    // Filter by bookmaker list at the end as well (defensive)
    if (bookmakers.length) {
      const before = offers.length;
      offers = offers.filter(o => !o.bookKey || bookmakers.includes(o.bookKey));
      diag.bookmakerFiltered = before - offers.length;
    }

    // Dedup + cleanup
    const seen = new Set();
    const deduped = [];
    for (const o of offers) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      deduped.push(o);
    }
    const cleaned = cleanOffers(deduped);

    const payload = {
      provider: "theoddsapi+fallback:sgo",
      regions,
      sports: [sport],
      markets: ["batter_home_runs"],
      fetched: new Date().toISOString(),
      count: cleaned.length,
      offers: cleaned,
      diag
    };

    await store.setJSON("mlb-hr-over05.json", payload);
    await store.setJSON("latest.json", payload);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, wrote: ["mlb-hr-over05.json","latest.json"], count: cleaned.length, diag, timeMs: Date.now() - started })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message||err) }) };
  }
};
