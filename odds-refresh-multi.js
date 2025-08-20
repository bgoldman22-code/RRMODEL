// netlify/functions/odds-refresh-multi.js

// ---- Helper: Extract Over 0.5 Home Runs from player_props ----
function extractHRProps(offers){
  const out = [];
  for (const book of (offers || [])) {
    const bookmaker = book.bookmaker_key || book.key || book.bookmaker || book.site || "unknown";
    const markets = book.markets || book.player_props || [];
    for (const m of markets) {
      const marketName = (m.name || m.market || "").toLowerCase();
      if (marketName !== "home runs") continue;
      for (const outcome of (m.outcomes || m.selections || [])) {
        const outcomeName = (outcome.name || outcome.label || outcome.outcome || "").toLowerCase();
        if (outcomeName === "over 0.5") {
          out.push({
            bookmaker,
            market: "Home Runs",
            outcome: "Over 0.5",
            player: outcome.description || outcome.participant || outcome.player || outcome.name || "",
            american: Number(outcome.price || outcome.american || outcome.odds || 0),
            decimal: Number(outcome.decimal || outcome.price_decimal || 0) || undefined
          });
        }
      }
    }
  }
  return out;
}


// ESM, uses built-in fetch (Node 18+), writes unified offers[]
// Adds book branding, outcome text, and skips alternate lines if ODDS_EXCLUDE_ALTS=true

import { getStore } from "@netlify/blobs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = (k, d = "") => String(process.env[k] || process.env[k.toUpperCase()] || d).trim();

const ALLOW = {
  baseball_mlb: new Set(["h2h","spreads","totals","player_props","player_props","player_props","player_props","player_props","player_props"]),
  basketball_nba: new Set(["h2h","spreads","totals","player_points","player_rebounds","player_assists","player_threes"]),
  americanfootball_nfl: new Set(["h2h","spreads","totals","player_pass_tds","player_pass_yds","player_rush_yds","player_rec_yds","player_anytime_td"]),
  icehockey_nhl: new Set(["h2h","spreads","totals","player_shots_on_goal","player_points"]),
};

const EXCLUDE_ALTS = (/^(1|true|yes)$/i).test(env("ODDS_EXCLUDE_ALTS","true"));

const BOOK_NAME = (key, title) => {
  const k = String(key||"").toLowerCase();
  if (k.includes("fanduel")) return "FanDuel";
  if (k.includes("draftkings")) return "DraftKings";
  if (k.includes("williamhill") || k.includes("caesars")) return "Caesars";
  if (k.includes("mgm")) return "BetMGM";
  if (k.includes("pointsbet")) return "PointsBet";
  if (k.includes("betrivers")) return "BetRivers";
  if (title) return title;
  return key || "agg";
};

function americanFromDecimal(decimal) {
  const d = Number(decimal);
  if (!isFinite(d) || d <= 1) return -100;
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}

function pickAmerican(outcome){
  if (outcome?.price && typeof outcome.price.american !== "undefined"){
    const a = Number(outcome.price.american);
    if (!Number.isNaN(a)) return a;
  }
  if (typeof outcome?.price_american === "number") return outcome.price_american;
  if (typeof outcome?.american === "number") return outcome.american;
  if (typeof outcome?.price === "number") return outcome.price;
  if (typeof outcome?.price_decimal === "number") return americanFromDecimal(outcome.price_decimal);
  if (typeof outcome?.decimal === "number") return americanFromDecimal(outcome.decimal);
  return null;
}

const safeId = (parts) => parts.filter(Boolean).join("|").replace(/\s+/g, " ").trim();

function outcomeText(marketKey, outcome){
  const name = outcome?.name || outcome?.description || outcome?.runner || outcome?.selection || outcome?.label || "";
  if (name) return name;
  // fallback for ML: team name may sit on team/participant
  return outcome?.team || outcome?.participant || "";
}

