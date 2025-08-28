// netlify/functions/lib/mathNFL.mjs
// Math utilities and model components for NFL Anytime TD.

export function logit(p) {
  const e = 1e-9;
  const x = Math.max(e, Math.min(1 - e, Number(p) || 0));
  return Math.log(x / (1 - x));
}

export function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

export function toAmerican(prob) {
  const p = Number(prob);
  if (!(p > 0 && p < 1)) return "";
  const frac = p / (1 - p);
  return p >= 0.5 ? `-${Math.round(frac * 100)}` : `+${Math.round((1 / frac) * 100)}`;
}

export function toDecimal(american) {
  const num = Number(String(american ?? "").replace(/[^\-0-9]/g, ""));
  if (!Number.isFinite(num) || num === 0) return null;
  return num > 0 ? 1 + num / 100 : 1 + 100 / Math.abs(num);
}

export function computeRzProb(ctx) {
  const team = ctx.team?.abbrev;
  const opp  = ctx.opponent?.abbrev;
  const pos  = ctx.player?.pos;
  const depth= Number(ctx.player?.depth || 1);

  const teamRZTripsPg = ctx.pbpAggregates?.[team]?.rz_trips_pg ?? 3.0;
  const teamRZPosShare= ctx.teamTendencies?.[team]?.rz_pos_share?.[pos] ?? 0.25;
  const oppAllowRaw   = ctx.opponentDefense?.[opp]?.rz_allow?.[pos] ?? 0.25;
  const allow         = Math.max(0.05, Math.min(0.95, Number(oppAllowRaw) || 0.25));

  let share = 0.05;
  if (pos === "RB") {
    share = depth === 1 ? 0.6 : depth === 2 ? 0.2 : 0.1;
    const inside5 = ctx.teamTendencies?.[team]?.inside5_bias?.[pos] ?? 0.5;
    share *= inside5;
  } else if (pos === "WR" || pos === "TE") {
    const metrics = Array.isArray(ctx.playerMetricsSmall) ? ctx.playerMetricsSmall.find(m => m.player === ctx.player?.name && m.team === team) : null;
    const tgt = metrics?.target_share ?? 0.1;
    const adot = metrics?.aDOT ?? 10;
    share = tgt * (adot < 10 ? 1.2 : 0.8);
  } else if (pos === "QB") {
    share = 0.05;
  }

  const vultureProb = ctx.pbpAggregates?.[team]?.vulture_prob ?? 0.1;
  if (pos === "RB" && depth === 1) share *= (1 - vultureProb);
  if (pos === "RB" && depth > 1)  share += vultureProb * (depth === 2 ? 0.5 : 0.25);

  share = Math.max(0.01, Math.min(0.9, share));

  const raw = teamRZTripsPg * teamRZPosShare * (1 / allow) * share;
  return Math.max(0.001, Math.min(0.999, raw));
}

export function computeExpProb(ctx, weather) {
  const team = ctx.team?.abbrev;
  const opp  = ctx.opponent?.abbrev;
  const pos  = ctx.player?.pos;
  const name = ctx.player?.name;

  const exIdx = ctx.playerExplosive?.[name]?.explosive_idx ?? 50;
  const playerExpl = exIdx / 100;

  const allowRush = ctx.opponentDefense?.[opp]?.exp_allow?.rush ?? 0.3;
  const allowRec  = ctx.opponentDefense?.[opp]?.exp_allow?.rec  ?? 0.3;
  const oppVuln   = (pos === "RB" || pos === "QB") ? allowRush : allowRec;

  let cov = 1.0;
  const metrics = Array.isArray(ctx.playerMetricsSmall) ? ctx.playerMetricsSmall.find(m => m.player === name && m.team === team) : null;
  const role = metrics?.role;
  const defProf = Array.isArray(ctx.defenseProfilesSmall) ? ctx.defenseProfilesSmall.find(d => d.team === opp) : null;
  const roleMeta = ctx.roles?.[role];

  if (roleMeta && defProf) {
    if (roleMeta.profile === "high_targets_low_adot" && (defProf.zone_rate ?? 0) > 0.6) cov *= 1.1;
    if (roleMeta.profile === "low_targets_high_adot" && (defProf.man_rate ?? 0) > 0.4)  cov *= 1.15;
    if (pos === "TE" && (defProf.ypa_allowed ?? 0) > 7.5) cov *= 1.05;
  }

  const wind = Number(weather?.wind_factor ?? 1.0);
  const precip = Number(weather?.precipitation_factor ?? 1.0);
  const weatherPenalty = (wind || 1) * (precip || 1);

  const raw = playerExpl * oppVuln * cov * weatherPenalty;
  return Math.max(0.001, Math.min(0.999, raw));
}

export function blendAndCalibrate(rzLogit, expLogit, vultureIndex, teamWeights, calibration) {
  const w = teamWeights || { w_rz: 0.65, w_exp: 0.35, w_vult: 0.0 };
  const A = Number(calibration?.a ?? 1.0);
  const B = Number(calibration?.b ?? 0.0);

  // Prefer handling vulture in RZ share; set w_vult=0 to avoid double counting.
  const blended = (w.w_rz || 0) * rzLogit + (w.w_exp || 0) * expLogit;
  const calibLogit = A * blended + B;
  return Math.max(1e-6, Math.min(1 - 1e-6, sigmoid(calibLogit)));
}
