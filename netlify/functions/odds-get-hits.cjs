// netlify/functions/odds-get-hits.cjs
// Backward-compatible odds getter for MLB **2+ Hits** props, mirroring hr odds-get.cjs style.
// Reads Netlify Blobs snapshots and returns a simple players map with best price per player.
const { getStore } = require("@netlify/blobs");

const STORE = process.env.BLOBS_STORE || "rrmodelblobs";
const SITE_ID = process.env.NETLIFY_SITE_ID;
const TOKEN = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;

function getStoreSafe(){
  try { return getStore({ name: STORE }); } 
  catch { return getStore({ name: STORE, siteID: SITE_ID, token: TOKEN }); }
}
function stripDiacritics(s){ try { return s.normalize("NFD").replace(/[\u0300-\u036f]/g,""); } catch { return s; } }
function normName(s){
  return stripDiacritics(String(s||"").toLowerCase().replace(/\./g,"").replace(/\s+/g," ").trim());
}

const CANDIDATE_KEYS = [
  process.env.ODDS_SNAPSHOT_HITS_KEY || "odds_batter_hits.json",
  "hits_latest.json",
  "odds_batter_player_hits.json"
];

exports.handler = async (event, context) => {
  const tried = [];
  try {
    const store = getStoreSafe();
    let snap = null, usedKey = null;
    for (const key of CANDIDATE_KEYS) {
      try {
        const blob = await store.get(key);
        if (blob) { snap = JSON.parse(blob); usedKey = key; break; }
        tried.push({ where:"blobs", key, ok:false, note:"empty" });
      } catch (e) {
        tried.push({ where:"blobs", key, ok:false, error:String(e) });
      }
    }
    if (!snap || typeof snap !== "object") {
      return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok:false, source:"blobs", tried }) };
    }

    // Accept shapes: {offers:[{player,american,book}]}, or {players:{name:{by_book:{bk:price}}}} like HR
    const best = new Map();

    const addOffer = (name, american, book) => {
      if (!name) return;
      const k = normName(name);
      const price = Number(american);
      if (!Number.isFinite(price)) return;
      const prev = best.get(k);
      const dec = price>0? 1+price/100 : 1+100/Math.abs(price);
      const prevDec = prev ? (prev.american>0? 1+prev.american/100 : 1+100/Math.abs(prev.american)) : 0;
      if (!prev || dec > prevDec) best.set(k, { player: name, american: price, book });
    };

    if (Array.isArray(snap.offers)) {
      for (const o of snap.offers) addOffer(o.player || o.name, o.american ?? o.price ?? o.odds, o.book || o.bookKey);
    }
    if (snap.players && typeof snap.players === "object") {
      for (const [name, info] of Object.entries(snap.players)) {
        if (info && info.by_book && typeof info.by_book === "object") {
          for (const [bk, price] of Object.entries(info.by_book)) addOffer(name, price, bk);
        } else if (Array.isArray(info.prices)) {
          for (const p of info.prices) addOffer(name, p, "agg");
        }
      }
    }

    const players = {};
    for (const v of best.values()) {
      players[v.player] = { best_american: v.american, best_book: v.book };
    }
    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:true, source:"blobs", key: usedKey, count: Object.keys(players).length, players }) };
  } catch (e) {
    tried.push({ where:"handler", ok:false, error:String(e) });
    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:false, tried }) };
  }
};
