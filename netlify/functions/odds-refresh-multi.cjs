// patch-oddsapi-sgo-hr-2025-08-20/netlify/functions/odds-refresh-multi.cjs
const { getStore } = require("@netlify/blobs");

const SITE_ID = process.env.NETLIFY_SITE_ID || "967be648-eddc-4cc5-a7cc-e2ab7db8ac75";
const BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263";

function storeFor(name) {
  return getStore({ name, siteID: SITE_ID, token: BLOBS_TOKEN });
}

function sanitizeCSV(input) {
  return String(input || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const VALID_REGIONS = new Set(["us","us2","uk","eu","au","ca","in","us_il","us_nj"]);
function sanitizeRegions(input) {
  const arr = sanitizeCSV(input);
  const out = arr.filter((r) => VALID_REGIONS.has(r));
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

// OddsAPI per-event
async function oddsapiListEvents(sport, apiKey) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events`);
  url.searchParams.set("apiKey", apiKey);
  return fetchJSON(url);
}

async function oddsapiEventOdds({ sport, eventId, apiKey, regions, market, bookmakers }) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", regions.join(","));
  url.searchParams.set("markets", market);
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

async function oddsapiCollectHR({ sport, apiKey, regions, bookmakers, hrMarkets, diag }) {
  const events = await oddsapiListEvents(sport, apiKey);
  let offers = [];
  for (const ev of (events || [])) {
    for (const m of hrMarkets) {
      try {
        const evOdds = await oddsapiEventOdds({ sport, eventId: ev.id, apiKey, regions, market: m, bookmakers });
        const adds = normalizeOddsapiEvent(evOdds, sport, ev.id, m, diag);
        if (adds.length) offers = offers.concat(adds);
      } catch (e) {
        diag.errors = diag.errors || [];
        diag.errors.push(String(e.message||e));
      }
    }
  }
  return offers;
}

// SGO fallback (scaffold; will log if base/key missing)
async function sgoFetchHR({ diag }) {
  const base = process.env.SGO_BASE;
  const key = process.env.SPORTSGAMEODDS_KEY || process.env.SGO_KEY;
  if (!base || !key) {
    diag.sgo = "missing_base_or_key";
    return [];
  }
  // Placeholder: adjust to your SGO endpoint shape
  const u = new URL(base.replace(/\/$/, '') + "/mlb/batter_home_runs");
  u.searchParams.set("apiKey", key);
  try {
    const data = await fetchJSON(u.toString());
    // Expect: array or {offers:[]}; pass-through until we confirm shape
    const arr = Array.isArray(data) ? data : (data.offers || []);
    // Best-effort filter: any outcome that looks like Over 0.5 or Yes
    return arr.filter((row) => {
      const nm = String(row.outcome || row.name || row.selection || "").toLowerCase();
      const pt = (row.point !== undefined && row.point !== null) ? Number(row.point) : (row.line !== undefined ? Number(row.line) : NaN);
      return nm.includes("over 0.5") || nm === "yes" || (nm === "over" && pt === 0.5);
    });
  } catch (e) {
    diag.sgoErrors = (diag.sgoErrors || []);
    diag.sgoErrors.push(String(e.message||e));
    return [];
  }
}

exports.handler = async function () {
  const started = Date.now();
  const diag = { mode: "hr-only+sgo-fallback", errors: [], marketLabels: [], outcomesSeen: 0, outcomesFiltered: 0, bookmakerFiltered: 0 };
  try {
    const sport = process.env.ODDS_SPORT || "baseball_mlb";
    const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
    if (!apiKey) throw new Error("Missing THEODDS_API_KEY");

    const regions = sanitizeRegions(process.env.ODDS_REGIONS || process.env.ODDSAPI_REGION || "us");
    const bookmakers = sanitizeCSV(process.env.ODDS_BOOKMAKERS || "fanduel");
    const hrMarkets = sanitizeCSV(process.env.ODDS_HR_MARKETS || "batter_home_runs,player_home_runs");

    const store = storeFor(process.env.BLOBS_STORE || "mlb-odds");

    let offers = [];
    try {
      offers = await oddsapiCollectHR({ sport, apiKey, regions, bookmakers, hrMarkets, diag });
    } catch (e) {
      diag.errors.push("oddsapiCollectHR: " + String(e.message||e));
    }

    if (offers.length === 0) {
      const sgoOffers = await sgoFetchHR({ diag });
      if (sgoOffers.length) offers = sgoOffers;
    }

    if (bookmakers.length) {
      const before = offers.length;
      offers = offers.filter(o => !o.bookKey || bookmakers.includes(o.bookKey));
      diag.bookmakerFiltered = before - offers.length;
    }

    const seen = new Set();
    const deduped = [];
    for (const o of offers) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      deduped.push(o);
    }

    const payload = {
      provider: "theoddsapi+fallback:sgo",
      regions,
      sports: [sport],
      markets: hrMarkets,
      fetched: new Date().toISOString(),
      count: deduped.length,
      offers: deduped,
      diag
    };

    await store.setJSON("mlb-hr-over05.json", payload);
    await store.setJSON("latest.json", payload);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, wrote: ["mlb-hr-over05.json","latest.json"], count: deduped.length, diag, timeMs: Date.now() - started })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message||err) }) };
  }
};
