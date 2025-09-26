// netlify/functions/nfl-predictions-score/index.cjs
// Self-sufficient scorer: if no artifact exists, it will use public endpoints
// (schedule + odds) to build rows and write current.json. No TRAIN step required.
const { get, set } = require('../_blobs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const ARTIFACT_KEY = 'nfl/predictions/artifacts/latest.json';
const CURRENT_KEY = 'nfl/predictions/current.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v9';

function impliedFromAmerican(american) {
  if (american == null) return null;
  const a = Number(american);
  if (!Number.isFinite(a) || a === 0) return null;
  return a < 0 ? (-a) / ((-a) + 100) : 100 / (a + 100);
}

function bestMoneyline(bookMarkets) {
  // Return {home, away, home_imp, away_imp}
  let bestHome = null, bestAway = null;
  if (!Array.isArray(bookMarkets)) return { home:null, away:null, home_imp:null, away_imp:null };
  for (const b of bookMarkets) {
    const m = b?.markets?.h2h;
    if (!Array.isArray(m)) continue;
    for (const leg of m) {
      if (!leg || typeof leg !== 'object') continue;
      const nm = String(leg.name || '').trim();
      const price = Number(leg.price);
      if (!Number.isFinite(price)) continue;
      // crude: if name matches home or away later, we resolve in caller
    }
  }
  // We can't select without team mapping here; caller maps by team names.
  return { home:null, away:null, home_imp:null, away_imp:null };
}

function pickByImplied(homeImp, awayImp, homeName, awayName) {
  if (homeImp == null && awayImp == null) return { type: 'moneyline', team: homeName, confidence: 0.52 };
  const h = homeImp ?? 0.5, a = awayImp ?? 0.5;
  const team = h >= a ? homeName : awayName;
  const conf = Math.max(h, a);
  return { type: 'moneyline', team, confidence: conf };
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'accept': 'application/json' } });
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    throw new Error(`Non-JSON from ${url}: ${text.slice(0,120)}`);
  }
}

function normalizeTeam(t) {
  return String(t || '').trim();
}

function consensusFromBookmakers(bookmakers, homeTeam, awayTeam) {
  // Compute best prices for home/away ML, best spread for favored team, and a totals line
  let bestHome = null, bestAway = null;
  let spreadTeam = null, spreadLine = null;
  let totalSide = null, totalLine = null;

  if (Array.isArray(bookmakers)) {
    for (const b of bookmakers) {
      const mkts = b?.markets || {};
      const h2h = mkts.h2h;
      if (Array.isArray(h2h)) {
        for (const leg of h2h) {
          const name = String(leg?.name || '');
          const price = Number(leg?.price);
          if (!Number.isFinite(price)) continue;
          if (name === homeTeam) {
            // For favorites (negative), we want the highest (closest to zero) negative -> max price
            // For dogs (positive), we want the highest positive -> max price
            if (bestHome == null) bestHome = price;
            else {
              // choose better payout for bettor: for home favorite (negative), choose less negative (greater).
              // treat simply as Math.max for American odds across books.
              bestHome = Math.max(bestHome, price);
            }
          } else if (name === awayTeam) {
            if (bestAway == null) bestAway = price; else bestAway = Math.max(bestAway, price);
          }
        }
      }
      const spreads = mkts.spreads;
      if (Array.isArray(spreads) && spreads.length) {
        // choose the line associated with favorite (by more negative price or more negative point). Simplify: take the first.
        const leg0 = spreads[0];
        spreadTeam = String(leg0?.name || null);
        spreadLine = Number.isFinite(Number(leg0?.point)) ? Number(leg0.point) : null;
      }
      const totals = mkts.totals;
      if (Array.isArray(totals) && totals.length) {
        const t0 = totals[0];
        totalSide = String(t0?.name || null);
        totalLine = Number.isFinite(Number(t0?.point)) ? Number(t0.point) : null;
      }
    }
  }

  const ml_home_imp = impliedFromAmerican(bestHome);
  const ml_away_imp = impliedFromAmerican(bestAway);

  return { ml_home_best: bestHome, ml_away_best: bestAway, ml_home_imp, ml_away_imp, spread_team: spreadTeam, spread_line: spreadLine, total_side: totalSide, total_line: totalLine };
}

