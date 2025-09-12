const { get, set } = require('../_blobs');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const CURRENT_KEY = 'nfl/predictions/current.json';
const ARTIFACT_KEY = 'nfl/predictions/artifacts/latest.json';
const BUNDLE_VERSION = 'predictions-2025-09-12-v8';

const ODDS_API_KEY = process.env.ODDS_API_KEY || process.env.ODDS_API_KEY_NFL;
const ODDS_BASE = process.env.ODDSAPI_BASE || 'https://api.the-odds-api.com/v4';
const ODDS_SPORT = process.env.ODDSAPI_SPORT_NFL || 'americanfootball_nfl';
const ODDS_REGION = process.env.ODDSAPI_REGION_NFL || 'us';
const ODDS_BOOKS = (process.env.ODDSAPI_BOOKMAKER_NFL || '').split(',').map(s=>s.trim()).filter(Boolean);

const toJSON = async (res) => {
  const t = await res.text();
  try { return JSON.parse(t); } catch { throw new Error(`Non-JSON from ${res.url}: ${t.slice(0,200)}`); }
};

// Placeholder hooks - expand as you wire real NFLVerse/ESPN endpoints.
async function fetchNFLVerseFeatures() {
  try {
    return { ok: true, sample: true };
  } catch (e) {
    console.warn('NFLVerse fetch failed:', e.message);
    return { ok: false };
  }
}

async function fetchESPNInjuries() {
  try {
    return { ok: true, injuries: [] };
  } catch (e) {
    console.warn('ESPN injuries fetch failed:', e.message);
    return { ok: false, injuries: [] };
  }
}

function implied(price) { return price < 0 ? (-price) / ((-price)+100) : 100 / (price+100); }

async function fetchOdds() {
  if (!ODDS_API_KEY) throw new Error('Missing ODDS_API_KEY');
  const qs = new URLSearchParams({
    apiKey: ODDS_API_KEY,
    regions: ODDS_REGION,
    markets: 'h2h,spreads,totals',
  });
  if (ODDS_BOOKS.length) qs.set('bookmakers', ODDS_BOOKS.join(','));
  const url = `${ODDS_BASE}/sports/${ODDS_SPORT}/odds?${qs}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds ${res.status}`);
  return toJSON(res);
}

function buildConsensus(game) {
  const out = { h2h:{}, spreads:{}, totals:{} };
  const books = game.bookmakers || [];

  // h2h
  const h2hAll = [];
  books.forEach(b=>{
    const m = b.markets?.h2h;
    if (!m) return;
    m.forEach(o=> h2hAll.push({ book:b.title||b.key, name:o.name, price:o.price, point:o.point ?? null }));
  });
  const home = h2hAll.filter(x=>x.name===game.home_team);
  const away = h2hAll.filter(x=>x.name===game.away_team);
  const bestByImp = (arr) => arr.sort((a,b)=> implied(b.price)-implied(a.price))[0];
  out.h2h.home_best = home.length ? bestByImp(home) : null;
  out.h2h.away_best = away.length ? bestByImp(away) : null;
  out.h2h.home_implied_avg = home.length ? home.reduce((s,x)=>s+implied(x.price),0)/home.length : null;
  out.h2h.away_implied_avg = away.length ? away.reduce((s,x)=>s+implied(x.price),0)/away.length : null;

  // spreads
  const spAll = [];
  books.forEach(b=>{
    const m = b.markets?.spreads;
    if (!m) return;
    m.forEach(o=> spAll.push({book:b.title||b.key, name:o.name, price:o.price, point:o.point}));
  });
  if (spAll.length) {
    const fav = spAll.reduce((best,x)=> !best || Math.abs(x.point)<Math.abs(best.point) ? x : best, null);
    out.spreads.team = fav?.name || null;
    out.spreads.line = fav?.point ?? null;
    out.spreads.best_price = fav?.price ?? null;
  }

  // totals
  const totAll = [];
  books.forEach(b=>{
    const m = b.markets?.totals;
    if (!m) return;
    m.forEach(o=> totAll.push({book:b.title||b.key, side:o.name, price:o.price, point:o.point}));
  });
  if (totAll.length) {
    const over = totAll.filter(x=>x.side==='Over');
    const under= totAll.filter(x=>x.side==='Under');
    const pick = (over.length>=under.length) ? over : under;
    const best = pick.sort((a,b)=> Math.abs(implied(b.price))-Math.abs(implied(a.price)) )[0];
    out.totals.side = best?.side || null;
    out.totals.line = best?.point ?? null;
    out.totals.best_price = best?.price ?? null;
  }

  return out;
}

