// netlify/functions/odds-refresh-multi.js
// ESM + Blobs binding + per-sport market allowlist (skips invalid combos)
// Uses built-in fetch (Node 18+).

import { getStore } from "@netlify/blobs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = (k, d = "") => String(process.env[k] || process.env[k.toUpperCase()] || d).trim();

// Minimal allowlist to avoid INVALID_MARKET 422s on TheOddsAPI "odds" endpoint.
// This is not exhaustive—add more as needed per docs.
const ALLOW = {
  baseball_mlb: new Set(["h2h","spreads","totals","player_home_runs","player_total_bases","player_rbis","player_runs","player_hits","pitcher_strikeouts"]),
  basketball_nba: new Set(["h2h","spreads","totals","player_points","player_rebounds","player_assists","player_threes"]),
  americanfootball_nfl: new Set(["h2h","spreads","totals","player_pass_tds","player_pass_yds","player_rush_yds","player_rec_yds","player_anytime_td"]),
  icehockey_nhl: new Set(["h2h","spreads","totals","player_shots_on_goal","player_points"]),
  soccer_usa: new Set(["h2h","spreads","totals"]) // keep it simple first
};

function americanFromDecimal(decimal) {
  const d = Number(decimal);
  if (!isFinite(d) || d <= 1) return -100;
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}
function pickAmerican(outcome) {
  if (outcome?.price && typeof outcome.price.american !== "undefined") {
    const a = Number(outcome.price.american);
    if (!Number.isNaN(a)) return a;
  }
  if (typeof outcome?.price_american === "number") return outcome.price_american;
  if (typeof outcome?.american === "number") return outcome.american;
  if (typeof outcome?.price === "number") return outcome.price;
  if (typeof outcome?.price_decimal === "number")
    return americanFromDecimal(outcome.price_decimal);
  if (typeof outcome?.decimal === "number") return americanFromDecimal(outcome.decimal);
  return null;
}
const safeId = (parts) => parts.filter(Boolean).join("|").replace(/\s+/g, " ").trim();
function normalizeOutcomeToOffer({ sport, marketKey, event, bookmaker, outcome }) {
  const american = pickAmerican(outcome);
  if (american == null) return null;
  const player = outcome.player || outcome.description || outcome.name || outcome.runner || null;
  const team = outcome.team || outcome.participant || null;
  const id = outcome.id || safeId([player || team, marketKey, event?.id || event?.commence_time, bookmaker?.key || bookmaker?.title]);
  const groupKey = `${event?.id || event?.commence_time || "na"}:${marketKey}`;
  return { id, american, market: marketKey, sport, gameId: event?.id || event?.commence_time || null, player: player || null, team: team || null, book: bookmaker?.key || bookmaker?.title || "agg", sgpOk: true, groupKey };
}
async function fetchSportMarket({ apiKey, sport, market, regions }) {
  const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds?apiKey=${encodeURIComponent(apiKey)}&regions=${encodeURIComponent(regions)}&markets=${encodeURIComponent(market)}&oddsFormat=american`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text().catch(() => String(res.status));
    throw new Error(`fetch ${sport}/${market} -> ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function handler() {
  const apiKey = env("THEODDS_API_KEY") || env("ODDS_API_KEY");
  const regions = env("ODDS_REGIONS", "us,us2");
  const sports = env("ODDS_SPORT", "baseball_mlb").split(",").map((s) => s.trim()).filter(Boolean);
  const marketsInput = env("ODDS_MARKETS", "batter_home_runs,h2h,spreads,totals").split(",").map((m) => m.trim()).filter(Boolean);
  const storeName = env("BLOBS_STORE", "mlb-odds");

  if (!apiKey) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Missing THEODDS_API_KEY/ODDS_API_KEY" }) };
  }

  // Prepare Blobs store (site-bound if vars provided)
  const siteID = env("NETLIFY_SITE_ID", "");
  const token = env("NETLIFY_BLOBS_TOKEN", "");
  const store = (siteID && token) ? getStore({ name: storeName, siteID, token }) : getStore(storeName);

  const offers = [];
  const errors = [];
  let fetchCount = 0;

  for (const sport of sports) {
    const allow = ALLOW[sport] || new Set(["h2h","spreads","totals"]); // conservative fallback
    for (const mkt of marketsInput) {
      if (!allow.has(mkt)) { 
        errors.push({ sport, market: mkt, skipped: true, reason: "not-allowed-for-sport" });
        continue;
      }
      try {
        const events = await fetchSportMarket({ apiKey, sport, market: mkt, regions });
        fetchCount++;
        for (const ev of events) {
          const bmList = Array.isArray(ev.bookmakers) ? ev.bookmakers : [];
          for (const bm of bmList) {
            const mList = Array.isArray(bm.markets) ? bm.markets : [];
            for (const mk of mList) {
              const marketKey = mk.key || mkt;
              const outs = Array.isArray(mk.outcomes) ? mk.outcomes : [];
              for (const oc of outs) {
                const offer = normalizeOutcomeToOffer({ sport, marketKey, event: ev, bookmaker: bm, outcome: oc });
                if (offer) offers.push(offer);
              }
            }
          }
        }
        await sleep(220);
      } catch (e) {
        errors.push({ sport, market: mkt, error: e.message });
        await sleep(120);
      }
    }
  }

  try {
    const payload = { provider: "theoddsapi", regions: regions.split(",").map((x) => x.trim()), sports, markets: marketsInput, fetched: new Date().toISOString(), count: offers.length, offers };
    await store.set("latest.json", JSON.stringify(payload), { contentType: "application/json" });
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true, wrote: "latest.json", offers: offers.length, fetches: fetchCount, errors }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "write latest.json failed: " + e.message, partialOffers: offers.length, errors }) };
  }
}
