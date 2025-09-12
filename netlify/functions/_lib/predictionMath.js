const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sig = (z) => 1 / (1 + Math.exp(-z));

function seasonWeight(season, currentSeason, currentWeek) {
  if (season === currentSeason) return 1.5 + 0.1 * clamp(currentWeek, 0, 18);
  if (season === currentSeason - 1) return 1.2;
  const age = currentSeason - season;
  return Math.pow(0.65, age);
}

function recencyWeight(weeksAgo) {
  const halfLife = 2.0;
  const w = Math.pow(0.5, (weeksAgo||0) / halfLife);
  return (weeksAgo||0) <= 3 ? w * 1.25 : w;
}

function weightedMean(values, weights) {
  let num=0, den=0;
  for (let i=0;i<values.length;i++){ const v=values[i], w=weights[i]; if (w>0 && isFinite(v)) { num += v*w; den += w; } }
  return den>0 ? num/den : null;
}

function weatherPenalty(weather) {
  if (!weather) return 0;
  const wind = Number(weather.windKph || 0);
  const precip = Number(weather.precipProb || 0);
  let pen = 0;
  if (wind >= 25) pen += 0.05;
  if (precip >= 60) pen += 0.05;
  return clamp(pen, 0, 0.12);
}

function buildTeamSnapshot(gameLogs, ctx) {
  const vals = { off_epa:[], def_epa:[], rz_off:[], rz_def:[], explosiveness:[], pressure:[], st:[], turnoverAdj:[] };
  const wts  = { off_epa:[], def_epa:[], rz_off:[], rz_def:[], explosiveness:[], pressure:[], st:[], turnoverAdj:[] };
  for (const g of gameLogs || []) {
    const w = seasonWeight(g.season, ctx.currentSeason, ctx.currentWeek) * recencyWeight(g.weeksAgo ?? 0);
    for (const k of Object.keys(vals)) {
      const v = g[k === 'explosiveness' ? 'explosive' : k];
      if (typeof v === 'number' && isFinite(v) && w > 0) { vals[k].push(v); wts[k].push(w); }
    }
  }
  return {
    off_epa:       weightedMean(vals.off_epa,       wts.off_epa) ?? 0,
    def_epa:       weightedMean(vals.def_epa,       wts.def_epa) ?? 0,
    rz_off:        weightedMean(vals.rz_off,        wts.rz_off) ?? 0,
    rz_def:        weightedMean(vals.rz_def,        wts.rz_def) ?? 0,
    explosiveness: weightedMean(vals.explosiveness, wts.explosiveness) ?? 0,
    pressure:      weightedMean(vals.pressure,      wts.pressure) ?? 0,
    st:            weightedMean(vals.st,            wts.st) ?? 0,
    turnoverAdj:   weightedMean(vals.turnoverAdj,   wts.turnoverAdj) ?? 0,
  };
}

function probabilityFromFeatures(feat) {
  const {
    off_epa=0, def_epa=0, rz_off=0, rz_def=0,
    explosiveness=0, pressure=0, st=0,
    hfa=0.2, weatherPen=0, turnoverAdj=0
  } = feat;

  const z =
    + 1.35 * off_epa
    - 1.10 * def_epa
    + 0.80 * rz_off
    - 0.75 * rz_def
    + 0.60 * explosiveness
    - 0.55 * pressure
    + 0.35 * st
    + 0.25 * hfa
    + 0.45 * turnoverAdj
    - 1.00 * weatherPen;
  return Math.max(0.01, Math.min(0.99, sig(z)));
}

function upsetSignals(underdogFeat, favoriteFeat) {
  const sigs = [];
  if ((underdogFeat.rz_off ?? 0) > (favoriteFeat.rz_def ?? 0) + 0.02) sigs.push('RZ efficiency edge');
  if ((underdogFeat.explosiveness ?? 0) > (favoriteFeat.explosiveness ?? 0) + 0.02) sigs.push('Explosiveness edge');
  if ((underdogFeat.st ?? 0) > (favoriteFeat.st ?? 0) + 0.10) sigs.push('Special teams edge');
  return sigs;
}

function impliedFromOdds(odds) {
  if (odds == null) return null;
  const o = Number(odds);
  if (!isFinite(o) || o === 0) return null;
  return o < 0 ? (-o) / ((-o) + 100) : 100 / (o + 100);
}

function confidenceEdge(modelProb, marketOdds) {
  const imp = impliedFromOdds(marketOdds);
  if (imp == null) return { edge: null, conf: modelProb };
  const edge = modelProb - imp;
  const conf = Math.max(0.52, Math.min(0.90, 0.50 + Math.abs(edge) * 0.9));
  return { edge, conf };
}

function composePick(homeProb, homeOdds, awayOdds) {
  const homeEdge = confidenceEdge(homeProb, homeOdds);
  const awayEdge = confidenceEdge(1 - homeProb, awayOdds);
  const pickHome = (homeEdge.edge ?? 0) >= (awayEdge.edge ?? 0);
  const type = 'moneyline';
  if (pickHome) {
    return { type, team: 'HOME', confidence: homeEdge.conf, edge: homeEdge.edge };
  } else {
    return { type, team: 'AWAY', confidence: awayEdge.conf, edge: awayEdge.edge };
  }
}

function buildParlays(rows) {
  const legs = rows
    .map(r => {
      const sel = (r.pick_ml?.team === r.home)
        ? { odds: r.ml_home_best, label: `${r.home_abbr} ML`, conf: r.pick_ml?.confidence ?? 0.55 }
        : { odds: r.ml_away_best, label: `${r.away_abbr} ML`, conf: r.pick_ml?.confidence ?? 0.55 };
      return { id: r.id, matchup: r.matchup, leg: sel.label, confidence: sel.conf };
    })
    .sort((a,b)=>b.confidence - a.confidence);

  const takeTop = (n)=>legs.slice(0,n);
  return {
    "3x3": [ takeTop(3), takeTop(3), takeTop(3) ],
    "3x5": [ takeTop(5), takeTop(5), takeTop(5) ]
  };
}

module.exports = {
  probabilityFromFeatures,
  buildTeamSnapshot,
  weatherPenalty,
  composePick,
  buildParlays,
  impliedFromOdds,
  confidenceEdge,
  upsetSignals,
};
