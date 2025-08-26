// netlify/functions/hrr-slate.mjs
import { jsonResponse } from "./_lib/http.mjs";

const MARKET_KEYS = ["batter_hits_runs_rbis", "batter_hits_runs_rbis_alternate"];
const ACCEPT_OVER_NAMES = new Set(["Over","over","OVER"]);
const EPS = 1e-6;

const decToProb = (d) => (d && d > 1 ? 1 / d : null);
const probToDec = (p) => (p && p > 0 ? 1 / p : null);
const decToAmerican = (d) => {
  if (!d || d <= 1) return null;
  const p = 1 / d;
  if (p <= 0.5) return Math.round(((1 - p) / p) * 100);
  return Math.round(-100 * p / (1 - p));
};

function normStr(x){ return (x ?? "").toString().trim().replace(/\s+/g," "); }

function* outcomeWalk(offer) {
  if (offer?.outcomes?.length) yield* offer.outcomes.map(oc => ({ oc, src:"root", bookmaker: offer.bookmaker }));
  if (offer?.markets?.length) {
    for (const m of offer.markets) {
      if (m?.outcomes?.length) yield* m.outcomes.map(oc => ({ oc, src:"markets", bookmaker: m.bookmaker || offer.bookmaker }));
    }
  }
  if (offer?.bookmakers?.length) {
    for (const bk of offer.bookmakers) {
      for (const m of bk.markets || []) {
        if (m?.outcomes?.length) yield* m.outcomes.map(oc => ({ oc, src:"bookmakers", bookmaker: bk.title || bk.key || bk.name }));
      }
    }
  }
}

function collectOffers(raw){
  const rows = [];
  for (const o of (raw.offers || [])) {
    const market = o.market || o.key || o.market_key || "";
    if (!MARKET_KEYS.includes(market)) continue;

    const candidates = [];
    for (const { oc, bookmaker } of outcomeWalk(o)) {
      const side = oc.name || oc.label || oc.outcome;
      if (!ACCEPT_OVER_NAMES.has(String(side))) continue;

      const name = normStr(oc.description || oc.player || o.player);
      if (!name) continue;

      const game = normStr(o.game || oc.game || "");
      const pointRaw = oc.point ?? o.point;
      const point = Number(pointRaw);
      if (!Number.isFinite(point)) continue;

      // STRICT: only Over 1.5 HRR
      if (Math.abs(point - 1.5) > EPS) continue;

      const decimal = Number(oc.decimal ?? oc.price ?? oc.odds_decimal);
      if (!(decimal > 1)) continue;
      const american = Number(oc.american ?? oc.odds_american) || decToAmerican(decimal);

      candidates.push({
        player: name,
        game,
        bookmaker: normStr(bookmaker || o.bookmaker),
        point,
        decimal,
        american,
        market
      });
    }

    // best (highest decimal) per player+game
    const best = new Map();
    for (const it of candidates) {
      const key = `${it.player}::${it.game}`;
      const prev = best.get(key);
      if (!prev || it.decimal > prev.decimal) best.set(key, it);
    }
    for (const v of best.values()) rows.push(v);
  }
  return rows;
}

export const handler = async (event) => {
  try {
    const date = (event.queryStringParameters?.date || "").trim() || new Date().toISOString().slice(0,10);
    const base = `${event.headers["x-forwarded-proto"] || "https"}://${event.headers.host}`;
    const oddsUrl = `${base}/.netlify/functions/odds-hrr?date=${encodeURIComponent(date)}`;

    const res = await fetch(oddsUrl);
    if (!res.ok) throw new Error(`odds fetch ${res.status}`);
    const odds = await res.json();

    const rows = collectOffers(odds);

    const players = rows.map(r => {
      const modelProb = decToProb(r.decimal); // fallback until model plugged
      const modelOddsDec = probToDec(modelProb);
      const ev = (modelProb ?? 0) - (decToProb(r.decimal) ?? 0);
      const why = `Over 1.5 (2+) • ${r.bookmaker || "book"}`;
      return {
        player: r.player,
        team: "",
        game: r.game,
        modelProb: modelProb != null ? Number(modelProb.toFixed(4)) : null,
        modelOdds: modelOddsDec ? `+${decToAmerican(modelOddsDec)}` : null,
        realOdds: r.american != null ? (r.american > 0 ? `+${r.american}` : `${r.american}`) : null,
        ev: Number(ev.toFixed(3)),
        why
      };
    });

    players.sort((a,b)=>(b.modelProb||0)-(a.modelProb||0));

    return jsonResponse({
      ok:true,
      market:"batter_hits_runs_rbis(Over 1.5 only)",
      date,
      meta:{ provider: odds.provider, usingOddsApi: odds.usingOddsApi },
      count: players.length,
      players
    });
  } catch (err) {
    return jsonResponse({ ok:false, error:String(err), count:0, players:[] }, 200);
  }
};
