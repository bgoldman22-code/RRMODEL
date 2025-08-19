// netlify/functions/odds-refresh-multi.js
const fetch = require("node-fetch");
const { getStore } = require("@netlify/blobs");

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
function getEnv(name, fallback){ return (process.env[name] || process.env[name.toUpperCase()] || fallback || "").toString().trim(); }
function americanFromDecimal(decimal){ const d=Number(decimal); if(!isFinite(d)||d<=1) return -100; return d>=2?Math.round((d-1)*100):Math.round(-100/(d-1)); }
function pickAmerican(outcome){
  if (outcome.price && typeof outcome.price.american !== "undefined"){ const a = Number(outcome.price.american); if (!Number.isNaN(a)) return a; }
  if (typeof outcome.price_american === "number") return outcome.price_american;
  if (typeof outcome.american === "number") return outcome.american;
  if (typeof outcome.price === "number") return outcome.price;
  if (typeof outcome.price_decimal === "number") return americanFromDecimal(outcome.price_decimal);
  if (typeof outcome.decimal === "number") return americanFromDecimal(outcome.decimal);
  return null;
}
function safeId(parts){ return parts.filter(Boolean).join("|").replace(/\s+/g," ").trim(); }
function normalizeOutcomeToOffer({ sport, marketKey, event, bookmaker, outcome }){
  const american = pickAmerican(outcome); if (american == null) return null;
  const player = outcome.player || outcome.description || outcome.name || outcome.runner || null;
  const team = outcome.team || outcome.participant || null;
  const id = outcome.id || safeId([player || team, marketKey, event?.id || event?.commence_time, bookmaker?.key || bookmaker?.title]);
  const groupKey = `${event?.id || event?.commence_time || "na"}:${marketKey}`;
  return { id, american, market: marketKey, sport, gameId: event?.id || event?.commence_time || null, player: player || null, team: team || null, book: bookmaker?.key || bookmaker?.title || "agg", sgpOk: true, groupKey };
}
async function fetchSportMarket({ apiKey, sport, market, regions }){
  const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds?apiKey=${encodeURIComponent(apiKey)}&regions=${encodeURIComponent(regions)}&markets=${encodeURIComponent(market)}&oddsFormat=american`;
  const res = await fetch(url);
  if (!res.ok){ const t = await res.text().catch(()=>String(res.status)); throw new Error(`fetch ${sport}/${market} -> ${res.status}: ${t.slice(0,160)}`); }
  const data = await res.json(); return Array.isArray(data) ? data : [];
}
exports.handler = async () => {
  const apiKey = getEnv("THEODDS_API_KEY","") || getEnv("ODDS_API_KEY","");
  const regions = getEnv("ODDS_REGIONS","us,us2");
  const sports = getEnv("ODDS_SPORT","baseball_mlb").split(",").map(s=>s.trim()).filter(Boolean);
  const markets = getEnv("ODDS_MARKETS","batter_home_runs").split(",").map(m=>m.trim()).filter(Boolean);
  const storeName = getEnv("BLOBS_STORE","mlb-odds");
  if (!apiKey){ return { statusCode: 400, body: JSON.stringify({ ok:false, error: "Missing THEODDS_API_KEY/ODDS_API_KEY" }) }; }
  const offers = []; const errors = []; let fetchCount = 0;
  for (const sport of sports){
    for (const market of markets){
      try{
        const events = await fetchSportMarket({ apiKey, sport, market, regions }); fetchCount++;
        for (const ev of (Array.isArray(events)?events:[])){
          for (const bm of (Array.isArray(ev.bookmakers)?ev.bookmakers:[])){
            for (const mk of (Array.isArray(bm.markets)?bm.markets:[])){
              const marketKey = mk.key || market;
              for (const oc of (Array.isArray(mk.outcomes)?mk.outcomes:[])){
                const offer = normalizeOutcomeToOffer({ sport, marketKey, event: ev, bookmaker: bm, outcome: oc });
                if (offer) offers.push(offer);
              }
            }
          }
        }
        await sleep(220);
      } catch (e){
        errors.push({ sport, market, error: e.message }); await sleep(120);
      }
    }
  }
  try {
    const store = getStore(storeName);
    const payload = { provider: "theoddsapi", regions: regions.split(",").map(x=>x.trim()), sports, markets, fetched: new Date().toISOString(), count: offers.length, offers };
    await store.set("latest.json", JSON.stringify(payload), { contentType: "application/json" });
    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:true, wrote:"latest.json", offers: offers.length, fetches: fetchCount, errors }) };
  } catch (e){
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: "write latest.json failed: " + e.message, partialOffers: offers.length, errors }) };
  }
};