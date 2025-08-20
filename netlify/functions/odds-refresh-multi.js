// netlify/functions/odds-refresh-multi.js (CommonJS version)
// - Avoids ESM import errors by using require/exports.handler
// - Requests player_props for MLB and maps labels back to canonical keys
// - Respects env overrides but self-heals invalid MLB markets
// - Writes a single latest.json blob that your UI already reads

const { getStore } = require("@netlify/blobs");

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

function uniq(arr){ return Array.from(new Set(arr.filter(Boolean))); }

function effectiveMarketsForMLB(marketsInput){
  // If caller asked for invalid v4 markets, rewrite to player_props.
  const wantsProps = marketsInput.some(m => BAD_PLAYER_MARKETS.has(m)) || marketsInput.includes("player_props");
  const base = marketsInput.filter(m => !BAD_PLAYER_MARKETS.has(m));
  if (wantsProps && !base.includes("player_props")) base.push("player_props");
  // Always allow game lines too if requested elsewhere
  return uniq(base.length ? base : ["player_props"]);
}

async function fetchOdds({ sport, regions, markets, apiKey }){
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
  url.searchParams.set("regions", regions.join(","));
  url.searchParams.set("markets", markets.join(","));
  url.searchParams.set("oddsFormat", "american");
  // NOTE: you can set bookmakers= if you want to restrict; leaving default = all
  url.searchParams.set("apiKey", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fetch ${sport}/${markets.join(",")} -> ${res.status}: ${text}`);
  }
  return res.json(); // array of events
}

function normalizeOffersFromEvents(events, { sport, requestedMarkets }){
  const offers = [];
  const diagCounts = {};
  const inc = (k)=>diagCounts[k]=(diagCounts[k]||0)+1;

  for (const ev of (events||[])) {
    const gameId = ev.id || ev.commence_time || ev.event_id || ev.key || "";
    for (const bk of (ev.bookmakers||[])) {
      const bookKey = bk.key || bk.bookmaker || bk.bookmaker_key || "unknown";
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
  return { offers, diagCounts };
}

exports.handler = async function(event, context){
  const started = Date.now();
  try {
    const storeName = process.env.BLOBS_STORE || "mlb-odds";
    const store = getStore(storeName);

    const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
    if (!apiKey) throw new Error("Missing THEODDS_API_KEY");

    const sport = process.env.ODDS_SPORT || "baseball_mlb";
    const regions = (process.env.ODDS_REGIONS || process.env.ODDSAPI_REGION || "us,us2").split(",").map(s=>s.trim()).filter(Boolean);
    const marketsInput = (process.env.ODDS_MARKETS||"").split(",").map(s=>s.trim()).filter(Boolean);

    const markets = (sport === "baseball_mlb")
      ? effectiveMarketsForMLB(marketsInput)
      : uniq(marketsInput.length ? marketsInput : ["h2h","spreads","totals"]);

    const events = await fetchOdds({ sport, regions, markets, apiKey });
    const { offers, diagCounts } = normalizeOffersFromEvents(events, { sport, requestedMarkets: marketsInput });

    const payload = {
      provider: "theoddsapi",
      regions,
      sports: [sport],
      markets,
      fetched: new Date().toISOString(),
      count: offers.length,
      offers,
      diag: {
        requestedMarkets: marketsInput,
        effectiveMarkets: markets,
        countsByMarket: diagCounts
      }
    };

    await store.setJSON("latest.json", payload);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok:true, wrote:"latest.json", count: offers.length, timeMs: Date.now()-started, diag: payload.diag })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(err.message || err), stack: String(err.stack||"") })
    };
  }
};
