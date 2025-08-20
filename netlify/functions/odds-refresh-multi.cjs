// patch-oddsapi-hr-only-2025-08-20/netlify/functions/odds-refresh-multi.cjs
// HR props only for The Odds API (Over 0.5 / Yes) with bookmaker filter + rich diagnostics.

const { getStore } = require("@netlify/blobs");

const SITE_ID = process.env.NETLIFY_SITE_ID || "967be648-eddc-4cc5-a7cc-e2ab7db8ac75";
const BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263";

function makeStore(name) {
  return getStore({ name, siteID: SITE_ID, token: BLOBS_TOKEN });
}

const VALID_REGIONS = new Set(["us","us2","us_il","us_nj","uk","eu","au","ca","in"]);
function sanitizeCsv(input, validSet) {
  const arr = String(input||"").split(",").map(s=>s.trim()).filter(Boolean);
  if (!validSet) return arr;
  const out = arr.filter(x => validSet.has(x));
  return out.length ? out : [];
}

function sanitizeRegions(input) {
  const arr = sanitizeCsv(input, VALID_REGIONS);
  return arr.length ? arr : ["us","us2"];
}

function isOverPointFive(out) {
  const name = String(out.name || out.label || out.outcome || out.description || "").toLowerCase().trim();
  const point = (out.point !== undefined && out.point !== null) ? Number(out.point) : NaN;
  if (name === "over" && point === 0.5) return true;
  if (name.includes("over 0.5")) return true;
  if (name === "yes") return true;
  if (name.startsWith("o ") && name.includes("0.5")) return true;
  return false;
}

function canonicalHRMarket(keyOrName) {
  const s = String(keyOrName||"").toLowerCase();
  if (s.includes("batter") && s.includes("home") && s.includes("run")) return "batter_home_runs";
  if (s.includes("home runs")) return "player_home_runs";
  if (s.includes("to hit a home run")) return "player_home_runs";
  return "player_home_runs";
}

async function fetchJSON(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch(e) { throw new Error(`Bad JSON from ${url}: ${text.slice(0,160)}`); }
}

function filterBookmakers(bookmakers, allowedKeys) {
  if (!allowedKeys || !allowedKeys.length) return bookmakers || [];
  const set = new Set(allowedKeys.map(x=>x.trim()));
  return (bookmakers || []).filter(bk => set.has(bk.key));
}

function normalizeFeatured(events, allowedBooks, diag) {
  const offers = [];
  for (const ev of (events||[])) {
    const gameId = ev.id || ev.key || ev.event_id || "";
    const bks = filterBookmakers(ev.bookmakers, allowedBooks);
    if ((ev.bookmakers||[]).length && !bks.length) diag.bookmakerFiltered++;
    for (const bk of bks) {
      for (const mk of (bk.markets||[])) {
        const mkey = canonicalHRMarket(mk.key || mk.name);
        diag.marketLabels.add(mk.key || "");
        diag.marketLabels.add(mk.name || "");
        for (const out of (mk.outcomes||[])) {
          diag.outcomesSeen++;
          if (!isOverPointFive(out)) { diag.outcomesFiltered++; continue; }
          offers.push(baseOffer(out, mkey, gameId, bk));
        }
      }
    }
  }
  return offers;
}

function baseOffer(out, marketKey, gameId, bk) {
  const bookKey = bk.key || "book";
  return {
    id: `${out.name||out.description||out.player||out.participant||"?"}|${marketKey}|${gameId}|${bookKey}`,
    american: Number(out.price || out.american || out.odds || 0),
    market: marketKey,
    sport: "baseball_mlb",
    gameId,
    player: out.description || out.player || out.participant || null,
    team: out.name && !out.player ? out.name : null,
    outcome: out.name || out.label || out.outcome || null,
    point: (out.point !== undefined ? out.point : undefined),
    book: bk.title || bk.name || bookKey,
    bookKey,
    sgpOk: Boolean(out.sgp_enabled || false),
    groupKey: `${gameId}:${marketKey}`
  };
}

