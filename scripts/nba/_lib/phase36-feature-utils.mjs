/**
 * Phase 3.6 feature augmentation helpers shared between generator + tests.
 */
import { augmentLineAwareFeatures } from './line-feature-utils.mjs';

function pctRank(value, min, max) {
  if (!Number.isFinite(value)) return 0.5;
  const clamped = Math.max(Math.min(value, max), min);
  return (clamped - min) / Math.max(max - min, 1e-6);
}

function spline(value, power) {
  return Math.pow(Math.max(value, 0), power);
}

export function buildPhase36Features(baseFeatures, market, context) {
  const features = { ...baseFeatures };
  const line = context?.line ?? 0;
  augmentLineAwareFeatures(features, market, line);

  const statKey = market === 'player_points' ? 'ppg' : market === 'player_rebounds' ? 'rpg' : 'apg';
  const baseline = features[`L10_${statKey}`] ?? 0;
  features.line_minus_projection = line - baseline;
  features.line_vs_L5 = line - (features[`L5_${statKey}`] ?? baseline);
  features.line_vs_L10 = line - baseline;
  features.line_vs_L20 = line - (features[`L20_${statKey}`] ?? baseline);
  features.line_vs_L40 = line - (features[`L40_${statKey}`] ?? baseline);
  features.line_vs_season = line - (features[`season_${statKey}`] ?? baseline);

  const impliedProb = context?.impliedProb ?? 0.5;
  features.implied_prob_minus_proj = impliedProb - 0.5;

  const opponentWindow = features[`opp_def_L10_${statKey}_allowed`];
  features.opp_percentile_allowed = pctRank(opponentWindow ?? 0, 5, 45);
  const leagueAvg = 25;
  features.opp_matchup_rank_delta = ((opponentWindow ?? leagueAvg) - leagueAvg) / (Math.abs(leagueAvg) + 1e-6);
  features.opponent_switch_penalty = context?.opponentSwitchRate ?? 0;

  const restDays = features.rest_days ?? context?.restDays ?? 2;
  features.b2b_flag = restDays <= 1 ? 1 : 0;
  features.third_in_four_flag = context?.gamesLast5 >= 3 ? 1 : 0;
  features.travel_miles_last5 = context?.travelMilesLast5 ?? 0;
  features.rest_day_spline_1 = restDays;
  features.rest_day_spline_2 = spline(restDays, 2);
  features.rest_day_spline_3 = spline(restDays, 3);

  const usageRate = context?.usageRate ?? features.usage_rate ?? 0;
  const usageL10 = context?.usageRateL10 ?? usageRate;
  features.usage_recency_weighted = 0.65 * usageRate + 0.35 * usageL10;
  const minutesDelta = (features.L5_minutes ?? 0) - (features.L20_minutes ?? features.L5_minutes ?? 0);
  features.minutes_delta_L5_vs_L20 = minutesDelta;
  features.role_change_flag = Math.abs(minutesDelta) >= 4 ? 1 : 0;
  features.injury_rotation_shock = context?.injuryShock ?? 0;

  const teamPace = context?.teamPace ?? 98;
  const opponentPace = context?.opponentPace ?? 98;
  const leaguePace = 98;
  features.pace_adjusted_expectation = (teamPace + opponentPace) / 2;
  features.team_pace_delta = (teamPace - leaguePace) / leaguePace;
  features.opponent_pace_delta = (opponentPace - leaguePace) / leaguePace;

  const recentValues = context?.recentActuals ?? [];
  if (recentValues.length) {
    const mean = recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length;
    const variance = recentValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / recentValues.length;
    features.recent_variance = variance;
    features.recent_std = Math.sqrt(Math.max(variance, 1e-3));
  } else {
    features.recent_variance = 4.0;
    features.recent_std = 2.0;
  }

  const quantile = (arr, p) => {
    if (!arr.length) return baseline;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
    return sorted[idx];
  };
  features.quantile_residual_p50 = line - quantile(recentValues, 0.5);
  features.quantile_residual_p75 = line - quantile(recentValues, 0.75);

  const history = context?.lineHistory ?? [];
  const diffs = history.slice(-6).map((curr, idx, arr) => {
    if (idx === 0) return 0;
    return curr - arr[idx - 1];
  });
  const slope = diffs.length ? diffs.reduce((sum, v) => sum + v, 0) / diffs.length : 0;
  features.over_under_line_delta_slope = slope;

  features.historical_over_rate = context?.historicalOver ?? 0.55;
  features.historical_under_rate = 1 - features.historical_over_rate;

  return features;
}
