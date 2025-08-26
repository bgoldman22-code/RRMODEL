/**
 * MLB HRR slate — ultra-robust
 * Traverses OddsAPI shapes and filters markets:
 *   batter_hits_runs_rbis, batter_hits_runs_rbis_alternate
 * Accepts Over @ 1.5 or 2.5. Uses odds-implied p as fallback model.
 */
const CORS = { "access-control-allow-origin":"*", "access-control-allow-methods":"GET, OPTIONS", "content-type":"application/json" };
const siteFallback = "https://bgroundrobin.com";
const HRR_MARKETS = new Set(["batter_hits_runs_rbis","batter_hits_runs_rbis_alternate"]);

function baseOrigin(event) {
  if (process.env.URL && /^https?:\/\//.test(process.env.URL)) return process.env.URL.replace(/\/+$/,"");
  const host = event?.headers?.host;
  if (host) return `https://${host}`;
  return siteFallback;
}
const toAmerican = (dec) => (!dec || dec <= 1) ? 0 : (dec >= 2 ? Math.round((dec-1)*100) : Math.round(-100/(dec-1)));
const clamp = (x, a=0, b=1) => Math.max(a, Math.min(b, x));
const evDecimal = (p, dec) => (p * (dec - 1)) - (1 - p);
const title = (s) => (s||"").replace(/\s+/g," ").trim().replace(/\b\w/g, c=>c.toUpperCase());

function asDecimal(o) {
  if (!o) return null;
  const dec = Number(o.price ?? o.odds ?? o.decimal ?? o.decimalOdds);
  return (isFinite(dec) && dec > 1) ? dec : null;
}
function parsePointFromText(txt) {
  if (!txt) return null;
  const m = String(txt).toLowerCase().match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : null;
}
function outcomeIsOverHRR(o) {
  const name = (o?.name||"").toLowerCase();
  const desc = (o?.description||"").toLowerCase();
  const label = (o?.label||"").toLowerCase();
  const any = `${name} ${desc} ${label}`;
  let pt = (o?.point!=null && !isNaN(Number(o.point))) ? Number(o.point) : parsePointFromText(any);
  const isOver = name==="over" || name.startsWith("over") || /(^|\s)over(\s|$)/.test(any);
  if (!isOver || pt==null) return { ok:false };
  if (Math.abs(pt-1.5)<1e-6 || Math.abs(pt-2.5)<1e-6) return { ok:true, point: pt };
  return { ok:false };
}
function pickPlayerLabel(o, ctx) {
  return title(o?.description || o?.player || ctx?.player || ctx?.participant || ctx?.participant_name || ctx?.athlete || ctx?.label || "");
}
function* iterOutcomes(offer) {
  if (Array.isArray(offer?.outcomes)) {
    const key = offer?.market || offer?.key;
    if (HRR_MARKETS.has(String(key||""))) {
      for (const o of offer.outcomes) yield { o, book:(offer?.bookmaker||offer?.book||"book"), game:(offer?.game||offer?.matchup||""), market:key };
    }
  }
  if (Array.isArray(offer?.markets)) {
    for (const m of offer.markets) {
      const key = m?.key || m?.market;
      if (!HRR_MARKETS.has(String(key||""))) continue;
      for (const o of (m?.outcomes||[])) yield { o, book:(offer?.bookmaker||offer?.book||"book"), game:(offer?.game||offer?.matchup||""), market:key };
    }
  }
  if (Array.isArray(offer?.bookmakers)) {
    const game = offer?.game || offer?.matchup || "";
    for (const b of offer.bookmakers) {
      const bm = b?.title || b?.key || b?.bookmaker || "book";
      for (const m of (b?.markets||[])) {
        const key = m?.key || m?.market;
        if (!HRR_MARKETS.has(String(key||""))) continue;
        for (const o of (m?.outcomes||[])) yield { o, book: bm, game, market:key };
      }
    }
  }
}

export const handler = async (event) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const date = params.get("date") || new Date().toISOString().slice(0,10);
    const origin = baseOrigin(event);
    const oddsURL = `${origin}/.netlify/functions/odds-hrr?date=${encodeURIComponent(date)}`;

    const res = await fetch(oddsURL);
    const odds = await res.json().catch(()=> ({}));
    const meta = { provider: odds?.provider || odds?.source || null, usingOddsApi: !!odds?.usingOddsApi };
    const offers = Array.isArray(odds?.offers) ? odds.offers : [];

    const best = new Map();
    for (const off of offers) {
      for (const {o, book, game} of iterOutcomes(off)) {
        const dec = asDecimal(o); if (!dec) continue;
        const chk = outcomeIsOverHRR(o); if (!chk.ok) continue;
        const player = pickPlayerLabel(o, off); if (!player) continue;
        const key = player.toLowerCase();
        const prev = best.get(key);
        if (!prev || dec > prev.dec) best.set(key, { player, dec, book, game, point: chk.point });
      }
    }

    if (best.size === 0) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:true, market: odds?.market ?? null, date, meta, count:0, players:[] }) };
    }

    const players = [];
    for (const {player, dec, book, game, point} of best.values()) {
      let p = 1/dec;
      p = clamp(p * 1.02, 0.02, 0.95);
      players.push({
        player, team:"", game,
        modelProb: p,
        modelOdds: toAmerican(1/Math.max(p, 1e-9)),
        realOdds: toAmerican(dec),
        ev: evDecimal(p, dec),
        why: `Odds-implied • Over ${point?.toFixed(1)} HRR • ${dec.toFixed(2)} @ ${book}`
      });
    }
    players.sort((a,b)=> b.ev - a.ev);

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:true, market: odds?.market ?? null, date, meta, count: players.length, players }) };
  } catch (e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:false, error:String(e), count:0, players:[] }) };
  }
};
