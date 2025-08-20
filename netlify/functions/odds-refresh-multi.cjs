// patch-hr-ui-lock-provider-2025-08-20/netlify/functions/odds-refresh-multi.cjs
// MLB HR props fetcher (FanDuel batter_home_runs Over 0.5) with legacy-compatible 'provider' field.
// CommonJS, Node 18+ (global fetch), Netlify Blobs.

const { getStore } = require("@netlify/blobs");

const SITE_ID = process.env.NETLIFY_SITE_ID || "967be648-eddc-4cc5-a7cc-e2ab7db8ac75";
const BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263";

// ---------- Utils ----------
function getStoreSafe(name) {
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
  return out.length ? out : ["us"]; // default FanDuel
}

function stripDiacritics(s) {
  try { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch { return s; }
}
function normalizePlayerName(name) {
  if (!name) return null;
  return stripDiacritics(String(name)).toLowerCase().trim();
}

function isOver05(out) {
  const nm = String(out.name || out.label || out.outcome || out.description || "").toLowerCase();
  const pt = (out.point !== undefined && out.point !== null) ? Number(out.point) : NaN;
  if (nm === "over" && pt === 0.5) return true;
  if (nm.includes("over 0.5")) return true;
  if (nm === "yes") return true;
  if (/^o\s*0?\.5$/.test(nm)) return true;
  return false;
}

function baseOffer(out, marketKey, sport, gameId, bk, labelHint) {
  const bookKey = bk.key || (bk.title || bk.name || "book").toLowerCase().replace(/\s+/g,"");
  let team = out.team || (out.name && !out.player ? out.name : null);
  const teamLower = String(team || "").toLowerCase();
  if (["over","under","yes","no"].includes(teamLower)) team = null;

  const playerRaw = out.description || out.player || out.participant || out.selection || null;
  const player = playerRaw ? String(playerRaw).trim() : null;
  const player_norm = normalizePlayerName(player || "");

  return {
    id: `${out.name||out.label||"Over"}|${marketKey}|${gameId}|${bookKey}|${player||"?"}`,
    american: Number(out.price || out.american || out.odds || 0),
    market: marketKey,
    sport,
    gameId,
    player,
    player_norm,
    team,
    outcome: out.name || out.label || out.outcome || "Over",
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

// ---------- OddsAPI (primary) ----------
async function oddsapiListEvents(sport, apiKey) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events`);
  url.searchParams.set("apiKey", apiKey);
  return fetchJSON(url);
}

async function oddsapiEventOdds({ sport, eventId, apiKey, regions, market, bookmakers }) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", regions.join(","));
  url.searchParams.set("markets", market); // 'batter_home_runs'
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

async function oddsapiCollectHR({ sport, apiKey, regions, bookmakers, hrMarket, diag }) {
  const events = await oddsapiListEvents(sport, apiKey);
  let offers = [];
  for (const ev of (events || [])) {
    try {
      const evOdds = await oddsapiEventOdds({ sport, eventId: ev.id, apiKey, regions, market: hrMarket, bookmakers });
      const adds = normalizeOddsapiEvent(evOdds, sport, ev.id, hrMarket, diag);
      if (adds.length) offers = offers.concat(adds);
    } catch (e) {
      diag.errors.push(String(e.message || e));
    }
  }
  return offers;
}

// ---------- SGO fallback (scaffold) ----------
async function sgoFetchHR(diag) {
  const base = process.env.SGO_BASE;
  const key = process.env.SPORTSGAMEODDS_KEY || process.env.SGO_KEY;
  if (!base || !key) { diag.sgo = "missing_base_or_key"; return []; }
  const u = new URL(base.replace(/\/$/, '') + "/mlb/batter_home_runs");
  u.searchParams.set("apiKey", key);
  try {
    const data = await fetchJSON(u.toString());
    const arr = Array.isArray(data) ? data : (data.offers || []);
    const out = [];
    for (const row of arr) {
      const nmRaw = String(row.outcome || row.name || row.selection || "").toLowerCase();
      const pt = (row.point !== undefined && row.point !== null) ? Number(row.point) : (row.line !== undefined ? Number(row.line) : NaN);
      const hrOK = (nmRaw.includes("over 0.5") || nmRaw === "yes" || (nmRaw === "over" && pt === 0.5));
      if (!hrOK) continue;
      const bk = { key: (row.bookKey || row.book || "sgo").toString().toLowerCase(), title: row.book || "SGO" };
      const offer = baseOffer({
        name: row.outcome || row.name || "Over",
        label: row.label,
        outcome: row.outcome,
        description: row.player || row.description,
        participant: row.player,
        point: isNaN(pt) ? undefined : pt,
        price: row.american || row.price || row.odds
      }, "batter_home_runs", "baseball_mlb", row.gameId || row.eventId || "unknown", bk, "SGO");
      out.push(offer);
    }
    return out;
  } catch (e) {
    diag.sgoErrors = (diag.sgoErrors || []);
    diag.sgoErrors.push(String(e.message || e));
    return [];
  }
}

// ---------- Handler ----------
exports.handler = async function () {
  const started = Date.now();
  const diag = { mode: "hr-only-us+fanduel+sgo-fallback", errors: [], marketLabels: [], outcomesSeen: 0, outcomesFiltered: 0, bookmakerFiltered: 0 };

  try {
    const sport = process.env.ODDS_SPORT || "baseball_mlb";
    const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
    if (!apiKey) throw new Error("Missing THEODDS_API_KEY");

    const regions = sanitizeRegions(process.env.ODDS_REGIONS || "us");
    const bookmakers = sanitizeCSV(process.env.ODDS_BOOKMAKERS || "fanduel");
    const hrMarket = "batter_home_runs";
    const storeName = process.env.BLOBS_STORE || "mlb-odds";
    const store = getStoreSafe(storeName);

    let offers = [];
    let fromOddsApiCount = 0;
    try {
      offers = await oddsapiCollectHR({ sport, apiKey, regions, bookmakers, hrMarket, diag });
      fromOddsApiCount = offers.length;
    } catch (e) {
      diag.errors.push("oddsapiCollectHR: " + String(e.message || e));
    }

    let fromSgoCount = 0;
    if (!offers.length) {
      const sgoOffers = await sgoFetchHR(diag);
      if (sgoOffers.length) { offers = sgoOffers; fromSgoCount = sgoOffers.length; }
    }

    if (bookmakers.length) {
      const before = offers.length;
      offers = offers.filter(o => !o.bookKey || bookmakers.includes(o.bookKey));
      diag.bookmakerFiltered = before - offers.length;
    }

    const seen = new Set();
    const deduped = [];
    for (const o of offers) { if (!seen.has(o.id)) { seen.add(o.id); deduped.push(o); } }

    const usingOddsApi = fromOddsApiCount > 0;
    // Legacy-compatible provider field:
    const provider = usingOddsApi ? "theoddsapi" : (fromSgoCount > 0 ? "sgo" : "none");
    const source = provider;

    const payload = {
      provider,         // <— legacy UI expects exactly 'theoddsapi' for "Using OddsAPI: yes"
      source,
      usingOddsApi,
      fromOddsApiCount,
      fromSgoCount,
      regions,
      sports: [sport],
      markets: [hrMarket],
      fetched: new Date().toISOString(),
      count: deduped.length,
      offers: deduped,
      diag
    };

    await store.setJSON("mlb-hr-over05.json", payload);
    await store.setJSON("latest.json", payload);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        wrote: ["mlb-hr-over05.json","latest.json"],
        count: deduped.length,
        usingOddsApi,
        provider,
        source,
        timeMs: Date.now() - started
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
