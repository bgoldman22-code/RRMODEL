// netlify/functions/nfl-predictions-generate/index.cjs
const fetch = require('node-fetch');
const { set } = require('../_blobs');

const CURRENT_KEY = 'nfl/predictions/current.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-live';

const SCHEDULE_URL = process.env.NFL_SCHEDULE_URL || '/.netlify/functions/nfl-schedule-get';
const ODDS_URL = process.env.NFL_ODDS_BRIDGE_URL || '/.netlify/functions/odds-get?nfl=1';

function implied(probOrAmerican) {
  // If number looks like American odds, convert to implied probability
  const x = Number(probOrAmerican);
  if (!isFinite(x)) return null;
  if (Math.abs(x) > 1.5) { // american (e.g., -150, +125)
    return x < 0 ? (-x) / ((-x) + 100) : 100 / (x + 100);
  }
  // else already probability
  return x;
}

function pickFromMarket(consensus) {
  // consensus example: {h2h:{home_best:{price:-175}, away_best:{price:162}}, spreads:{team:"Green Bay Packers", line:-3, best_price:-110}, totals:{side:"Over", line:49, best_price:-108}}
  const out = { ml: null, spread: null, total: null };
  if (consensus?.h2h) {
    const homeP = implied(consensus.h2h.home_best?.price);
    const awayP = implied(consensus.h2h.away_best?.price);
    if (homeP || awayP) {
      const team = (homeP || 0) >= (awayP || 0) ? 'home' : 'away';
      const conf = Math.max(homeP || 0, awayP || 0);
      out.ml = { team, confidence: conf };
    }
  }
  if (consensus?.spreads) {
    out.spread = {
      team: consensus.spreads.team || null,
      line: consensus.spreads.line ?? null,
      confidence: implied(consensus.spreads.best_price) || 0.55
    };
  }
  if (consensus?.totals) {
    out.total = {
      side: consensus.totals.side || null,
      line: consensus.totals.line ?? null,
      confidence: implied(consensus.totals.best_price) || 0.55
    };
  }
  return out;
}

exports.handler = async () => {
  try {
    // Pull schedule
    const schRes = await fetch(SCHEDULE_URL);
    const schedule = await schRes.json().catch(()=>({}));
    // Pull odds
    const oddsRes = await fetch(ODDS_URL);
    const odds = await oddsRes.json().catch(()=>({}));

    const oddsById = {};
    for (const g of odds.games || []) oddsById[g.id] = g;

    const rows = [];
    for (const g of (odds.games || [])) {
      const consensus = g.consensus || null;
      const p = pickFromMarket(consensus);
      const matchup = `${g.away_team} @ ${g.home_team}`;
      // ML pick text
      let mlPick = null;
      if (p.ml) {
        mlPick = p.ml.team === 'home' ? g.home_team : g.away_team;
      }
      rows.push({
        id: g.id,
        kickoff: g.commence_time,
        matchup,
        ml_home_best: g.bookmakers?.[0]?.markets?.h2h?.[0]?.name === g.home_team
          ? g.bookmakers[0].markets.h2h[0].price : (consensus?.h2h?.home_best?.price ?? null),
        ml_away_best: g.bookmakers?.[0]?.markets?.h2h?.[0]?.name === g.away_team
          ? g.bookmakers[0].markets.h2h[0].price : (consensus?.h2h?.away_best?.price ?? null),
        ml_home_imp: implied(consensus?.h2h?.home_best?.price),
        ml_away_imp: implied(consensus?.h2h?.away_best?.price),
        spread_team: consensus?.spreads?.team ?? null,
        spread_line: consensus?.spreads?.line ?? null,
        total_side: consensus?.totals?.side ?? null,
        total_line: consensus?.totals?.line ?? null,
        pick: mlPick ? { type: 'moneyline', team: mlPick, confidence: p.ml?.confidence ?? 0.55 } : null,
        alts: { spread: [], totals: [] }
      });
    }

    // Build parlays: sort by ML confidence desc
    const top = rows
      .filter(r => r.pick?.type === 'moneyline' && typeof r.pick.confidence === 'number')
      .sort((a,b)=> (b.pick.confidence||0) - (a.pick.confidence||0));

    function makeParlays(n, k){
      const arr = [];
      const slice = top.slice(0, n*k);
      for (let i=0;i<n;i++){
        const legs = slice.slice(i*k,(i+1)*k).map(r=>({ gameId: r.id, matchup: r.matchup, leg: `ML — ${r.pick.team}`, confidence: r.pick.confidence }));
        arr.push({ legs });
      }
      return arr;
    }

    const parlays = {
      threeLegs: makeParlays(3,3),
      fiveLegs: makeParlays(3,5)
    };

    const payload = { ok: true, updated: new Date().toISOString(), rows, parlay: parlays, BUNDLE_VERSION, source: 'gen' };
    await set(CURRENT_KEY, payload);

    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, wrote: CURRENT_KEY, rows: rows.length, updated: payload.updated, BUNDLE_VERSION }) };
  } catch (err) {
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: false, error: String(err), BUNDLE_VERSION }) };
  }
};