exports.handler = async (event) => {
  try {
    // DISABLE OLD MODEL: Check if advanced R Pipeline model should be used instead
    if (process.env.USE_ADVANCED_NFL_MODEL === 'true' || process.env.USE_ADVANCED_NFL_MODEL === '1') {
      return { 
        statusCode: 200, 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          ok: false, 
          message: "Legacy model disabled - using advanced R Pipeline model instead",
          redirect: "Use nfl-predictions-generate for live predictions"
        }) 
      };
    }

    const scheduleURL = process.env.NFL_SCHEDULE_URL || 'https://bgroundrobin.com/.netlify/functions/nfl-schedule-get';
    const oddsURL = process.env.NFL_ODDS_BRIDGE_URL || 'https://bgroundrobin.com/.netlify/functions/odds-get';

    // Always try to use artifact first unless ?force=1
    const force = String(event.queryStringParameters?.force || '') === '1';
    let artifact = null;
    if (!force) {
      artifact = await get(ARTIFACT_KEY);
    }

    // Pull schedule and odds
    const sched = await fetchJSON(scheduleURL); // {ok, season, weekCounts?} (but some versions also return games already)
    // If your schedule function supports ?week param, pull upcoming by default:
    const weekParam = event.queryStringParameters?.week;
    const gamesURL = scheduleURL + (weekParam ? `?week=${encodeURIComponent(weekParam)}` : '');
    const odds = await fetchJSON(oddsURL); // {ok, count, games:[{id, home_team, away_team, bookmakers:[...]}]}

    const games = Array.isArray(odds?.games) ? odds.games : [];
    const rows = [];
    for (const g of games) {
      const id = g.id;
      const home = normalizeTeam(g.home_team);
      const away = normalizeTeam(g.away_team);
      const kick = g.commence_time;

      const cons = consensusFromBookmakers(g.bookmakers, home, away);
      const pick = pickByImplied(cons.ml_home_imp, cons.ml_away_imp, home, away);

      rows.push({
        id, kickoff: kick, matchup: `${away} @ ${home}`,
        ml_home_best: cons.ml_home_best,
        ml_away_best: cons.ml_away_best,
        ml_home_imp: cons.ml_home_imp,
        ml_away_imp: cons.ml_away_imp,
        spread_team: cons.spread_team,
        spread_line: cons.spread_line,
        total_side: cons.total_side,
        total_line: cons.total_line,
        pick,
        alts: { spread: [], totals: [] }
      });
    }

    // Simple parlay builder: top 3 and top 5 by confidence
    const sorted = [...rows].sort((a,b)=> (b.pick?.confidence||0) - (a.pick?.confidence||0));
    const parlay3 = sorted.slice(0,3).map(r => ({ gameId: r.id, matchup: r.matchup, leg: `${r.pick.type==='moneyline' ? (r.pick.team) : (r.pick.team + ' ' + (r.spread_line??''))}`, confidence: r.pick.confidence }));
    const parlay5 = sorted.slice(0,5).map(r => ({ gameId: r.id, matchup: r.matchup, leg: `${r.pick.type==='moneyline' ? (r.pick.team) : (r.pick.team + ' ' + (r.spread_line??''))}`, confidence: r.pick.confidence }));

    const payload = {
      ok: true,
      updated: new Date().toISOString(),
      rows,
      parlay: { legs3: parlay3, legs5: parlay5 },
      source: artifact ? 'artifact+public' : 'public-only',
      BUNDLE_VERSION
    };

    const okWrite = await set(CURRENT_KEY, payload);
    if (!okWrite) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok:false, error:'Failed to persist predictions', BUNDLE_VERSION }) };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok:true, scored:true, rows: rows.length, updated: payload.updated, BUNDLE_VERSION }) };
  } catch (err) {
    console.error('nfl-predictions-score error:', err);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok:false, error:String(err), BUNDLE_VERSION }) };
  }
};
