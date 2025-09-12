exports.config = { includedFiles: ["netlify/functions/_data/**"] };

const { get, set } = require('../_blobs');
const {
  probabilityFromFeatures,
  buildTeamSnapshot,
  weatherPenalty,
  composePick,
  buildParlays,
  impliedFromOdds,
  upsetSignals,
} = require('../_lib/predictionMath');

const BUNDLE_VERSION = 'predictions-2025-09-12-v11';
const ARTIFACT_KEY   = 'nfl/predictions/artifacts/latest.json';
const CURRENT_KEY    = 'nfl/predictions/current.json';

const TEAM_ABBR = (name='') => (name.match(/\b[A-Z]{2,3}\b/)?.[0]) || name.split(' ').pop()?.toUpperCase()?.slice(0,3);

function bestFromBooks(markets) {
  if (!markets) return { ml_home_best:null, ml_away_best:null, spread_line:null, total_line:null, total_side:null };
  let ml_home=null, ml_away=null, spread_line=null, total_line=null, total_side=null;
  for (const b of markets) {
    const m = b.markets || {};
    if (m.h2h?.length === 2) {
      const [h, a] = m.h2h;
      if (h?.price != null) ml_home = (ml_home==null) ? h.price : Math.max(ml_home, h.price);
      if (a?.price != null) ml_away = (ml_away==null) ? a.price : Math.max(ml_away, a.price);
    }
    if (m.spreads?.length === 2) {
      const [h, a] = m.spreads;
      if (h?.point != null) spread_line = h.point;
    }
    if (m.totals?.length === 2) {
      const [ov, un] = m.totals;
      total_line = ov?.point ?? total_line;
      total_side = (ov?.price != null && un?.price != null) ? (ov.price <= un.price ? 'Over' : 'Under') : total_side;
    }
  }
  return { ml_home_best: ml_home, ml_away_best: ml_away, spread_line, total_line, total_side };
}