// toy fused decision; expand with true features & recency
function decide(game, consensus, features) {
  const homeImp = consensus.h2h.home_implied_avg ?? implied(consensus.h2h.home_best?.price ?? -110);
  const awayImp = consensus.h2h.away_implied_avg ?? implied(consensus.h2h.away_best?.price ?? -110);

  // stub for recency/injury nudges
  const homeScore = homeImp;
  const awayScore = awayImp;

  let pick = { type:'moneyline', team: game.home_team, confidence: Math.max(homeScore, awayScore) };
  if (awayScore > homeScore) pick = { type:'moneyline', team: game.away_team, confidence: awayScore };

  const alts = {
    spread: consensus.spreads.line != null ? [{ line: consensus.spreads.line - 0.5, odds: -110 }] : [],
    totals: consensus.totals.line != null ? [{ line: consensus.totals.line + 0.5, side: consensus.totals.side || 'Over', odds: -110 }] : []
  };

  return { pick, alts };
}

exports.handler = async (event) => {
  try {
    const autobuild = String(event.queryStringParameters?.autobuild || '1') === '1';

    let artifact = await get(ARTIFACT_KEY);
    let features = { nflverse: null, espn: null };
    if (autobuild || !artifact) {
      const [nflv, espn] = await Promise.all([
        fetchNFLVerseFeatures(),
        fetchESPNInjuries()
      ]);
      features = { nflverse: nflv, espn };
      artifact = { features, ts: Date.now() };
      await set(ARTIFACT_KEY, artifact);
    }

    const games = await fetchOdds();
    const rows = (games || []).map(g => {
      const consensus = buildConsensus(g);
      const { pick, alts } = decide(g, consensus, features);
      return {
        id: g.id,
        kickoff: g.commence_time,
        matchup: `${g.away_team} @ ${g.home_team}`,
        ml_home_best: consensus.h2h.home_best?.price ?? null,
        ml_away_best: consensus.h2h.away_best?.price ?? null,
        ml_home_imp: consensus.h2h.home_implied_avg ?? null,
        ml_away_imp: consensus.h2h.away_implied_avg ?? null,
        spread_team: consensus.spreads.team ?? null,
        spread_line: consensus.spreads.line ?? null,
        total_side: consensus.totals.side ?? null,
        total_line: consensus.totals.line ?? null,
        pick,
        alts
      };
    });

    const sorted = rows.slice().sort((a,b)=>(b.pick?.confidence||0)-(a.pick?.confidence||0));
    const parlay = {
      three_leg: sorted.slice(0,3).map(r => ({
        gameId: r.id, matchup: r.matchup,
        leg: r.pick?.type==='moneyline' ? `${r.pick.team} ML`
            : r.pick?.type==='spread' ? `${r.spread_team} ${r.spread_line}`
            : r.pick?.type==='total' ? `${r.total_side} ${r.total_line}` : 'Pick',
        confidence: r.pick?.confidence || 0
      })),
      five_leg: sorted.slice(0,5).map(r => ({
        gameId: r.id, matchup: r.matchup,
        leg: r.pick?.type==='moneyline' ? `${r.pick.team} ML`
            : r.pick?.type==='spread' ? `${r.spread_team} ${r.spread_line}`
            : r.pick?.type==='total' ? `${r.total_side} ${r.total_line}` : 'Pick',
        confidence: r.pick?.confidence || 0
      }))
    };

    const payload = {
      ok: true,
      updated: new Date().toISOString(),
      rows,
      parlay,
      BUNDLE_VERSION,
      notes: 'Live autobuild (NFLVerse/ESPN best-effort + Odds consensus).'
    };

    await set(CURRENT_KEY, payload);

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ ok: true, scored: true, rows: rows.length, updated: payload.updated, BUNDLE_VERSION })
    };
  } catch (err) {
    console.error('score autobuild error:', err);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err), BUNDLE_VERSION })
    };
  }
};