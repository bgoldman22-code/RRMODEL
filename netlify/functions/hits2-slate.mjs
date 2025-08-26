/**
 * MLB 2+ Hits slate — robust parser + odds-implied fallback
 * - Reads odds from /.netlify/functions/odds-hits2
 * - Accepts Over at 1.5 and common "2+" labels
 * - Populates rows even if model feed is disconnected (uses odds-implied prob)
 * - Always returns HTTP 200 + JSON to avoid Netlify decode errors
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "content-type": "application/json"
};

const siteFallback = "https://bgroundrobin.com";
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

function parsePointFromText(txt) {
  if (!txt) return null;
  const m = String(txt).toLowerCase().match(/over\s*([0-9]+(?:\.[0-9]+)?)/);
  if (m) return Number(m[1]);
  if (/2\+/.test(String(txt))) return 1.5;
  return null;
}

function asDecimal(o) {
  if (!o) return null;
  const dec = Number(o.price ?? o.odds ?? o.decimal ?? o.decimalOdds);
  return (isFinite(dec) && dec > 1) ? dec : null;
}

function outcomeIsOver2Plus(o) {
  const name = (o?.name||"").toLowerCase();
  const desc = (o?.description||"").toLowerCase();
  const pt = (o?.point!=null && !isNaN(Number(o.point))) ? Number(o.point) : (parsePointFromText(name) ?? parsePointFromText(desc));
  const has2Plus = /2\+/.test(name) || /2\+/.test(desc);
  const isOverWord = name === "over" || name.startsWith("over") || desc.startsWith("over");
  // Treat 2+ as equivalently stricter than 1.5; otherwise require 1.5
  if (has2Plus) return { ok:true, point: 1.5 };
  if (isOverWord && pt != null) {
    if (Math.abs(pt - 1.5) < 1e-6) return { ok:true, point: 1.5 };
  }
  return { ok:false };
}

function pickPlayerLabel(o, off) {
  return title(
    o?.description || o?.player || off?.player || off?.participant || off?.participant_name || off?.athlete || off?.label || ""
  );
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

    const best = new Map(); // key: player -> {dec, book, game}
    for (const off of offers) {
      const bm = off?.bookmaker || off?.book || "book";
      const game = off?.game || off?.matchup || "";
      const outcomes = Array.isArray(off?.outcomes) ? off.outcomes : [];
      for (const o of outcomes) {
        const dec = asDecimal(o);
        if (!dec) continue;
        const chk = outcomeIsOver2Plus(o);
        if (!chk.ok) continue;
        const player = pickPlayerLabel(o, off);
        if (!player) continue;
        const key = player.toLowerCase();
        const prev = best.get(key);
        if (!prev || dec > prev.dec) best.set(key, { player, dec, book: bm, game, point: chk.point });
      }
    }

    if (best.size === 0) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:true, date, meta, count:0, players:[] }) };
    }

    // Model: until your model map is hooked, use odds-implied prob with tiny de-juice bump
    const players = [];
    for (const {player, dec, book, game, point} of best.values()) {
      let p = 1/dec; // implied Over prob
      p = clamp(p * 1.02, 0.01, 0.90); // small de-juice bump to stabilize
      players.push({
        player,
        team: "",
        game,
        modelProb: p,
        modelOdds: toAmerican(1/Math.max(p, 1e-9)),
        realOdds: toAmerican(dec),
        ev: evDecimal(p, dec),
        why: `Odds-implied model • Over ${point?.toFixed(1) ?? "1.5"} hits • best ${dec.toFixed(2)} @ ${book}`
      });
    }

    players.sort((a,b)=> b.ev - a.ev);

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:true, date, meta, count: players.length, players }) };
  } catch (e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:false, error:String(e), count:0, players:[] }) };
  }
};
