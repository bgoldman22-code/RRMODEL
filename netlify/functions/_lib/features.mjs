import { logistic, clamp01 } from './util.mjs';
export function computeTeamForm(games) {
  const teams = new Map();
  function bump(team, value) {
    const cur = teams.get(team) ?? { form: 0, n: 0 };
    const next = { form: 0.9*cur.form + 0.1*value, n: cur.n + 1 };
    teams.set(team, next);
  }
  for (const g of games) {
    const ht = g.home_team || g.home || g.HomeTeam || g.homeTeam;
    const at = g.away_team || g.away || g.AwayTeam || g.awayTeam;
    const hs = Number(g.home_score ?? g.home_points ?? g.h_score ?? g.home_pts ?? 0);
    const as = Number(g.away_score ?? g.away_points ?? g.a_score ?? g.away_pts ?? 0);
    if (!ht || !at) continue;
    const marginHome = hs - as;
    bump(ht, marginHome);
    bump(at, -marginHome);
  }
  const out = {};
  for (const [team, { form, n }] of teams.entries()) out[team] = n ? form : 0;
  return out;
}
export function probFromFormDiff(formHome, formAway, k=3.5) {
  const diff = (formHome - formAway) / 10;
  return clamp01(logistic(diff, k));
}
export function confidenceFromEdge(pModel, pImplied) {
  const base = Math.abs(pModel - (pImplied ?? 0.5));
  return Math.round(100 * clamp01(0.5 + base));
}
