// netlify/functions/odds-hits2.mjs
// MLB 2+ Hits odds via TheOddsAPI: market=player_hits (Over @ point >= 1.5), regions=us, oddsFormat=american.
// Optional ALT fallback via ALT_ODDS_URL + ALT_ODDS_HEADER + ALT_ODDS_API_KEY.
const norm = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\./g,"").replace(/\s+/g," ").trim().toLowerCase();
const americanToDecimal = a => { if(a==null) return null; const n=Number(a); if(!isFinite(n)) return null; return n>0?1+n/100:1+100/Math.abs(n); };
const decToAmerican = d => { if(!d||d<=1) return null; return d>=2? Math.round((d-1)*100): Math.round(-100/(d-1)); };

async function fetchJson(url, headers={}) {
  const r = await fetch(url, { headers: { "User-Agent":"hits2/1.0", ...headers }, cache:"no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.json();
}

function pickBestByPlayer(candidates) {
  const best = new Map();
  for (const o of candidates) {
    const prev = best.get(o.playerKey);
    if (!prev || o.decimal > prev.decimal) best.set(o.playerKey, o);
  }
  return Array.from(best.values());
}

// 1) Primary: /odds endpoint with market=player_hits
async function fromTOAOdds(apiKey, date) {
  const markets = (process.env.ODDS_MARKET_HITS || "player_hits").split(",").map(s=>s.trim()).filter(Boolean);
  const url = `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?apiKey=${apiKey}&regions=us&oddsFormat=american&markets=${encodeURIComponent(markets.join(","))}&dateFormat=iso${date?`&date=${date}`:""}`;
  const arr = await fetchJson(url).catch(()=>null);
  if (!Array.isArray(arr)) return { offers: [], path: "toa:odds-error" };

  const offers = [];
  for (const ev of arr) {
    const eventId = ev.id;
    for (const bk of (ev.bookmakers||[])) {
      for (const mkt of (bk.markets||[])) {
        // The market is already player_hits
        const point = mkt.point; // may be undefined; outcomes can still have point
        for (const oc of (mkt.outcomes||[])) {
          const name = (oc.name || "").toLowerCase();
          const desc = oc.description || oc.participant || oc.player || "";
          const player = desc || ""; // TheOddsAPI uses description as player name here
          const outcomePoint = oc.point ?? point;
          const isOver = name === "over" || /over/.test(name);
          const ok15 = outcomePoint!=null ? Number(outcomePoint) >= 1.5 : /1\.5/.test(name);
          if (!isOver || !ok15 || !player) continue;

          const key = norm(player);
          const am = typeof oc.price === "number" ? oc.price : (typeof oc.american === "number" ? oc.american : null);
          const dec = americanToDecimal(am) ?? (typeof oc.decimal === "number" ? oc.decimal : null);
          if (!dec || dec <= 1) continue;

          offers.push({
            player, playerKey: key, american: am ?? decToAmerican(dec), decimal: dec,
            book: bk.key, source: "theoddsapi/odds", eventId
          });
        }
      }
    }
  }
  return { offers: pickBestByPlayer(offers), path: "toa:odds" };
}

// 2) Fallback: ALT provider (optional)
async function fromAlt(date) {
  const base = process.env.ALT_ODDS_URL;
  if (!base) return { offers: [], path: "alt:none" };
  const hdrName = process.env.ALT_ODDS_HEADER || "";
  const key = process.env.ALT_ODDS_API_KEY || "";
  const headers = hdrName && key ? { [hdrName]: key } : {};
  const q = new URLSearchParams({ sport: "mlb", market: "player_hits", date }).toString();
  const j = await fetchJson(`${base}${base.includes("?")?"&":"?"}${q}`, headers).catch(()=>null);
  if (!j) return { offers: [], path: "alt:error" };

  const offers = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node.outcomes)) {
      for (const oc of node.outcomes) {
        const name = (oc.name || "").toLowerCase();
        const desc = oc.description || oc.participant || oc.player || "";
        const isOver = name === "over" || /over/.test(name);
        const point = oc.point ?? node.point;
        if (!isOver || !(point!=null && Number(point) >= 1.5) || !desc) continue;
        const am = oc.american ?? oc.price ?? oc.odds;
        const dec = americanToDecimal(am) ?? oc.decimal;
        if (!dec || dec <= 1) continue;
        offers.push({ player: desc, playerKey: norm(desc), american: am ?? decToAmerican(dec), decimal: dec, book: node.bookmaker || node.book || "alt", source: "alt" });
      }
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === "object") visit(v);
      if (Array.isArray(v)) for (const it of v) visit(it);
    }
  };
  visit(j);
  return { offers: pickBestByPlayer(offers), path: "alt" };
}

export const handler = async (event) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const date = params.get("date") || new Date().toISOString().slice(0,10);
    const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;

    let res = { offers: [], path: "none" };
    if (apiKey) res = await fromTOAOdds(apiKey, date);
    if (!res.offers.length) res = await fromAlt(date);

    return {
      statusCode: 200,
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ ok:true, provider: res.offers.length ? res.offers[0]?.source || "unknown" : "none", usingOddsApi: !!apiKey, path: res.path, count: res.offers.length, offers: res.offers })
    };
  } catch (err) {
    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:false, error:String(err), count:0, offers:[] }) };
  }
};