function normalizeOutcomeToOffer({ sport, marketKey, event, bookmaker, outcome }){
  if (EXCLUDE_ALTS && /alt|alternate/i.test(marketKey)) return null;
  const american = pickAmerican(outcome);
  if (american == null) return null;

  const player = outcome.player || null;
  const team = outcome.team || outcome.participant || null;
  const outcomeName = outcomeText(marketKey, outcome);
  const bookKey = bookmaker?.key || "";
  const book = BOOK_NAME(bookKey, bookmaker?.title);

  const id = outcome.id || safeId([player || team || outcomeName, marketKey, event?.id || event?.commence_time, bookKey || book]);
  const groupKey = `${event?.id || event?.commence_time || "na"}:${marketKey}`;

  return {
    id,
    american,
    market: marketKey,
    sport,
    gameId: event?.id || event?.commence_time || null,
    player: player || null,
    team: team || null,
    outcome: outcomeName || null,
    book,
    bookKey,
    sgpOk: true,
    groupKey
  };
}

async function fetchSportMarket({ apiKey, sport, market, regions }){
  const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds?apiKey=${encodeURIComponent(apiKey)}&regions=${encodeURIComponent(regions)}&markets=${encodeURIComponent(market)}&oddsFormat=american`;
  const res = await fetch(url);
  if (!res.ok){
    const t = await res.text().catch(()=> String(res.status));
    throw new Error(`fetch ${sport}/${market} -> ${res.status}: ${t.slice(0,160)}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function handler() {
  const apiKey = env("THEODDS_API_KEY") || env("ODDS_API_KEY");
  const regions = env("ODDS_REGIONS","us,us2");
  const sports = env("ODDS_SPORT","baseball_mlb").split(",").map(s=>s.trim()).filter(Boolean);
  const marketsInput = env("ODDS_MARKETS","h2h,spreads,totals").split(",").map(m=>m.trim()).filter(Boolean);
  const storeName = env("BLOBS_STORE","mlb-odds");

  if (!apiKey) return { statusCode: 400, body: JSON.stringify({ ok:false, error:"Missing THEODDS_API_KEY/ODDS_API_KEY" }) };

  const siteID = env("NETLIFY_SITE_ID",""); const token = env("NETLIFY_BLOBS_TOKEN","");
  const store = (siteID && token) ? getStore({ name: storeName, siteID, token }) : getStore(storeName);

  const offers = []; const errors = []; let fetches = 0;
  for (const sport of sports){
    const allow = ALLOW[sport] || new Set(["h2h","spreads","totals"]);
    for (const mkt of marketsInput){
      if (!allow.has(mkt)){ errors.push({ sport, market:mkt, skipped:true, reason:"not-allowed-for-sport" }); continue; }
      try{
        const events = await fetchSportMarket({ apiKey, sport, market:mkt, regions }); fetches++;
        for (const ev of (Array.isArray(events)?events:[])){
          for (const bm of (Array.isArray(ev.bookmakers)?ev.bookmakers:[])){
            for (const mk of (Array.isArray(bm.markets)?bm.markets:[])){
              const marketKey = mk.key || mkt;
              for (const oc of (Array.isArray(mk.outcomes)?mk.outcomes:[])){
                const offer = normalizeOutcomeToOffer({ sport, marketKey, event: ev, bookmaker: bm, outcome: oc });
                if (offer) offers.push(offer);
              }
            }
          }
        }
        await sleep(200);
      }catch(e){
        errors.push({ sport, market:mkt, error: e.message });
        await sleep(100);
      }
    }
  }

  try{
    const payload = { provider:"theoddsapi", regions: regions.split(",").map(x=>x.trim()), sports, markets: marketsInput, fetched: new Date().toISOString(), count: offers.length, offers };
    
  // PATCH: Build hr_from_player_props if explicit HR market came back empty
  try {
    if (!Array.isArray(offers) || offers.length === 0) {
      const hrProps = extractHRProps(all_offers || offers || []);
      if (hrProps.length) {
        if (!payload_extra) var payload_extra = {};
        payload_extra.hr_from_player_props = hrProps;
      }
    }
  } catch {}
await store.set("latest.json", JSON.stringify(payload), { contentType:"application/json" });
    return { statusCode: 200, headers:{ "content-type":"application/json" }, body: JSON.stringify({ ok:true, wrote:"latest.json", offers: offers.length, fetches, errors }) };
  }catch(e){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:"write latest.json failed: " + e.message, partialOffers: offers.length, errors }) };
  }
}