function normalizePerEvent(pack, allowedBooks, diag) {
  const offers = [];
  const gameId = pack.id || pack.event_id || "";
  const bks = filterBookmakers(pack.bookmakers, allowedBooks);
  if ((pack.bookmakers||[]).length && !bks.length) diag.bookmakerFiltered++;
  for (const bk of bks) {
    for (const mk of (bk.markets||[])) {
      const label = mk.name || mk.title || mk.key || "";
      const mkey = canonicalHRMarket(label);
      diag.marketLabels.add(mk.key || "");
      diag.marketLabels.add(label || "");
      for (const out of (mk.outcomes||[])) {
        diag.outcomesSeen++;
        if (!isOverPointFive(out)) { diag.outcomesFiltered++; continue; }
        offers.push(baseOffer(out, mkey, gameId, bk));
      }
    }
  }
  return offers;
}

async function handlerImpl() {
  const diag = {
    mode: "hr-only",
    featured: [],
    reasons: [],
    marketLabels: new Set(),
    outcomesSeen: 0,
    outcomesFiltered: 0,
    bookmakerFiltered: 0
  };

  const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("Missing THEODDS_API_KEY");
  const sport = process.env.ODDS_SPORT || "baseball_mlb";

  const regions = sanitizeRegions(process.env.ODDS_REGIONS || process.env.ODDSAPI_REGION || "us,us2");
  const hrMarkets = sanitizeCsv(process.env.ODDS_HR_MARKETS || "batter_home_runs,player_home_runs");
  const allowedBooks = sanitizeCsv(process.env.ODDS_BOOKMAKERS || "");

  const storeName = process.env.BLOBS_STORE || "mlb-odds";
  const store = makeStore(storeName);

  let combined = [];

  // 1) Try featured endpoint
  for (const market of hrMarkets) {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("regions", regions.join(","));
    url.searchParams.set("markets", market);
    url.searchParams.set("oddsFormat", "american");
    try {
      const data = await fetchJSON(url);
      const chunk = normalizeFeatured(data, allowedBooks, diag);
      diag.featured.push({ market, events: (data||[]).length, kept: chunk.length });
      combined = combined.concat(chunk);
    } catch (e) {
      if (String(e.message).includes("INVALID_KEY")) {
        throw new Error("The Odds API INVALID_KEY — check THEODDS_API_KEY or daily quota.");
      }
      if (String(e.message).includes("INVALID_MARKET")) {
        diag.reasons.push(`INVALID_MARKET for ${market} on /odds (expected if your plan doesn't include props on /odds).`);
      } else {
        diag.reasons.push(`/odds ${market} error: ${e.message}`);
      }
    }
  }

  // 2) Per-event fallback
  if (combined.length === 0) {
    try {
      const elistUrl = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events`);
      elistUrl.searchParams.set("apiKey", apiKey);
      const events = await fetchJSON(elistUrl);
      for (const ev of (events||[])) {
        const evUrl = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/events/${ev.id}/odds`);
        evUrl.searchParams.set("apiKey", apiKey);
        evUrl.searchParams.set("regions", regions.join(","));
        evUrl.searchParams.set("markets", hrMarkets.join(","));
        evUrl.searchParams.set("oddsFormat", "american");
        try {
          const evOdds = await fetchJSON(evUrl);
          const pack = { id: ev.id, bookmakers: evOdds.bookmakers || [] };
          const adds = normalizePerEvent(pack, allowedBooks, diag);
          if (adds.length) combined = combined.concat(adds);
        } catch (e) {
          if (String(e.message).includes("INVALID_KEY")) {
            throw new Error("The Odds API INVALID_KEY during per-event fetch — check THEODDS_API_KEY or daily quota.");
          }
          // continue
        }
      }
    } catch (e) {
      diag.reasons.push(`events list error: ${e.message}`);
    }
  }

  // Dedup
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
    markets: hrMarkets,
    fetched: new Date().toISOString(),
    count: offers.length,
    offers,
    diag: { 
      ...diag,
      marketLabels: Array.from(diag.marketLabels)
    }
  };

  await store.setJSON("mlb-hr-over05.json", payload);
  await store.setJSON("latest.json", payload);

  return { ok: true, wrote: ["mlb-hr-over05.json","latest.json"], count: offers.length, diag: payload.diag };
}

exports.handler = async function() {
  const started = Date.now();
  try {
    const res = await handlerImpl();
    return { statusCode: 200, body: JSON.stringify({ ...res, timeMs: Date.now()-started }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message||err) }) };
  }
};
