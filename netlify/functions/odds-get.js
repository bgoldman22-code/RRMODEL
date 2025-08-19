// netlify/functions/odds-get.js
// ESM: Read from Netlify Blobs and merge MLB props blobs into offers[]

import { getStore } from "@netlify/blobs";

const env = (k, d = "") => String(process.env[k] || process.env[k.toUpperCase()] || d).trim();
const tryJson = async (t) => { try { return JSON.parse(t); } catch { return null; } };

const BOOK_NAME = (key, title) => {
  const k = String(key||"").toLowerCase();
  if (k.includes("fanduel")) return "FanDuel";
  if (k.includes("draftkings")) return "DraftKings";
  if (k.includes("williamhill") || k.includes("caesars")) return "Caesars";
  if (k.includes("mgm")) return "BetMGM";
  if (k.includes("pointsbet")) return "PointsBet";
  if (k.includes("betrivers")) return "BetRivers";
  return title || key || "AGG";
};

const safeId = (parts) => parts.filter(Boolean).join("|").replace(/\s+/g, " ").trim();

function pickAmerican(o){
  if (o == null) return null;
  if (typeof o.american === "number") return o.american;
  if (typeof o.american === "string") return Number(o.american);
  if (o.price?.american != null) return Number(o.price.american);
  if (typeof o.odds === "number") return o.odds;
  if (typeof o.odds_american === "string") return Number(o.odds_american);
  if (typeof o.oddsAmerican === "string") return Number(o.oddsAmerican);
  if (typeof o.americanOdds === "string") return Number(o.americanOdds);
  if (typeof o.median_american === "number") return o.median_american;
  if (typeof o.medianAmerican === "number") return o.medianAmerican;
  return null;
}

function normalizeOffer(o){
  const american = pickAmerican(o);
  if (american == null) return null;
  const id = o.id || safeId([o.player || o.team || o.outcome, o.market, o.gameId || o.eventId || o.commence_time, o.bookKey || o.book]);
  return {
    id,
    american: Number(american),
    market: o.market || o.marketKey || o.label || "market",
    sport: o.sport || o.league || null,
    gameId: o.gameId || o.eventId || o.commence_time || null,
    player: o.player || null,
    team: o.team || null,
    outcome: o.outcome || null,
    book: BOOK_NAME(o.bookKey, o.book) || null,
    bookKey: o.bookKey || null,
    sgpOk: o.sgpOk ?? true,
    groupKey: o.groupKey || `${o.gameId || o.eventId || "na"}:${o.market || o.marketKey || "market"}`
  };
}

function playersMapToOffers(json, fallbackMarket){
  const offers = [];
  if (!json || typeof json !== "object") return offers;
  const players = json.players || {};
  const date = json.date || new Date().toISOString().slice(0,10);
  const market = json.market || fallbackMarket;
  for (const [name, info] of Object.entries(players)){
    const american = pickAmerican(info);
    if (american == null) continue;
    offers.push({
      id: `${name}|${market}|${date}|AGG`,
      american,
      market,
      sport: "baseball_mlb",
      gameId: date,
      player: name,
      team: null,
      outcome: null,
      book: "AGG",
      bookKey: "agg",
      sgpOk: true,
      groupKey: `${date}:${market}`
    });
  }
  return offers;
}

export async function handler(){
  try{
    const storeName = env("BLOBS_STORE","mlb-odds");
    const siteID = env("NETLIFY_SITE_ID",""); const token = env("NETLIFY_BLOBS_TOKEN","");
    const store = (siteID && token) ? getStore({ name: storeName, siteID, token }) : getStore(storeName);

    // latest odds
    const latest = await store.get("latest.json");
    const latestText = await latest?.text?.();
    const latestJson = latestText ? await tryJson(latestText) : null;
    const baseOffers = Array.isArray(latestJson?.offers) ? latestJson.offers.map(normalizeOffer).filter(Boolean) : [];

    // optional props blobs
    const merged = [...baseOffers];

    const tryAdd = async (key, fallbackMarket) => {
      const blob = await store.get(key);
      const txt = await blob?.text?.();
      if (!txt) return;
      const js = await tryJson(txt);
      if (!js) return;
      if (Array.isArray(js.offers)){
        js.offers.forEach(x => { const n = normalizeOffer({ ...x, market: x.market || fallbackMarket }); if (n) merged.push(n); });
      }else if (js.players){
        playersMapToOffers(js, fallbackMarket).forEach(x => merged.push(x));
      }
    };

    await tryAdd("props/latest_hrrbi.json", "player_rbis");
    await tryAdd("props/latest_tb.json", "player_total_bases");

    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:true, offers: merged }) };
  }catch(e){
    return { statusCode: 500, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:false, error: String(e.message||e) }) };
  }
}