exports.handler = async (event) => {
  const open = String(event.queryStringParameters?.open||'') === '1';
  const auto = String(event.queryStringParameters?.autobuild||'') === '1';

  try {
    const artifact = await get(ARTIFACT_KEY);
    if (!artifact?.schedule?.ok) {
      return { statusCode: 200, headers:{'content-type':'application/json'},
        body: JSON.stringify({ ok:false, error:'No artifact found (run TRAIN first)', BUNDLE_VERSION }) };
    }

    const currentSeason = Number(artifact.schedule?.season || 2025);
    const currentWeek   = Number(artifact.schedule?.week || 2);
    const scheduleRows  = artifact.schedule?.rows || artifact.schedule?.games || [];

    const rows = [];
    for (const g of scheduleRows) {
      const id = g.id || g.eventId || g.key;
      const home = g.home_team || g.homeTeam || g.home;
      const away = g.away_team || g.awayTeam || g.away;
      const kickoff = g.commence_time || g.kickoff || g.start;

      const bookRow = (artifact.odds?.games || artifact.odds?.rows || []).find(x=> (x.id === id) || (x.home_team===home && x.away_team===away));
      const market = bestFromBooks(bookRow?.bookmakers);

      const teamLogs = artifact.nflverse_logs || {};
      const homeLogs = teamLogs[TEAM_ABBR(home)] || teamLogs[home] || [];
      const awayLogs = teamLogs[TEAM_ABBR(away)] || teamLogs[away] || [];

      const ctx = { currentSeason, currentWeek };
      const homeSnap = buildTeamSnapshot(homeLogs, ctx);
      const awaySnap = buildTeamSnapshot(awayLogs, ctx);

      const w = artifact.weather_by_event?.[id] || null;
      const wPen = weatherPenalty(w);

      const roster = artifact.espn_rosters || {};
      const homeInj = roster[TEAM_ABBR(home)]?.injuryPenalty || 0;
      const awayInj = roster[TEAM_ABBR(away)]?.injuryPenalty || 0;

      const featHome = {
        off_epa: (homeSnap.off_epa ?? 0) - (awaySnap.def_epa ?? 0) - homeInj*0.1,
        def_epa: (homeSnap.def_epa ?? 0) - (awaySnap.off_epa ?? 0),
        rz_off:  (homeSnap.rz_off  ?? 0) - (awaySnap.rz_def ?? 0),
        rz_def:  (homeSnap.rz_def  ?? 0) - (awaySnap.rz_off ?? 0),
        explosiveness: (homeSnap.explosiveness ?? 0) - (awaySnap.explosiveness ?? 0),
        pressure: (homeSnap.pressure ?? 0) - (awaySnap.pressure ?? 0),
        st: (homeSnap.st ?? 0) - (awaySnap.st ?? 0),
        hfa: 0.2,
        weatherPen: wPen,
        turnoverAdj: (homeSnap.turnoverAdj ?? 0) - (awaySnap.turnoverAdj ?? 0)
      };

      const homeProb = probabilityFromFeatures(featHome);
      const mlPick0 = composePick(homeProb, market.ml_home_best, market.ml_away_best);
      const pick_ml = { type:'moneyline', team: (mlPick0.team==='HOME'? home: away), confidence: mlPick0.confidence, edge: mlPick0.edge };

      // naive projected spread from prob -> logistic inverse scaled (rough heuristic)
      const k = 6.0; // scale factor ~ points
      const z = Math.log(homeProb/(1-homeProb));
      const spread_proj = -(z * (k/1.5)); // negative means home favored
      const spreadPickTeam = spread_proj <= 0 ? home : away;
      const spreadConf = Math.max(0.52, Math.min(0.9, 0.52 + Math.abs(z)*0.06));
      const pick_spread = { type:'spread', team: spreadPickTeam, line: market.spread_line ?? null, confidence: spreadConf };

      // total propensity heuristic using snaps (aggregate offense vs defense + explosiveness and RZ, minus weather)
      const s = (homeSnap.off_epa + awaySnap.off_epa) - (homeSnap.def_epa + awaySnap.def_epa)
              + 0.5*((homeSnap.explosiveness||0)+(awaySnap.explosiveness||0))
              + 0.4*((homeSnap.rz_off||0)+(awaySnap.rz_off||0))
              - 0.4*((homeSnap.rz_def||0)+(awaySnap.rz_def||0))
              - wPen;
      const totalSide = s >= 0 ? 'Over' : 'Under';
      const totalConf = Math.max(0.52, Math.min(0.85, 0.52 + Math.tanh(Math.abs(s))*0.28));
      const pick_total = { type:'total', side: totalSide, line: market.total_line ?? null, confidence: totalConf };

      const row = {
        id, kickoff,
        matchup: `${away} @ ${home}`,
        home, away,
        home_abbr: TEAM_ABBR(home),
        away_abbr: TEAM_ABBR(away),
        ml_home_best: market.ml_home_best,
        ml_away_best: market.ml_away_best,
        ml_home_imp: impliedFromOdds(market.ml_home_best),
        ml_away_imp: impliedFromOdds(market.ml_away_best),
        spread_team: spreadPickTeam,
        spread_line: market.spread_line ?? null,
        total_side:  totalSide,
        total_line:  market.total_line ?? null,
        pick: pick_ml,            // backward compat
        pick_ml,
        pick_spread,
        pick_total
      };

      rows.push(row);
    }

    const parlays = buildParlays(rows);
    const resultData = { ok:true, updated:new Date().toISOString(), rows, parlays, BUNDLE_VERSION, source:"blobs+artifact" };
    const ok = await set(CURRENT_KEY, resultData);
    if (!ok) {
      return { statusCode: 200, headers:{'content-type':'application/json'},
        body: JSON.stringify({ ok:false, error:'Failed to write predictions', BUNDLE_VERSION }) };
    }

    return { statusCode: 200, headers:{'content-type':'application/json'},
      body: JSON.stringify({ ok:true, scored:true, rows: rows.length, updated: resultData.updated, BUNDLE_VERSION, open, auto }) };
  } catch (err) {
    return { statusCode: 200, headers:{'content-type':'application/json'},
      body: JSON.stringify({ ok:false, error:String(err), where:'score', BUNDLE_VERSION }) };
  }
};
