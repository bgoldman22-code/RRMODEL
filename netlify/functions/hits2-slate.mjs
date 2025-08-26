/**
 * MLB 2+ Hits slate (Over 1.5 / "2+") — ultra-robust
 * Accepts OddsAPI shapes:
 * - offers[].outcomes[] (already flattened)
 * - offers[].markets[].outcomes[]
 * - offers[].bookmakers[].markets[].outcomes[]
 * Filters market keys: batter_hits, batter_hits_alternate
 * Picks Over @ 1.5 or "2+" style outcomes, builds rows with odds-implied p.
 */
const CORS = { "access-control-allow-origin":"*", "access-control-allow-methods":"GET, OPTIONS", "content-type":"application/json" };
const siteFallback = "https://bgroundrobin.com";
const HITS_MARKETS = new Set(["batter_hits","batter_hits_alternate"]);

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
function outcomeIsOver2Plus(o) {
  const name = (o?.name||"").toLowerCase();
  const desc = (o?.description||"").toLowerCase();
  const label = (o?.label||"").toLowerCase();
  const any = `${name} ${desc} ${label}`;
  const has2plus = /(^|\s)2\+(\s|$)/.test(any);
  let pt = (o?.point!=null && !isNaN(Number(o.point))) ? Number(o.point) : null;
  if (!pt) {
    // sometimes "Over 1.5" lives in description/label
    const p2 = parsePointFromText(any);
    if (p2) pt = p2;
  }
  const isOverWord = name==="over" || name.startsWith("over") || /(^|\s)over(\s|$)/.test(any);
  if (has2plus) return { ok:true, point: 1.5 };
  if (isOverWord && pt!=null && Math.abs(pt-1.5)<1e-6) return { ok:true, point: 1.5 };
  return { ok:false };
}
function pickPlayerLabel(o, ctx) {
  return title(o?.description || o?.player || ctx?.player || ctx?.participant || ctx?.participant_name || ctx?.athlete || ctx?.label || "");
}
function* iterOutcomes(offer) {
  // already flattened
  if (Array.isArray(offer?.outcomes)) {
    for (const o of offer.outcomes) yield { o, book: (offer?.bookmaker||offer?.book||"book"), game: (offer?.game||offer?.matchup||"") , market: offer?.market || offer?.key };
  }
  // markets under offer
  if (Array.isArray(offer?.markets)) {
    for (const m of offer.markets) {
      const key = m?.key || m?.market;
      if (!HITS_MARKETS.has(String(key||""))) continue;
      for (const o of (m?.outcomes||[])) yield { o, book: (offer?.bookmaker||offer?.book||"book"), game:(offer?.game||offer?.matchup||""), market:key };
    }
  }
  // bookmakers -> markets
  if (Array.isArray(offer?.bookmakers)) {
    const game = offer?.game || offer?.matchup || "";
    for (const b of offer.bookmakers) {
      const bm = b?.title || b?.key || b?.bookmaker || "book";
      for (const m of (b?.markets||[])) {
        const key = m?.key || m?.market;
        if (!HITS_MARKETS.has(String(key||""))) continue;
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
    const oddsURL = `${origin}/.netlify/functions/odds-hits2?date=${encodeURIComponent(date)}`;

    const res = await fetch(oddsURL);
    const odds = await res.json().catch(()=> ({}));
    const meta = { provider: odds?.provider || odds?.source || null, usingOddsApi: !!odds?.usingOddsApi };
    const offers = Array.isArray(odds?.offers) ? odds.offers : [];

    const best = new Map(); // player -> best decimal price
    for (const off of offers) {
      for (const {o, book, game} of iterOutcomes(off)) {
        const dec = asDecimal(o); if (!dec) continue;
        const chk = outcomeIsOver2Plus(o); if (!chk.ok) continue;
        const player = pickPlayerLabel(o, off); if (!player) continue;
        const key = player.toLowerCase();
        const prev = best.get(key);
        if (!prev || dec > prev.dec) best.set(key, { player, dec, book, game, point: chk.point });
      }
    }

    if (best.size === 0) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:true, date, meta, count:0, players:[] }) };
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
        why: `Odds-implied • Over ${point?.toFixed(1)||'1.5'} hits • ${dec.toFixed(2)} @ ${book}`
      });
    }
    players.sort((a,b)=> b.ev - a.ev);

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:true, date, meta, count: players.length, players }) };
  } catch (e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:false, error:String(e), count:0, players:[] }) };
  }
};
