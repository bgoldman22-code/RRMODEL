// netlify/functions/nfl-predictions-score/index.cjs
/**
 * Fills Moneyline/Spread/Totals fields using existing Odds API proxy,
 * so GET shows real numbers instead of nulls.
 * Works even if TRAIN didn't run (falls back to schedule only with market-driven pick).
 */
const BUNDLE_VERSION = 'predictions-2025-09-12-v9';
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const { get, set } = require('../_blobs.js');

const CURRENT_KEY = 'nfl/predictions/current.json';

/** helper: best price & implied prob */
function impliedAmerican(odd) {
  if (odd == null) return null;
  if (odd > 0) return 100 / (odd + 100);
  return (-odd) / ((-odd) + 100);
}

function pickMoneyline(homeBest, awayBest, homeName, awayName) {
  const homeImp = impliedAmerican(homeBest);
  const awayImp = impliedAmerican(awayBest);
  if (homeImp == null || awayImp == null) return { type: null, team: null, confidence: null };
  if (homeImp >= awayImp) return { type: 'moneyline', team: homeName, confidence: +homeImp };
  return { type: 'moneyline', team: awayName, confidence: +awayImp };
}

exports.handler = async (event) => {
  try {
    // 1) Get schedule (your existing endpoint)
    const schedURL = process.env.SCHEDULE_URL || `${process.env.URL || ''}/.netlify/functions/nfl-schedule-get`;
    const sResp = await fetch(schedURL).then(r => r.json());
    const schedule = Array.isArray(sResp?.games) ? sResp.games : sResp?.rows || [];
    if (!Array.isArray(schedule) || schedule.length === 0) {
      return { statusCode: 200, headers:{'content-type':'application/json'},
        body: JSON.stringify({ ok:false, error:'No schedule rows', BUNDLE_VERSION }) };
    }

    // 2) Get odds (use your odds-get proxy so keys live server-side)
    const oddsURL = process.env.ODDS_URL || `${process.env.URL || ''}/.netlify/functions/odds-get?nfl=1&markets=h2h,spreads,totals`;
    const oResp = await fetch(oddsURL).then(r => r.json()).catch(() => null);
    const oddsGames = Array.isArray(oResp?.games) ? oResp.games : [];

    // index odds by id
    const oddsById = new Map();
    for (const g of oddsGames) oddsById.set(g.id, g);

    // 3) Build rows
    const rows = [];
    for (const g of schedule) {
      const og = oddsById.get(g.id);
      let ml_home_best = null, ml_away_best = null, spread_team = null, spread_line = null, total_side = null, total_line = null;

      if (og && Array.isArray(og.bookmakers)) {
        // compute consensus best across books
        let bestHome = null, bestAway = null;
        let bestSpread = null, bestTotals = null;

        for (const bk of og.bookmakers) {
          const mkts = bk.markets || {};
          if (Array.isArray(mkts.h2h)) {
            const h = mkts.h2h.find(x => x.name === g.home_team || x.name === g.homeTeam || x.name === g.home);
            const a = mkts.h2h.find(x => x.name === g.away_team || x.name === g.awayTeam || x.name === g.away);
            if (h && (bestHome == null || h.price > bestHome)) bestHome = h.price;
            if (a && (bestAway == null || a.price > bestAway)) bestAway = a.price;
          }
          if (Array.isArray(mkts.spreads)) {
            // prefer book spread closest to market mean for home team
            const spHome = mkts.spreads.find(x => (x.name === g.home_team || x.name === g.home));
            const spAway = mkts.spreads.find(x => (x.name === g.away_team || x.name === g.away));
            if (spHome && (!bestSpread || Math.abs(spHome.point) <= Math.abs(bestSpread.point))) bestSpread = { team: g.home_team || g.home, point: spHome.point, price: spHome.price };
            if (spAway && (!bestSpread || Math.abs(spAway.point) <= Math.abs(bestSpread.point))) bestSpread = { team: g.away_team || g.away, point: spAway.point, price: spAway.price };
          }
          if (Array.isArray(mkts.totals)) {
            const over = mkts.totals.find(x => x.name === 'Over');
            const under = mkts.totals.find(x => x.name === 'Under');
            if (over && (!bestTotals || Math.abs(over.point - 45) < Math.abs(bestTotals.point - 45))) bestTotals = { side: 'Over', point: over.point, price: over.price };
            if (under && (!bestTotals || Math.abs(under.point - 45) < Math.abs(bestTotals.point - 45))) bestTotals = { side: 'Under', point: under.point, price: under.price };
          }
        }

        ml_home_best = bestHome;
        ml_away_best = bestAway;
        if (bestSpread) { spread_team = bestSpread.team; spread_line = bestSpread.point; }
        if (bestTotals) { total_side = bestTotals.side; total_line = bestTotals.point; }
      }

      const homeName = g.home_team || g.homeTeam || g.home;
      const awayName = g.away_team || g.awayTeam || g.away;

      const mlPick = pickMoneyline(ml_home_best, ml_away_best, homeName, awayName);

      rows.push({
        id: g.id,
        kickoff: g.commence_time || g.kickoff,
        matchup: `${awayName} @ ${homeName}`,
        ml_home_best, ml_away_best,
        ml_home_imp: impliedAmerican(ml_home_best),
        ml_away_imp: impliedAmerican(ml_away_best),
        spread_team, spread_line,
        total_side, total_line,
        pick: mlPick,
        alts: { spread: [], totals: [] }
      });
    }

    // 4) Save and respond
    const out = { ok:true, updated: new Date().toISOString(), rows, BUNDLE_VERSION, source: 'score:odds+schedule' };
    await set(CURRENT_KEY, out);

    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, scored:true, rows: rows.length, updated: out.updated, BUNDLE_VERSION }) };
  } catch (e) {
    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:String(e), BUNDLE_VERSION }) };
  }
};
