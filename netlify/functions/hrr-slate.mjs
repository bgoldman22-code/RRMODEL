/**
 * MLB HRR (Hits+Runs+RBIs) slate — resilient version
 * - Reads internal odds from /.netlify/functions/odds-hrr
 * - Considers Over at points 1.5 and 2.5 (primary + alternate)
 * - Always returns HTTP 200 with JSON
 * - Placeholder probabilities (replace with real model)
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "content-type": "application/json"
};

const siteFallback = "https://bgroundrobin.com";
const origin = (process.env.URL && process.env.URL.startsWith("http"))
  ? process.env.URL
  : (process.env.DEPLOY_PRIME_URL ? `https://${process.env.DEPLOY_PRIME_URL}` : siteFallback);

const ODDS_FN = `${origin}/.netlify/functions/odds-hrr`;
const DEFAULT_POINTS = [1.5, 2.5];

const toAmerican = (dec) => {
  if (!dec || dec <= 1) return 0;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
};
const toTitle = (s) => (s || "").replace(/\b\w/g, c => c.toUpperCase());
const keyName = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
const evDecimal = (p, dec) => (p * (dec - 1)) - (1 - p);

export const handler = async (event) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const date = params.get("date") || new Date().toISOString().slice(0,10);

    const oddsRes = await fetch(`${ODDS_FN}?date=${encodeURIComponent(date)}`);
    const odds = await oddsRes.json().catch(() => ({}));

    const meta = {
      provider: odds?.provider || odds?.source || null,
      usingOddsApi: !!odds?.usingOddsApi
    };

    const offers = Array.isArray(odds?.offers) ? odds.offers : [];
    if (offers.length === 0) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:true, market:(odds?.market||null), date, meta, count:0, players:[] }) };
    }

    // Best Over price per player at first available point in DEFAULT_POINTS
    const best = new Map();
    for (const off of offers) {
      const outcomes = off?.outcomes || [];
      for (const pt of DEFAULT_POINTS) {
        for (const o of outcomes) {
          const name = (o.name || "").toLowerCase();
          if (name !== "over") continue;
          if (Number(o.point) !== pt) continue;
          const playerKey = keyName(o.description || o.player || off.player || "");
          if (!playerKey) continue;
          const dec = Number(o.price || o.odds);
          if (!dec) continue;
          const prev = best.get(playerKey);
          if (!prev || dec > prev.dec) best.set(playerKey, { dec, point: pt, book: off.bookmaker || "book", raw: o, game: off.game || null });
        }
      }
    }

    if (best.size === 0) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:true, market:(odds?.market||null), date, meta, count:0, players:[] }) };
    }

    // TODO: Replace with real HRR model probabilities map
    const probs = new Map();
    for (const k of best.keys()) probs.set(k, 0.35); // placeholder

    const players = [];
    for (const [k, v] of best.entries()) {
      const prob = probs.get(k) || 0.25;
      const dec = v.dec;
      players.push({
        player: toTitle(k),
        team: "",
        game: v.game || "",
        modelProb: prob,
        modelOdds: toAmerican(1/Math.max(prob, 1e-9)),
        realOdds: toAmerican(dec),
        ev: evDecimal(prob, dec),
        why: `Over ${v.point} HRR • best ${dec.toFixed(2)} @ ${v.book}`
      });
    }

    players.sort((a,b)=> b.ev - a.ev);

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:true, market:(odds?.market||null), date, meta, count: players.length, players }) };
  } catch (e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:false, error:String(e), count:0, players:[] }) };
  }
};
