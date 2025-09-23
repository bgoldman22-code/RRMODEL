// netlify/functions/nfl-predictions-generate/index.mjs
// v13 LOGIC + v8 WORKING ODDS: Enhanced EPA System with Sophisticated Fixes - DEPLOYED

import { loadAdvancedMetrics, loadInjuries, validateAdvancedMetrics, getTeamMetrics, getCurrentWeek, getCurrentWeights, diagnoseMetricsData } from '../_lib/blobs-nfl.js';
import { calculateMatchups, calculateExpectedPlays, calculateMatchupScore } from '../_lib/matchups.js';

// PHASE 1: Enhanced EPA Features - Calibration Fix
function applyCalibrationFix(confidencePercentage, recentResults = []) {
  // Convert percentage to probability for internal calculations
  const rawProb = confidencePercentage / 100.0;
  
  // Platt scaling on last 8 weeks only (if sufficient data available)
  if (recentResults.length >= 20) {
    const calibratedProb = plattCalibration(rawProb, recentResults.slice(-20));
    return Math.round(calibratedProb * 100);
  }
  
  // Critical fix: 55-65% confidence band drift (where overconfidence occurs)
  if (confidencePercentage >= 55 && confidencePercentage <= 65) {
    // More aggressive calibration than before - pull back by 8%
    const driftAmount = 0.08;
    const logOdds = Math.log(rawProb / (1 - rawProb));
    const adjustedLogOdds = logOdds - driftAmount;
    const calibratedProb = 1 / (1 + Math.exp(-adjustedLogOdds));
    const boundedProb = Math.max(0.35, Math.min(0.85, calibratedProb));
    return Math.round(boundedProb * 100);
  }
  
  // Conservative adjustment for very high confidence (>75%) 
  if (confidencePercentage > 75) {
    const conservativeAdjustment = (confidencePercentage - 75) * 0.1;
    return Math.round(Math.max(35, Math.min(85, confidencePercentage - conservativeAdjustment)));
  }
  
  // Ensure bounds are maintained
  return Math.round(Math.max(35, Math.min(85, confidencePercentage)));
}

// Platt calibration helper for probability recalibration
function plattCalibration(probability, historicalResults) {
  // Simplified Platt scaling - compares predicted vs actual outcomes
  if (!historicalResults || historicalResults.length < 10) return probability;
  
  const avgActual = historicalResults.reduce((sum, r) => sum + (r.correct ? 1 : 0), 0) / historicalResults.length;
  const avgPredicted = historicalResults.reduce((sum, r) => sum + r.confidence, 0) / historicalResults.length;
  
  // If there's systematic bias, apply calibration factor
  if (avgPredicted > 0.5 && Math.abs(avgPredicted - avgActual) > 0.03) {
    const calibrationFactor = avgActual / avgPredicted;
    const calibrated = probability * calibrationFactor;
    return Math.max(0.35, Math.min(0.85, calibrated));
  }
  
  return probability;
}

// PHASE 2: Enhanced EPA Features - No-Bet Logic  
function shouldSkipBet(prediction, gameContext = {}, marketOdds = null) {
  if (!marketOdds || !prediction) return { skip: false, reason: null };
  
  // Use proper true edge calculation with vig removal
  const modelProb = prediction.homeWinProb || (prediction > 0.5 ? prediction : 1 - prediction);
  const trueEdgeData = calculateTrueEdge(modelProb, marketOdds);
  const trueEdge = trueEdgeData.edge;
  
  // Enhanced no-bet conditions based on proper edge calculation
  if (trueEdge < 0.02) { // Minimum 2% true edge (vig-removed)
    return { skip: true, reason: "edge<2%" };
  }
  
  if (gameContext.marginTooClose && trueEdge < 0.03) {
    return { skip: true, reason: "margin<3pts+lowedge" };
  }
  
  if (gameContext.highVariance && trueEdge < 0.035) {
    return { skip: true, reason: "high_variance+lowedge" };
  }
  
  return { skip: false, reason: null, trueEdgeData: trueEdgeData };
}

// Moneyline bet skip logic 
function shouldSkipMoneylineBet(mlPick, gameContext = {}, marketOdds = null, confidence = null, edge = null) {
  // Check confidence threshold for moneyline bets (58% minimum - standard mode)
  if (confidence !== null && confidence < 58) {
    return { skip: true, reason: `confidence<58% (${confidence}%)` };
  }
  
  // Check for negative edge - always skip
  if (edge !== null && edge < 0) {
    return { skip: true, reason: `negative_edge (${edge.toFixed(1)}%)` };
  }
  
  // RELAXED: Allow 1% edge for ML (instead of 2%) - market is sharper
  if (edge !== null && Math.abs(edge) < 1.0) {
    return { skip: true, reason: `edge<1.0% (${Math.abs(edge).toFixed(1)}%)` };
  }
  
  // Use standard edge-based logic for additional checks
  return shouldSkipBet({ homeWinProb: 0.6 }, gameContext, marketOdds);
}

// Total bet skip logic 
function shouldSkipTotalBet(totalPick, totalDiff, gameContext = {}, marketOdds = null, confidence = null, edge = null) {
  // Check confidence threshold for total bets (56% minimum - standard mode)
  if (confidence !== null && confidence < 56) {
    return { skip: true, reason: `confidence<56% (${confidence}%)` };
  }
  
  // RELAXED: Reduce point differential to 2.0 pts (was 2.5)
  if (Math.abs(totalDiff) < 2.0) {
    return { skip: true, reason: `total_diff<2.0pts (${Math.abs(totalDiff).toFixed(1)}pts)` };
  }
  
  // RELAXED: Allow 1.5% edge for totals (was 2.0%) - softer market
  if (edge !== null && edge < 1.5) {
    return { skip: true, reason: `edge<1.5% (${edge.toFixed(1)}%)` };
  }
  
  // Use standard edge-based logic for additional checks
  return shouldSkipBet({ homeWinProb: Math.abs(totalDiff) > 2 ? 0.6 : 0.5 }, gameContext, marketOdds);
}

// Push detection logic for spread bets
function shouldSkipSpreadBet(spreadPick, marginDiff, gameContext = {}, marketOdds = null, confidence = null, edge = null) {
  // Push predictions should always be no-bet
  if (spreadPick === 'push' || Math.abs(marginDiff) < 0.5) {
    return { skip: true, reason: "push_prediction" };
  }
  
  // BALANCED: Use OR condition - bet if EITHER condition is met:
  // Option 1: High confidence (≥60%) regardless of point differential  
  // Option 2: Significant point differential (≥2.0 pts) with basic confidence (≥58%)
  
  const hasHighConfidence = confidence !== null && confidence >= 60;
  const hasSignificantDiff = Math.abs(marginDiff) >= 2.0;
  const hasBasicConfidence = confidence !== null && confidence >= 58;
  
  if (!hasHighConfidence && !(hasSignificantDiff && hasBasicConfidence)) {
    if (confidence < 58) {
      return { skip: true, reason: `confidence<58% (${confidence}%)` };
    } else if (!hasSignificantDiff) {
      return { skip: true, reason: `need ≥60% conf OR ≥2.0pt diff (${confidence}%, ${Math.abs(marginDiff).toFixed(1)}pts)` };
    }
  }
  
  // RELAXED: Allow 1.5% edge for spreads (was 2%)
  if (edge !== null && edge < 1.5) {
    return { skip: true, reason: `edge<1.5% (${edge.toFixed(1)}%)` };
  }
  
  // Use standard edge-based logic for non-push predictions
  return shouldSkipBet({ homeWinProb: 0.6 }, gameContext, marketOdds);
}

// PHASE 3: Enhanced EPA Features - Public Bias Detection
function detectPublicBias(teamCode, marketLine, modelLine) {
  // Popular teams that often get inflated lines
  const publicTeams = ['DAL', 'GB', 'PIT', 'NE', 'KC', 'SF'];
  
  if (publicTeams.includes(teamCode)) {
    const lineInflation = Math.abs(marketLine || 0) - Math.abs(modelLine || 0);
    if (lineInflation > 1.5) {
      return 0.95; // Reduce confidence by 5% for public team bias
    }
  }
  
  return 1.0; // No adjustment needed
}

// PHASE 4: Enhanced EPA Features - Variance Modeling
function calculateEnhancedVariance(homeTeam, awayTeam) {
  // Sophisticated variance modeling for proper tail calibration
  // Base margin variance in points (not probability)
  const baseVariance = 6.0; // Conservative NFL baseline
  
  // 1. Explosive play differential creates fat tails (more 10+ and 17+ results)
  const homeExplosive = homeTeam?.situational?.explosive_rate || homeTeam?.explosive_diff || 0.15;
  const awayExplosive = awayTeam?.situational?.explosive_rate || awayTeam?.explosive_diff || 0.15;
  const explosiveDiff = Math.abs(homeExplosive - awayExplosive);
  const explosiveVariance = 8.0 * Math.min(explosiveDiff, 1.0); // Cap at reasonable level
  
  // 2. Pressure differential widens outcome distribution  
  const homePressure = homeTeam?.pressure?.pressure_diff || 0;
  const awayPressure = awayTeam?.pressure?.pressure_diff || 0;
  const pressureDiff = Math.abs(homePressure - awayPressure) / 10.0; // Normalize
  const pressureVariance = 4.0 * Math.min(pressureDiff, 1.0);
  
  // 3. QB uncertainty increases variance (backup/limited status)
  // TODO: Add QB status detection from injury reports
  const qbUncertainty = 0; // Placeholder - would come from injury data
  
  // 4. Heavy run games have lower variance (more predictable outcomes)
  const homeRunRate = homeTeam?.run_rate || 0.4;
  const awayRunRate = awayTeam?.run_rate || 0.4;
  const avgRunRate = (homeRunRate + awayRunRate) / 2;
  const runReduction = Math.max(0, (avgRunRate - 0.35) * 2.0);
  
  // 5. High turnover volatility increases variance
  const homeTurnover = homeTeam?.turnovers?.turnover_diff || 0;
  const awayTurnover = awayTeam?.turnovers?.turnover_diff || 0;
  const toVolatility = Math.abs(homeTurnover - awayTurnover);
  const turnoverVariance = toVolatility * 0.5;
  
  // Total variance (points-based, not probability)
  const totalVariance = Math.max(
    4.0, // Minimum variance floor
    baseVariance + explosiveVariance + pressureVariance + qbUncertainty + turnoverVariance - runReduction
  );
  
  return {
    total: totalVariance,
    breakdown: {
      base: baseVariance,
      explosive: explosiveVariance,
      pressure: pressureVariance,
      qb: qbUncertainty,
      turnover: turnoverVariance,
      runReduction: runReduction
    },
    // Key insight: Use this variance for P(cover) and tail probabilities, not to add noise to point estimate
    isHighVariance: totalVariance > 10.0
  };
}

// v13 LOGIC: Fixed weights and multipliers
const BASE_WEIGHTS = {
  pressure_diff: 0.22, explosive_diff: 0.20, turnover_diff: 0.12, eds: 0.08,
  rz_td: 0.15, third_down: 0.10, penalty_diff: 0.05, fourth_down_agg: 0.06, top_eff: 0.02
};

const ADVANCED_WEIGHTS = {
  form: 0.12, consistency: 0.02, tempo: 0.02, formations: 0.02, script_adaptation: 0.01,
  current_season_momentum: 0.03
};

const SPECIAL_TEAMS_WEIGHTS = {
  field_goal_net: 0.025, punt_net: 0.015, return_advantage: 0.008, coverage_efficiency: 0.002
};

// v13 LOGIC: Reduced aggressive multipliers
const SCORING_MULTIPLIERS = {
  CORE_EPA: 24,        // v13: Reduced from 30
  TIER_BASE: 8,        // v13: Reduced from 10  
  ADVANCED_BASE: 6,    // v13: Kept same
  MATCHUP_BASE: 3.2,
  SPECIAL_TEAMS_BASE: 3
};

const ROSTER_CONTINUITY_FACTORS = {
  qb_change: 0.3, coach_change: 0.2, coordinator_change: 0.15, major_trades: 0.1, draft_impact: 0.05
};

// v8 WORKING ODDS: Team name mapping that works
const TEAM_NAME_MAPPING = {
  'ARI': 'Arizona Cardinals', 'ATL': 'Atlanta Falcons', 'BAL': 'Baltimore Ravens',
  'BUF': 'Buffalo Bills', 'CAR': 'Carolina Panthers', 'CHI': 'Chicago Bears',
  'CIN': 'Cincinnati Bengals', 'CLE': 'Cleveland Browns', 'DAL': 'Dallas Cowboys',
  'DEN': 'Denver Broncos', 'DET': 'Detroit Lions', 'GB': 'Green Bay Packers',
  'HOU': 'Houston Texans', 'IND': 'Indianapolis Colts', 'JAX': 'Jacksonville Jaguars',
  'KC': 'Kansas City Chiefs', 'LV': 'Las Vegas Raiders', 'LAC': 'Los Angeles Chargers',
  'LAR': 'Los Angeles Rams', 'MIA': 'Miami Dolphins', 'MIN': 'Minnesota Vikings',
  'NE': 'New England Patriots', 'NO': 'New Orleans Saints', 'NYG': 'New York Giants',
  'NYJ': 'New York Jets', 'PHI': 'Philadelphia Eagles', 'PIT': 'Pittsburgh Steelers',
  'SF': 'San Francisco 49ers', 'SEA': 'Seattle Seahawks', 'TB': 'Tampa Bay Buccaneers',
  'TEN': 'Tennessee Titans', 'WAS': 'Washington Commanders'
};

const DIVISIONAL_CONTEXT = {
  'AFC_EAST': ['BUF', 'MIA', 'NE', 'NYJ'], 'AFC_NORTH': ['BAL', 'CIN', 'CLE', 'PIT'], 
  'AFC_SOUTH': ['HOU', 'IND', 'JAX', 'TEN'], 'AFC_WEST': ['DEN', 'KC', 'LV', 'LAC'],
  'NFC_EAST': ['DAL', 'NYG', 'PHI', 'WAS'], 'NFC_NORTH': ['CHI', 'DET', 'GB', 'MIN'],
  'NFC_SOUTH': ['ATL', 'CAR', 'NO', 'TB'], 'NFC_WEST': ['ARI', 'LAR', 'SF', 'SEA']
};

function getDivision(teamCode) {
  for (const [division, teams] of Object.entries(DIVISIONAL_CONTEXT)) {
    if (teams.includes(teamCode)) return division;
  }
  return null;
}

function isDivisionalGame(homeTeam, awayTeam) {
  const homeDivision = getDivision(homeTeam);
  const awayDivision = getDivision(awayTeam);
  return homeDivision === awayDivision;
}

// v13 LOGIC: Utility functions with NaN protection
function z(val, mean = 0, std = 1) { 
  if (isNaN(val) || isNaN(mean) || isNaN(std) || std <= 0) return 0;
  return (val - mean) / std; 
}

// v13 LOGIC: Clip z-scores to prevent extreme outliers
function clippedZ(val, mean = 0, std = 1) {
  const rawZ = z(val, mean, std);
  return Math.max(-2.5, Math.min(2.5, rawZ)); // Clip to ±2.5
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function americanToImplied(american) {
  const odds = Number(american);
  if (!odds || isNaN(odds)) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

// Calculate true edge with proper vig removal - critical missing piece
function calculateTrueEdge(modelProb, marketOdds) {
  if (!marketOdds || !marketOdds.ml_home || !marketOdds.ml_away) {
    return { edge: 0, hasMinimumEdge: false, vigFreeProb: 0.5 };
  }
  
  // Convert American odds to implied probabilities
  const homeImplied = americanToImplied(marketOdds.ml_home);
  const awayImplied = americanToImplied(marketOdds.ml_away);
  
  if (!homeImplied || !awayImplied) {
    return { edge: 0, hasMinimumEdge: false, vigFreeProb: 0.5 };
  }
  
  // Remove vig (overround) - this is the key fix
  const totalImplied = homeImplied + awayImplied;
  const vigFreeHome = homeImplied / totalImplied;  // True vig-removed market probability
  const vigFreeAway = awayImplied / totalImplied;
  
  // True edge = |calibrated_model_prob - vig_free_market_prob|
  const trueEdge = Math.abs(modelProb - vigFreeHome);
  
  return {
    edge: trueEdge,
    hasMinimumEdge: trueEdge >= 0.02, // 2% minimum edge threshold
    vigFreeProb: vigFreeHome,
    vigFreeAwayProb: vigFreeAway,
    vigAmount: totalImplied - 1.0, // How much vig was removed
    marketImplied: { home: homeImplied, away: awayImplied }
  };
}

// v13 LOGIC: Deterministic special teams generation (no Math.random)
function generateSpecialTeamsFromBasics(teamCode, teamMetrics, league) {
  const offEPA = teamMetrics?.core?.off_epa || 0;
  const defEPA = teamMetrics?.core?.def_epa || 0;
  const teamQuality = (offEPA - defEPA) / 2;
  const stQualityFactor = teamQuality * 0.4;
  
  // v13 LOGIC: Deterministic variation based on team code hash instead of Math.random()
  const teamHash = teamCode.split('').reduce((hash, char) => hash + char.charCodeAt(0), 0);
  const deterministicVariation = ((teamHash % 100) / 100 - 0.5) * 0.1; // -0.05 to +0.05
  
  const finalSTFactor = stQualityFactor + deterministicVariation;
  
  return {
    fg_accuracy_combined: clamp(0.84 + finalSTFactor, 0.70, 0.95),
    fg_attempts_per_game: clamp(2.1 + (teamQuality * 0.3), 1.5, 3.2),
    punt_net_average: clamp(42.0 + (finalSTFactor * 4), 36.0, 48.0),
    punt_coverage_efficiency: clamp(0.80 + finalSTFactor, 0.65, 0.92),
    kick_return_average: clamp(22.0 + (finalSTFactor * 2), 18.0, 26.0),
    punt_return_average: clamp(8.5 + (finalSTFactor * 1.5), 6.0, 12.0),
    kick_coverage_efficiency: clamp(0.80 + finalSTFactor, 0.65, 0.92),
    _estimated: true
  };
}

function calculateSpecialTeamsMetrics(teamMetrics, opponentMetrics, league) {
  const teamST = teamMetrics?.special_teams || {};
  const oppST = opponentMetrics?.special_teams || {};
  const leagueST = league?.special_teams || {};
  
  const fgAccuracy = teamST.fg_accuracy_combined ?? leagueST.avg_fg_accuracy ?? 0.84;
  const fgAttempts = teamST.fg_attempts_per_game ?? leagueST.avg_fg_attempts ?? 2.1;
  const oppFGDefense = oppST.fg_defense_rating ?? leagueST.avg_fg_defense ?? 0.84;
  const fgNetValue = (fgAccuracy - oppFGDefense) * fgAttempts * 3;
  
  const puntNetAvg = teamST.punt_net_average ?? leagueST.avg_punt_net ?? 42.0;
  const puntCoverage = teamST.punt_coverage_efficiency ?? leagueST.avg_coverage ?? 0.80;
  const puntFieldPosition = (puntNetAvg - 42.0) / 20;
  const puntCoverageValue = (puntCoverage - 0.80) * 5;
  const puntNetValue = puntFieldPosition + puntCoverageValue;
  
  const kickReturnAvg = teamST.kick_return_average ?? leagueST.avg_kick_return ?? 22.0;
  const puntReturnAvg = teamST.punt_return_average ?? leagueST.avg_punt_return ?? 8.5;
  const oppKickCoverage = oppST.kick_coverage_efficiency ?? leagueST.avg_kick_coverage ?? 0.80;
  const oppPuntCoverageEff = oppST.punt_coverage_efficiency ?? leagueST.avg_punt_coverage ?? 0.80;
  
  const kickReturnAdv = (kickReturnAvg - 22.0) * (1 - oppKickCoverage) * 0.1;
  const puntReturnAdv = (puntReturnAvg - 8.5) * (1 - oppPuntCoverageEff) * 0.15;
  const returnNetValue = kickReturnAdv + puntReturnAdv;
  
  const teamKickCoverage = teamST.kick_coverage_efficiency ?? leagueST.avg_kick_coverage ?? 0.80;
  const teamPuntCoverageEff = teamST.punt_coverage_efficiency ?? leagueST.avg_punt_coverage ?? 0.80;
  const oppKickReturn = oppST.kick_return_average ?? leagueST.avg_kick_return ?? 22.0;
  const oppPuntReturn = oppST.punt_return_average ?? leagueST.avg_punt_return ?? 8.5;
  
  const kickCoverageAdv = (teamKickCoverage - 0.80) * oppKickReturn * 0.05;
  const puntCoverageAdv = (teamPuntCoverageEff - 0.80) * oppPuntReturn * 0.08;
  const coverageNetValue = kickCoverageAdv + puntCoverageAdv;
  
  const totalSTValue = fgNetValue + puntNetValue + returnNetValue + coverageNetValue;
  const weatherFactor = teamMetrics?.game_conditions?.is_dome ? 1.0 : 0.95;
  const weatherAdjustedST = totalSTValue * weatherFactor;
  
  return {
    field_goal_net: fgNetValue, punt_net: puntNetValue, return_advantage: returnNetValue,
    coverage_efficiency: coverageNetValue, total_st_value: weatherAdjustedST, weather_factor: weatherFactor,
    components: {
      fg_accuracy: fgAccuracy, fg_attempts: fgAttempts, punt_net_avg: puntNetAvg,
      kick_return_avg: kickReturnAvg, punt_return_avg: puntReturnAvg,
      kick_coverage: teamKickCoverage, punt_coverage: teamPuntCoverageEff
    }
  };
}

function calculateRosterContinuity(teamMetrics, teamCode) {
  const rosterData = teamMetrics?.roster_continuity || {};
  let continuityScore = 1.0;
  
  if (rosterData.qb_change) continuityScore -= ROSTER_CONTINUITY_FACTORS.qb_change;
  if (rosterData.coach_change) continuityScore -= ROSTER_CONTINUITY_FACTORS.coach_change;
  if (rosterData.coordinator_change) continuityScore -= ROSTER_CONTINUITY_FACTORS.coordinator_change;
  if (rosterData.major_trades) continuityScore -= ROSTER_CONTINUITY_FACTORS.major_trades * rosterData.major_trades;
  if (rosterData.draft_impact) continuityScore -= ROSTER_CONTINUITY_FACTORS.draft_impact;
  
  return clamp(continuityScore, 0.3, 1.0);
}

function calculateContextAwareWeights(currentWeek, homeMetrics, awayMetrics) {
  let baseCurrentWeight;
  if (currentWeek <= 3) baseCurrentWeight = 0.80;
  else if (currentWeek <= 6) baseCurrentWeight = 0.85;
  else if (currentWeek <= 12) baseCurrentWeight = 0.88;
  else baseCurrentWeight = 0.90;
  
  const homeContinuity = calculateRosterContinuity(homeMetrics, 'HOME');
  const awayContinuity = calculateRosterContinuity(awayMetrics, 'AWAY');
  const avgContinuity = (homeContinuity + awayContinuity) / 2;
  const continuityAdjustment = (1 - avgContinuity) * 0.15;
  const adjustedCurrentWeight = clamp(baseCurrentWeight + continuityAdjustment, 0.7, 0.95);
  
  return {
    season_2025: adjustedCurrentWeight,
    season_2024: (1 - adjustedCurrentWeight) * 0.7,
    season_2023: (1 - adjustedCurrentWeight) * 0.3,
    recent_4_weeks: currentWeek <= 4 ? 0.15 : 0.10
  };
}

function calculateEvidenceStrength(teamMetrics, currentWeek) {
  const processMetrics = {
    pressure_consistency: Math.abs(teamMetrics?.pressure?.pressure_diff || 0),
    explosive_consistency: Math.abs(teamMetrics?.situational?.explosive_diff || 0),
    pace_consistency: teamMetrics?.tempo?.pace_consistency || 0.5
  };
  
  const outcomeVariance = teamMetrics?.consistency?.variance || 0.5;
  const sampleFactor = Math.min(currentWeek / 6, 1);
  const processStrength = (processMetrics.pressure_consistency + processMetrics.explosive_consistency) / 2;
  const reliabilityFactor = 1 - outcomeVariance;
  const evidenceStrength = (processStrength * 0.4 + reliabilityFactor * 0.3 + sampleFactor * 0.3);
  
  return clamp(evidenceStrength, 0.2, 1.0);
}

function applyBayesianUpdating(historicalScore, currentScore, evidenceStrength, currentWeight) {
  const prior = historicalScore;
  const evidence = currentScore;
  const updateStrength = evidenceStrength * currentWeight * 1.2;
  return prior + (evidence - prior) * updateStrength;
}

function calculateCurrentSeasonMomentum(teamMetrics, currentWeek) {
  if (currentWeek <= 2) return 0;
  const recentForm = teamMetrics?.form?.off || 0;
  const seasonPerformance = teamMetrics?.core?.off_epa || 0;
  const momentum = Math.max(-0.1, Math.min(0.1, recentForm * 2));
  return momentum;
}

// v13 LOGIC: Main team scoring function with all fixes
function scoreTeamFromFeatures(teamData, league, contextWeights, matchupTerms = null, isHome = false, currentWeek = 3, opponentData = null, teamCode = null) {
  if (!teamData || !league) {
    return { score: 0, confidence: 0.5, evidenceStrength: 0.25, specialTeams: null };
  }

  // v13 LOGIC: Safe proxy for league means/stds
  const means = new Proxy(league.means || {}, { get: (t, k) => (k in t ? t[k] : 0) });
  const stds = new Proxy(league.stds || {}, { get: (t, k) => (k in t ? t[k] : 1) });

  const hasHistoricalData = teamData._metadata?.hasHistoricalData || false;
  const sit = teamData?.situational || {};
  const press = teamData?.pressure || {};
  const to = teamData?.turnovers || {};
  const coach = teamData?.coaching || {};
  const disc = teamData?.discipline || {};
  const tempo = teamData?.tempo || {};
  const core = teamData?.core || {};
  const script = teamData?.script || {};
  const formations = teamData?.formations || {};

  // v13 LOGIC: Use clippedZ to prevent extreme outliers
  const zPress = clippedZ(press.pressure_diff ?? 0, means.pressure_diff, stds.pressure_diff);
  const zExpl = clippedZ(sit.explosive_diff ?? 0, means.explosive_diff, stds.explosive_diff);
  const zTOdiff = clippedZ(to.turnover_diff ?? 0, means.turnover_diff, stds.turnover_diff);
  const zEDS = clippedZ(sit.eds ?? 0, means.eds, stds.eds);
  const zRZ = clippedZ(sit.rz_td_off ?? 0, means.rz_td_off, stds.rz_td_off);
  const zThird = clippedZ(sit.third_down_off ?? 0, means.third_down_off, stds.third_down_off);
  const z4th = clippedZ(coach.fourth_down_agg ?? 0, means.fourth_down_agg, stds.fourth_down_agg);
  const zPen = clippedZ(disc.penalty_diff ?? 0, means.penalty_diff, stds.penalty_diff);
  const zTOP = clippedZ(tempo.top_eff ?? 0, means.top_eff, stds.top_eff);

  const offEPA = core.off_adj_epa ?? core.off_epa ?? 0;
  const defEPA = -(core.def_adj_epa ?? core.def_epa ?? 0);
  const coreScore = (offEPA + defEPA) * SCORING_MULTIPLIERS.CORE_EPA;

  const consistency = teamData?.consistency?.off ?? 0.5;
  const form = teamData?.form?.off ?? 0;
  const enhancedForm = hasHistoricalData && contextWeights?.recent_4_weeks > 0 ? 
    form * (1 + contextWeights.recent_4_weeks * 2.5) : form;

  const currentMomentum = calculateCurrentSeasonMomentum(teamData, currentWeek);
  const paceAdj = clamp((tempo.pace ?? 30) / 30 - 1, -0.5, 0.5);
  const motionAdv = (formations.motion_rate ?? 0.4) - 0.4;
  const scriptAdapt = script.trailing_epa ?? 0;
  const evidenceStrength = calculateEvidenceStrength(teamData, currentWeek);

  const tierScore = 
    (BASE_WEIGHTS.pressure_diff * zPress * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.explosive_diff * zExpl * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.turnover_diff * zTOdiff * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.eds * zEDS * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.rz_td * zRZ * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.third_down * zThird * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.fourth_down_agg * z4th * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.penalty_diff * zPen * SCORING_MULTIPLIERS.TIER_BASE) +
    (BASE_WEIGHTS.top_eff * zTOP * SCORING_MULTIPLIERS.TIER_BASE);

  const advancedScore = 
    (ADVANCED_WEIGHTS.consistency * (consistency - 0.5) * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.form * enhancedForm * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.current_season_momentum * currentMomentum * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.tempo * paceAdj * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.formations * motionAdv * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.script_adaptation * scriptAdapt * SCORING_MULTIPLIERS.ADVANCED_BASE);

  const matchupScore = calculateMatchupScore(matchupTerms) * SCORING_MULTIPLIERS.MATCHUP_BASE;

  // v13 LOGIC: Special teams integration
  let specialTeamsScore = 0;
  let specialTeamsMetrics = null;
  
  if (opponentData && teamCode) {
    const teamST = teamData.special_teams || generateSpecialTeamsFromBasics(teamCode, teamData, league);
    const oppST = opponentData.special_teams || generateSpecialTeamsFromBasics('OPP', opponentData, league);
    
    const tempTeamMetrics = { ...teamData, special_teams: teamST };
    const tempOppMetrics = { ...opponentData, special_teams: oppST };
    
    specialTeamsMetrics = calculateSpecialTeamsMetrics(tempTeamMetrics, tempOppMetrics, league);
    specialTeamsScore = 
      (SPECIAL_TEAMS_WEIGHTS.field_goal_net * specialTeamsMetrics.field_goal_net * SCORING_MULTIPLIERS.SPECIAL_TEAMS_BASE) +
      (SPECIAL_TEAMS_WEIGHTS.punt_net * specialTeamsMetrics.punt_net * SCORING_MULTIPLIERS.SPECIAL_TEAMS_BASE) +
      (SPECIAL_TEAMS_WEIGHTS.return_advantage * specialTeamsMetrics.return_advantage * SCORING_MULTIPLIERS.SPECIAL_TEAMS_BASE) +
      (SPECIAL_TEAMS_WEIGHTS.coverage_efficiency * specialTeamsMetrics.coverage_efficiency * SCORING_MULTIPLIERS.SPECIAL_TEAMS_BASE);
  }

  const currentSeasonScore = coreScore + tierScore + advancedScore + matchupScore + specialTeamsScore;
  const historicalScore = currentSeasonScore * 0.85;
  const finalScore = applyBayesianUpdating(historicalScore, currentSeasonScore, evidenceStrength, contextWeights.season_2025);
  
  const baseConfidence = 0.5;
  const evidenceBoost = evidenceStrength * 0.25;
  const sampleBoost = Math.min(currentWeek / 8, 0.15);
  const stConfidenceBoost = specialTeamsMetrics ? 0.02 : 0;
  const finalConfidence = clamp(baseConfidence + evidenceBoost + sampleBoost + stConfidenceBoost, 0.35, 0.85);

  return { score: finalScore, confidence: finalConfidence, evidenceStrength: evidenceStrength, specialTeams: specialTeamsMetrics };
}

// ELITE PRO MODEL: Replacement Value Theory for Injury Adjustments
// Based on (Player_EPA - Replacement_EPA) * Usage_Rate * Context_Multipliers

const PLAYER_EPA_DATABASE = {
  // 2024-2025 season EPA per play data (starter vs backup differentials)
  RB: {
    // Format: [Starter_EPA_per_play, Typical_Backup_EPA_per_play, Usage_Share_When_Healthy]
    'James Conner': [0.18, -0.05, 0.65], // Conner vs Benson/Demercado
    'Christian McCaffrey': [0.28, -0.02, 0.72],
    'Saquon Barkley': [0.22, 0.08, 0.68],
    'Josh Jacobs': [0.15, -0.08, 0.62],
    'Derrick Henry': [0.21, 0.02, 0.58],
    'Bijan Robinson': [0.19, 0.05, 0.64],
    // Add more as needed
  },
  WR: {
    'Tyreek Hill': [0.25, 0.08, 0.28],
    'Davante Adams': [0.23, 0.06, 0.26],
    'Cooper Kupp': [0.24, 0.09, 0.25],
    'Marvin Harrison Jr.': [0.16, 0.04, 0.22], // Rookie projection
    // Add more as needed
  },
  TE: {
    'Travis Kelce': [0.20, 0.02, 0.18],
    'Mark Andrews': [0.18, 0.01, 0.16],
    'George Kittle': [0.19, 0.03, 0.15],
    // Add more as needed
  },
  QB: {
    'Josh Allen': [0.31, 0.08, 1.0],
    'Patrick Mahomes II': [0.29, 0.12, 1.0],
    'Lamar Jackson': [0.28, 0.06, 1.0],
    'Kyler Murray': [0.24, 0.05, 1.0],
    // Add more as needed
  }
};

const TEAM_SCHEME_DEPENDENCY = {
  // How much each team's offense depends on specific positions (0.5 = average, 1.0 = extremely dependent)
  'ARI': { RB: 0.75, WR: 0.85, TE: 0.6, QB: 0.9 }, // Run-heavy, Kyler-dependent
  'SEA': { RB: 0.8, WR: 0.7, TE: 0.5, QB: 0.85 },
  'KC': { RB: 0.5, WR: 0.6, TE: 0.9, QB: 1.0 }, // Mahomes + Kelce system
  'SF': { RB: 0.95, WR: 0.65, TE: 0.8, QB: 0.7 }, // CMC-dependent
  'PHI': { RB: 0.85, WR: 0.7, TE: 0.6, QB: 0.9 }, // Saquon + Hurts
  // Add more teams as needed - default to 0.7 across positions
};

const MATCHUP_CONTEXT_MULTIPLIERS = {
  // How replacement players perform vs specific defensive strengths
  vs_run_defense: {
    'elite': 0.8,    // Replacement RBs struggle more vs elite run D
    'good': 0.9,
    'average': 1.0,
    'poor': 1.1      // Replacement RBs might not struggle as much vs poor run D
  },
  vs_pass_defense: {
    'elite': 0.85,   // Backup WRs/TEs struggle more vs elite pass D  
    'good': 0.9,
    'average': 1.0,
    'poor': 1.05
  }
};

function calculateReplacementValue(playerName, position, teamCode, opponentCode, injuries) {
  // Get player EPA data
  const playerData = PLAYER_EPA_DATABASE[position]?.[playerName];
  if (!playerData) {
    // Unknown player - use position averages
    console.warn(`No EPA data for ${playerName} (${position}), using defaults`);
    return calculateDefaultInjuryImpact(position, teamCode);
  }

  const [starterEPA, replacementEPA, usageShare] = playerData;
  
  // Base replacement value calculation (negative because losing good player hurts)
  const baseImpact = -(starterEPA - replacementEPA) * usageShare;
  
  // Apply team scheme dependency
  const teamScheme = TEAM_SCHEME_DEPENDENCY[teamCode] || { RB: 0.7, WR: 0.7, TE: 0.7, QB: 0.8 };
  const schemeDependency = teamScheme[position] || 0.7;
  const schemeAdjustedImpact = baseImpact * schemeDependency;
  
  // Apply matchup context (simplified - would need opponent defensive rankings)
  const matchupMultiplier = getMatchupMultiplier(position, opponentCode);
  const contextAdjustedImpact = schemeAdjustedImpact * matchupMultiplier;
  
  // Convert EPA per play to expected points per game (assuming ~65 relevant plays)
  const expectedGameImpact = contextAdjustedImpact * 65;
  
  return {
    baseImpact,
    schemeAdjustedImpact,
    contextAdjustedImpact,
    expectedGameImpact,
    confidence: playerData ? 0.85 : 0.6 // Higher confidence with real data
  };
}

function getMatchupMultiplier(position, opponentCode) {
  // Simplified matchup context - in reality would pull defensive rankings
  const defaultMultipliers = {
    'SEA': { RB: 0.9, WR: 1.05, TE: 1.0 }, // Good run D, vulnerable pass D
    'SF': { RB: 0.85, WR: 0.9, TE: 0.9 },   // Elite defense overall
    'KC': { RB: 1.05, WR: 1.0, TE: 1.0 },   // Average defense
    'ARI': { RB: 1.1, WR: 1.05, TE: 1.05 }, // Poor defense
    // Add more as needed
  };
  
  return defaultMultipliers[opponentCode]?.[position] || 1.0;
}

function calculateDefaultInjuryImpact(position, teamCode) {
  // Fallback for unknown players - conservative estimates
  const defaultImpacts = {
    RB: -1.8,  // Average RB1 vs RB2 impact
    WR: -2.2,  // Average WR1 vs WR2 impact  
    TE: -1.1,  // Average TE1 vs TE2 impact
    QB: -4.5   // Average QB1 vs QB2 impact
  };
  
  const teamScheme = TEAM_SCHEME_DEPENDENCY[teamCode] || { RB: 0.7, WR: 0.7, TE: 0.7, QB: 0.8 };
  const baseImpact = defaultImpacts[position] || -1.0;
  const schemeDependency = teamScheme[position] || 0.7;
  
  return {
    baseImpact,
    schemeAdjustedImpact: baseImpact * schemeDependency,
    contextAdjustedImpact: baseImpact * schemeDependency,
    expectedGameImpact: baseImpact * schemeDependency,
    confidence: 0.6
  };
}

function applyInjuryAdjustments(scoreData, teamCode, injuries) {
  const teamInjuries = injuries.teams?.[teamCode] || {};
  let totalDelta = 0;
  const injuryAnalysis = {
    adjustments: [],
    totalImpact: 0,
    confidence: 1.0,
    baselineCorrection: 'elite_v1' // Track our approach
  };

  // ELITE BASELINE CORRECTION APPROACH:
  // Only apply injury adjustments for players whose absence ISN'T already 
  // reflected in the season statistics baseline
  
  // QB Injuries - Always apply (major system impact)
  if (teamInjuries.qb_status && teamInjuries.qb_status !== 'active') {
    const qbName = teamInjuries.qb_name || 'Unknown QB';
    const qbImpact = calculateReplacementValue(qbName, 'QB', teamCode, null, injuries);
    
    let qbDelta = 0;
    switch (teamInjuries.qb_status) {
      case 'out': 
        qbDelta = qbImpact.expectedGameImpact;
        break;
      case 'doubtful': 
        qbDelta = qbImpact.expectedGameImpact * 0.7;
        break;
      case 'questionable': 
        qbDelta = qbImpact.expectedGameImpact * 0.3;
        break;
    }
    
    totalDelta += qbDelta;
    injuryAnalysis.adjustments.push({
      player: qbName,
      position: 'QB',
      status: teamInjuries.qb_status,
      impact: qbDelta,
      analysis: qbImpact,
      reason: 'QB injuries always applied - major system impact'
    });
  }

  // SKILL POSITION INJURIES - Apply baseline correction logic
  const skillPositions = ['RB', 'WR', 'TE'];
  
  skillPositions.forEach(position => {
    const positionInjuries = teamInjuries[`${position.toLowerCase()}_injuries`] || [];
    
    positionInjuries.forEach(injury => {
      const playerName = injury.name || injury.player || 'Unknown';
      const status = injury.status || 'questionable';
      const depthPosition = injury.depth || 1;
      
      if (status === 'active') return;
      
      // ELITE LOGIC: Only apply if player contributed significantly to season baseline
      const contributedToBaseline = checkPlayerBaselineContribution(playerName, position, teamCode);
      if (!contributedToBaseline) {
        injuryAnalysis.adjustments.push({
          player: playerName,
          position: position,
          status: status,
          impact: 0,
          reason: 'Baseline correction: Player absence already reflected in season stats'
        });
        return;
      }
      
      // Only calculate for key players (starters + key backups)  
      if (depthPosition > 2) return;
      
      const impactAnalysis = calculateReplacementValue(playerName, position, teamCode, null, injuries);
      
      let positionDelta = 0;
      const depthMultiplier = depthPosition === 1 ? 1.0 : 0.4;
      
      switch (status) {
        case 'out':
          positionDelta = impactAnalysis.expectedGameImpact * depthMultiplier;
          break;
        case 'doubtful':
          positionDelta = impactAnalysis.expectedGameImpact * depthMultiplier * 0.7;
          break;
        case 'questionable':
          positionDelta = impactAnalysis.expectedGameImpact * depthMultiplier * 0.3;
          break;
      }
      
      totalDelta += positionDelta;
      injuryAnalysis.adjustments.push({
        player: playerName,
        position: position,
        status: status,
        depth: depthPosition,
        impact: positionDelta,
        analysis: impactAnalysis,
        reason: 'Applied: Player contributed to baseline, replacement value calculated'
      });
    });
  });

  // Traditional positional injuries (O-line, Defense, Special Teams)
  const olOut = teamInjuries.ol_starters_out ?? 0;
  const dbOut = teamInjuries.db_starters_out ?? 0;
  if (olOut >= 2) {
    totalDelta -= 2;
    injuryAnalysis.adjustments.push({
      position: 'OL',
      impact: -2,
      reason: `${olOut} offensive line starters out`
    });
  }
  if (olOut >= 3) {
    totalDelta -= 4;
    injuryAnalysis.adjustments.push({
      position: 'OL',
      impact: -4,
      reason: `${olOut} offensive line starters out (cumulative)`
    });
  }
  if (dbOut >= 2) {
    totalDelta -= 1.5;
    injuryAnalysis.adjustments.push({
      position: 'DB',
      impact: -1.5,
      reason: `${dbOut} defensive backs out`
    });
  }

  if (teamInjuries.kicker_status === 'out') {
    totalDelta -= 1.5;
    injuryAnalysis.adjustments.push({
      position: 'K',
      impact: -1.5,
      reason: 'Kicker out'
    });
  }
  if (teamInjuries.punter_status === 'out') {
    totalDelta -= 1.0;
    injuryAnalysis.adjustments.push({
      position: 'P',
      impact: -1.0,
      reason: 'Punter out'
    });
  }
  if (teamInjuries.returner_status === 'out') {
    totalDelta -= 0.5;
    injuryAnalysis.adjustments.push({
      position: 'KR/PR',
      impact: -0.5,
      reason: 'Return specialist out'
    });
  }

  // Calculate confidence adjustment based on injury impact magnitude
  const confidenceReduction = Math.min(Math.abs(totalDelta) * 0.02, 0.15);
  injuryAnalysis.totalImpact = totalDelta;
  injuryAnalysis.confidence = 1 - confidenceReduction;
  
  return {
    score: scoreData.score + totalDelta,
    confidence: scoreData.confidence * injuryAnalysis.confidence,
    evidenceStrength: scoreData.evidenceStrength,
    specialTeams: scoreData.specialTeams,
    injuryAnalysis: injuryAnalysis
  };
}

// ELITE BASELINE CORRECTION FUNCTION
function checkPlayerBaselineContribution(playerName, position, teamCode) {
  // Elite logic: Check if player significantly contributed to season baseline stats
  // If player missed significant time already this season, their absence is 
  // already baked into the team's EPA baseline
  
  const BASELINE_CONTRIBUTORS = {
    // Players who played significant snaps and ARE in the season baseline
    'ARI': {
      'RB': ['James Conner'], // Conner played early season, IS in baseline
      'WR': ['Marvin Harrison Jr.', 'Michael Wilson'],
      'TE': ['Trey McBride']
    },
    'BUF': {
      'QB': ['Josh Allen'],
      'RB': ['James Cook III'],
      'WR': ['Khalil Shakir', 'Keon Coleman'],
      'TE': ['Dalton Kincaid']
    },
    'KC': {
      'QB': ['Patrick Mahomes II'],
      'RB': ['Kareem Hunt'],
      'WR': ['DeAndre Hopkins', 'Xavier Worthy'],
      'TE': ['Travis Kelce']
    }
    // Add more teams as needed, or implement dynamic lookup
  };
  
  const teamContributors = BASELINE_CONTRIBUTORS[teamCode];
  if (!teamContributors || !teamContributors[position]) {
    // Default: assume player contributed to baseline if we don't have data
    return true;
  }
  
  return teamContributors[position].includes(playerName);
}

// v13 LOGIC: Fixed spread calculation
function calculateSpreadPrediction(homeScoreData, awayScoreData, homeCode, awayCode) {
  const avgConfidence = (homeScoreData.confidence + awayScoreData.confidence) / 2;
  
  const qualityDifferential = awayScoreData.score - homeScoreData.score;
  const qualityAdjustment = Math.max(0, qualityDifferential * 0.2);
  
  const confidentHFA = Math.max(1.5, 2.2 - qualityAdjustment);
  const uncertainHFA = Math.max(1.0, 1.2 - qualityAdjustment);
  const dynamicHFA = confidentHFA - (confidentHFA - uncertainHFA) * (1 - avgConfidence);
  
  const isDivisional = isDivisionalGame(homeCode, awayCode);
  const divisionalAdjustment = isDivisional ? 0.8 : 1.0;
  
  const adjustedHFA = dynamicHFA * divisionalAdjustment;
  
  const scoreDifference = homeScoreData.score - awayScoreData.score;
  const spreadFromScores = scoreDifference * 3.5;
  
  let stSpreadAdjustment = 0;
  if (homeScoreData.specialTeams && awayScoreData.specialTeams) {
    const homeSTValue = homeScoreData.specialTeams.total_st_value;
    const awaySTValue = awayScoreData.specialTeams.total_st_value;
    stSpreadAdjustment = (homeSTValue - awaySTValue) * 0.5;
  }
  
  const predictedHomeMargin = adjustedHFA + spreadFromScores + stSpreadAdjustment;
  
  return clamp(predictedHomeMargin, -21, 21);
}

function calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread = 0, homeSTData = null, awaySTData = null) {
  const homeOffEPA = homeMetrics?.core?.off_epa || 0;
  const awayOffEPA = awayMetrics?.core?.off_epa || 0;
  const homeDefEPA = homeMetrics?.core?.def_epa || 0;
  const awayDefEPA = awayMetrics?.core?.def_epa || 0;
  const homeForm = homeMetrics?.form?.off || 0;
  const awayForm = awayMetrics?.form?.off || 0;
  
  const homeBasePoints = 24.0 + (homeOffEPA * 95) + (homeForm * 20);
  const awayBasePoints = 24.0 + (awayOffEPA * 95) + (awayForm * 20);
  
  const homePointsVsDefense = homeBasePoints - (awayDefEPA * 25);
  const awayPointsVsDefense = awayBasePoints - (homeDefEPA * 25);
  
  const homeExplosive = homeMetrics?.situational?.explosive_off ?? 0;
  const awayExplosive = awayMetrics?.situational?.explosive_off ?? 0;
  const homeExplosiveBoost = homeExplosive * 8;
  const awayExplosiveBoost = awayExplosive * 8;
  
  const homePace = Math.max(homeMetrics?.tempo?.pace || 65, 60);
  const awayPace = Math.max(awayMetrics?.tempo?.pace || 65, 60);
  const avgPace = (homePace + awayPace) / 2;
  const paceMultiplier = avgPace / 67;
  
  const wind15 = false;
  const neutralConditionsBoost = (!wind15 && Math.abs(marketSpread) <= 7) ? 1.5 : 0;
  
  const expectedMargin = Math.abs(marketSpread || 0);
  const gameScriptFactor = expectedMargin > 7 ? 0.95 : 1.0;
  
  const homeProjected = Math.max(14, (homePointsVsDefense + homeExplosiveBoost) * paceMultiplier * gameScriptFactor);
  const awayProjected = Math.max(14, (awayPointsVsDefense + awayExplosiveBoost) * paceMultiplier * gameScriptFactor);
  let baseTotal = homeProjected + awayProjected + neutralConditionsBoost;
  
  let stTotalAdjustment = 0;
  if (homeSTData && awaySTData) {
    const homeFGImpact = homeSTData.field_goal_net * 0.6;
    const awayFGImpact = awaySTData.field_goal_net * 0.6;
    const homeReturnImpact = homeSTData.return_advantage * 0.15;
    const awayReturnImpact = awaySTData.return_advantage * 0.15;
    stTotalAdjustment = homeFGImpact + awayFGImpact + homeReturnImpact + awayReturnImpact;
  }
  
  return clamp(baseTotal + stTotalAdjustment, 38, 68);
}

function calculateConfidence(modelProb, marketProb, edge, scoreConfidence, evidenceStrength, scoreDifference = 0, betType = 'spread', gameContext = {}) {
  const modelCertainty = Math.abs(modelProb - 0.5) * 2;
  const edgeComponent = edge ? Math.min(Math.abs(edge), 0.15) / 0.15 : 0;
  const differentiationBoost = Math.min(Math.abs(scoreDifference) / 12, 0.15);
  const scoreConfidenceBoost = (scoreConfidence - 0.5) * 0.2;
  const evidenceBoost = evidenceStrength * 0.15;
  
  const rawConfidence = (modelCertainty * 0.5) + (edgeComponent * 0.2) + 
                       scoreConfidenceBoost + evidenceBoost + differentiationBoost;
  
  let baseConfidence = Math.max(50, Math.round(rawConfidence * 50 + 55));
  
  baseConfidence = 50 + ((baseConfidence - 50) * 0.6);
  
  if (gameContext.week <= 4) {
    baseConfidence = baseConfidence * 0.95;
  }
  
  if (gameContext.divisional) {
    baseConfidence = baseConfidence * 0.98;
  }
  
  if (gameContext.majorInjuries) {
    baseConfidence = Math.max(baseConfidence, 65);
  }
  
  if (betType === 'total') {
    const totalEdge = Math.abs(edge || 0);
    if (totalEdge < 3.0) {
      baseConfidence = Math.min(baseConfidence, 58);
    } else if (totalEdge < 4.5) {
      baseConfidence = Math.min(baseConfidence, 62);
    } else {
      baseConfidence = Math.min(baseConfidence, 68);
    }
  }
  
  if (baseConfidence > 78) baseConfidence = Math.min(baseConfidence, 78);
  
  // PHASE 1 ENHANCEMENT: Apply calibration fix for 55-65% band
  const calibratedConfidence = applyCalibrationFix(baseConfidence);
  
  return Math.round(calibratedConfidence);
}

// v8 WORKING ODDS: Load live odds (proven working)
async function loadLiveOdds() {
  try {
    console.log('Fetching live odds...');
    const oddsRes = await fetch('https://bgroundrobin.com/.netlify/functions/nfl-odds-get?regions=us&markets=h2h,spreads,totals');
    if (!oddsRes.ok) {
      throw new Error(`Odds API failed: ${oddsRes.status}`);
    }
    const oddsResponse = await oddsRes.json();
    const oddsData = oddsResponse.games || oddsResponse || [];
    console.log(`Loaded odds for ${oddsData.length} games`);
    return oddsData;
  } catch (error) {
    console.warn('Failed to load live odds:', error);
    return [];
  }
}

// v8 WORKING ODDS: Find odds for a specific game (proven working)
function findGameOdds(allOdds, homeTeam, awayTeam) {
  const homeTeamFull = TEAM_NAME_MAPPING[homeTeam] || homeTeam;
  const awayTeamFull = TEAM_NAME_MAPPING[awayTeam] || awayTeam;
  
  console.log(`Searching for: ${awayTeamFull} @ ${homeTeamFull}`);
  
  const found = allOdds.find(odds => 
    odds.home_team === homeTeamFull && odds.away_team === awayTeamFull
  );
  
  console.log(`Match found: ${!!found}`);
  return found;
}

// FIXED: Extract odds using v13 logic that actually works with your API
function extractOddsData(gameOdds) {
  if (!gameOdds) return {};
  
  // Your API returns both structures - use the working one
  let markets = {};
  
  if (gameOdds.markets) {
    // Direct markets structure (this is what works)
    markets = gameOdds.markets;
    console.log('Using direct markets structure');
  } else if (gameOdds.bookmakers?.[0]?.markets) {
    // Fallback to bookmaker structure  
    const primaryBook = gameOdds.bookmakers[0];
    primaryBook.markets.forEach(market => {
      markets[market.key] = market.outcomes || [];
    });
    console.log('Using bookmaker structure fallback');
  } else {
    console.warn('No markets found in odds data');
    return {};
  }
  
  // Extract moneyline
  const h2hMarket = markets.h2h || [];
  const homeMLOutcome = h2hMarket.find(o => o.name === gameOdds.home_team);
  const awayMLOutcome = h2hMarket.find(o => o.name === gameOdds.away_team);
  
  // Extract spread
  const spreadsMarket = markets.spreads || [];
  const homeSpreadOutcome = spreadsMarket.find(o => o.name === gameOdds.home_team);
  const awaySpreadOutcome = spreadsMarket.find(o => o.name === gameOdds.away_team);
  
  let favoriteTeam = null;
  let favoriteSpread = null;
  
  if (homeSpreadOutcome && homeSpreadOutcome.point < 0) {
    favoriteTeam = 'home';
    favoriteSpread = homeSpreadOutcome.point;
  } else if (awaySpreadOutcome && awaySpreadOutcome.point < 0) {
    favoriteTeam = 'away';
    favoriteSpread = awaySpreadOutcome.point;
  } else {
    favoriteSpread = homeSpreadOutcome?.point || awaySpreadOutcome?.point || 0;
  }
  
  // Extract total
  const totalsMarket = markets.totals || [];
  const totalOutcome = totalsMarket[0];
  
  const result = {
    ml_home: homeMLOutcome?.price,
    ml_away: awayMLOutcome?.price,
    spread_line: favoriteSpread,
    spread_favorite: favoriteTeam,
    total_line: totalOutcome?.point,
    _extraction_success: !!(homeMLOutcome && awayMLOutcome && favoriteSpread !== null && totalOutcome)
  };
  
  console.log('Odds extraction result:', result);
  return result;
}

// v13 LOGIC: Generate parlay components
function generateParlayComponents(games, predictions) {
  const components = [];
  
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const pred = predictions[i];
    
    const mlPick = pred.predictions.moneyline;
    const spreadPick = pred.predictions.spread;
    const totalPick = pred.predictions.total;
    
    if (mlPick.confidence >= 65 && mlPick.edge >= 10) {
      const unitInfo = calculateRecommendedUnits(mlPick.confidence, mlPick.edge, 'straight');
      components.push({
        gameId: game.game_id || `${game.away_team}_${game.home_team}`,
        matchup: `${game.away_team} @ ${game.home_team}`,
        type: 'moneyline',
        pick: mlPick.pick,
        confidence: mlPick.confidence,
        edge: mlPick.edge,
        description: `${mlPick.pick} ML`,
        odds: pred.odds?.moneyline?.pick_odds,
        ev_score: (mlPick.confidence - 50) * mlPick.edge,
        recommended_units: unitInfo.units,
        unit_tier: unitInfo.tier,
        unit_reasoning: unitInfo.reasoning
      });
    }
    
    if (spreadPick.confidence >= 62 && spreadPick.edge >= 1.5 && spreadPick.pick !== 'push') {
      const unitInfo = calculateRecommendedUnits(spreadPick.confidence, spreadPick.edge, 'straight');
      components.push({
        gameId: game.game_id || `${game.away_team}_${game.home_team}`,
        matchup: `${game.away_team} @ ${game.home_team}`,
        type: 'spread',
        pick: spreadPick.pick,
        confidence: spreadPick.confidence,
        edge: spreadPick.edge,
        description: `${spreadPick.pick} ${spreadPick.line >= 0 ? '+' : ''}${spreadPick.line}`,
        odds: pred.odds?.spread?.pick_odds,
        ev_score: (spreadPick.confidence - 50) * spreadPick.edge,
        recommended_units: unitInfo.units,
        unit_tier: unitInfo.tier,
        unit_reasoning: unitInfo.reasoning
      });
    }
    
    if (totalPick.confidence >= 60 && totalPick.edge >= 2.5) {
      const unitInfo = calculateRecommendedUnits(totalPick.confidence, totalPick.edge, 'straight');
      components.push({
        gameId: game.game_id || `${game.away_team}_${game.home_team}`,
        matchup: `${game.away_team} @ ${game.home_team}`,
        type: 'total',
        pick: totalPick.pick,
        confidence: totalPick.confidence,
        edge: totalPick.edge,
        description: `${totalPick.pick.toUpperCase()} ${totalPick.line}`,
        odds: null,
        ev_score: (totalPick.confidence - 50) * totalPick.edge * 0.8,
        recommended_units: unitInfo.units,
        unit_tier: unitInfo.tier,
        unit_reasoning: unitInfo.reasoning
      });
    }
  }
  
  components.sort((a, b) => b.ev_score - a.ev_score);
  return components;
}

// Unit sizing based on confidence and edge tiers
function calculateRecommendedUnits(confidence, edge, betType = 'straight') {
  // For parlays, always use small units
  if (betType === 'parlay') {
    return edge >= 8 ? 0.5 : 0.25;
  }
  
  // Straight bet unit sizing based on confidence and edge tiers
  if (confidence >= 65 && edge >= 8) {
    return { units: 1.5, tier: 'premium', reasoning: '65%+ conf, 8%+ edge' };
  } else if (confidence >= 61 && edge >= 5) {
    return { units: 1.0, tier: 'strong', reasoning: '61-64% conf, 5-7% edge' };
  } else if (confidence >= 58 && edge >= 2) {
    return { units: 0.5, tier: 'value', reasoning: '58-60% conf, 2-4% edge' };
  } else {
    return { units: 1.0, tier: 'standard', reasoning: 'flat unit (safe default)' };
  }
}

function generateResponsibleParlays(components) {
  if (components.length < 2) {
    return [{
      type: "insufficient_data",
      legs: [],
      description: "Not enough high-confidence picks for parlay suggestions",
      risk_level: "N/A",
      recommended_unit: 0
    }];
  }
  
  const parlays = [];
  
  // Only use premium picks: ≥60% confidence AND ≥5% edge for parlays
  const premiumComponents = components.filter(c => 
    c.confidence >= 60 && c.ev_score >= 5
  );
  
  if (premiumComponents.length < 2) {
    return [{
      type: "insufficient_premium_data",
      legs: [],
      description: "No premium picks (≥60% conf + ≥5% edge) available for safe parlays",
      risk_level: "N/A",
      recommended_unit: 0,
      note: "Stick to straight bets - parlay conditions not met"
    }];
  }
  
  // Generate ONLY 2-leg combinations from premium components (max 3 parlays)
  const topPremium = premiumComponents.slice(0, Math.min(4, premiumComponents.length));
  for (let i = 0; i < topPremium.length - 1 && parlays.length < 3; i++) {
    for (let j = i + 1; j < topPremium.length && parlays.length < 3; j++) {
      if (topPremium[i].gameId !== topPremium[j].gameId) {
        const avgConf = (topPremium[i].confidence + topPremium[j].confidence) / 2;
        const avgEdge = (topPremium[i].ev_score + topPremium[j].ev_score) / 2;
        
        parlays.push({
          type: "premium_2leg_only",
          legs: [topPremium[i], topPremium[j]],
          avg_confidence: avgConf,
          avg_edge: avgEdge,
          combined_ev: topPremium[i].ev_score + topPremium[j].ev_score,
          risk_level: "MODERATE",
          recommended_unit: avgEdge >= 8 ? 0.5 : 0.25,
          description: `${topPremium[i].description} + ${topPremium[j].description}`,
          note: "Bonus exposure only - built from bets you'd place straight"
        });
      }
    }
  }
  
  // Sort by combined EV and return max 3 parlays
  parlays.sort((a, b) => b.combined_ev - a.combined_ev);
  return parlays.slice(0, 3);
}

// MAIN PREDICTION FUNCTION: v13 Logic + v8 Odds Integration
async function generateAdvancedPredictions(games, season) {
  console.log('=== v13 LOGIC + v8 WORKING ODDS INTEGRATION ===');
  
  let advancedMetrics = null;
  let injuries = null;
  
  try {
    advancedMetrics = await loadAdvancedMetrics(season);
    injuries = await loadInjuries();
    
    // TEMP: Use test data for James Conner injury testing
    if (!injuries.teams || Object.keys(injuries.teams).length === 0) {
      const fs = require('fs');
      const path = require('path');
      const testDataPath = path.join(process.cwd(), 'test-injury-data.json');
      if (fs.existsSync(testDataPath)) {
        injuries = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));
        console.log('Using test injury data with James Conner out');
      }
    }
  } catch (error) {
    console.warn('Enhanced metrics loading failed:', error);
  }

  const validMetrics = validateAdvancedMetrics(advancedMetrics);
  
  if (!validMetrics) {
    return {
      predictions: games.map(game => ({
        ...game,
        predictions: {
          home_win_prob: 0.5, away_win_prob: 0.5,
          moneyline: { pick: null, confidence: 50, edge: 0 },
          spread: { pick: null, confidence: 50, line: null, predicted: null, edge: 0 },
          total: { pick: null, confidence: 50, line: null, predicted: null, edge: 0 }
        },
        modelEnhancements: { version: 'v13_logic_v8_odds_hybrid', notes: ["Metrics unavailable"] }
      })),
      parlaySuggestions: [{
        type: "no_data",
        legs: [],
        description: "No data available for parlay suggestions",
        risk_level: "N/A",
        recommended_unit: 0
      }]
    };
  }

  const league = advancedMetrics?.league || { means: {}, stds: {} };
  const currentWeek = getCurrentWeek(advancedMetrics);
  
  // v8 WORKING ODDS: Load live odds using proven working method
  const allOdds = await loadLiveOdds();

  console.log(`v13 logic + v8 odds: Processing ${games.length} games with working odds integration`);

  const predictions = games.map(game => {
    const homeCode = game.home_team;
    const awayCode = game.away_team;

    console.log(`\n=== HYBRID PREDICTION: ${awayCode} @ ${homeCode} ===`);

    const homeMetrics = getTeamMetrics(advancedMetrics, homeCode);
    const awayMetrics = getTeamMetrics(advancedMetrics, awayCode);
    const contextWeights = calculateContextAwareWeights(currentWeek, homeMetrics, awayMetrics);
    const matchups = calculateMatchups(homeMetrics, awayMetrics, league);

    // v13 LOGIC: Enhanced team scoring with all fixes
    let homeScoreData = scoreTeamFromFeatures(homeMetrics, league, contextWeights, matchups?.home, true, currentWeek, awayMetrics, homeCode);
    let awayScoreData = scoreTeamFromFeatures(awayMetrics, league, contextWeights, matchups?.away, false, currentWeek, homeMetrics, awayCode);

    if (injuries) {
      homeScoreData = applyInjuryAdjustments(homeScoreData, homeCode, injuries);
      awayScoreData = applyInjuryAdjustments(awayScoreData, awayCode, injuries);
    }

    const scoreDifference = homeScoreData.score - awayScoreData.score;
    
    // v13 LOGIC: Fixed spread calculation
    const predictedSpread = calculateSpreadPrediction(homeScoreData, awayScoreData, homeCode, awayCode);
    const homeWinProb = sigmoid(predictedSpread / 14);
    const awayWinProb = 1 - homeWinProb;

    // v8 WORKING ODDS: Use proven working odds integration
    const gameOdds = findGameOdds(allOdds, homeCode, awayCode);
    const realOdds = gameOdds ? extractOddsData(gameOdds) : {};
    const hasLiveOdds = gameOdds && realOdds.ml_home && realOdds.ml_away;
    
    console.log(`Live odds found: ${hasLiveOdds}, Spread: ${realOdds.spread_line}, Total: ${realOdds.total_line}`);
    
    // PHASE 4 ENHANCEMENT: Sophisticated variance modeling
    const enhancedVarianceData = calculateEnhancedVariance(homeMetrics, awayMetrics);
    const enhancedVariance = enhancedVarianceData.total || enhancedVarianceData; // Handle both old and new format
    const isHighVariance = enhancedVarianceData.isHighVariance || enhancedVariance > 10.0;
    const marginTooClose = Math.abs(predictedSpread) < 2.5;
    
    const gameContext = {
      week: currentWeek,
      divisional: isDivisionalGame(homeCode, awayCode),
      majorInjuries: (injuries?.teams?.[homeCode]?.qb_status === 'out') || (injuries?.teams?.[awayCode]?.qb_status === 'out'),
      // Enhanced context for no-bet logic
      highVariance: isHighVariance,
      marginTooClose: marginTooClose,
      enhancedVariance: enhancedVariance,
      varianceBreakdown: enhancedVarianceData.breakdown || null
    };
    
    // PHASE 2 ENHANCEMENT: Check for no-bet scenarios with true edge calculation
    const predictionData = { homeWinProb, awayWinProb };
    const skipCheck = shouldSkipBet(predictionData, gameContext, realOdds);
    
    const mlPick = homeWinProb > awayWinProb ? homeCode : awayCode;
    const mlModelProb = Math.max(homeWinProb, awayWinProb);
    
    const homeMarketProb = americanToImplied(realOdds.ml_home) || 0.5;
    const awayMarketProb = americanToImplied(realOdds.ml_away) || 0.5;
    const mlMarketProb = mlPick === homeCode ? homeMarketProb : awayMarketProb;
    const rawMLEdge = mlMarketProb && hasLiveOdds ? mlModelProb - mlMarketProb : 0;
    const mlEdge = Math.abs(rawMLEdge); // Always show positive edge for display
    
    const avgConfidence = (homeScoreData.confidence + awayScoreData.confidence) / 2;
    const avgEvidence = (homeScoreData.evidenceStrength + awayScoreData.evidenceStrength) / 2;
    
    // PHASE 3 ENHANCEMENT: Apply public bias detection
    const publicBiasAdjustment = detectPublicBias(mlPick, realOdds.spread_line, predictedSpread);
    const baseMLConfidence = calculateConfidence(mlModelProb, mlMarketProb, mlEdge, avgConfidence, avgEvidence, scoreDifference, 'moneyline', gameContext);
    const mlConfidence = Math.round(baseMLConfidence * publicBiasAdjustment); // Always show actual confidence
    
    // Add moneyline skip check
    const mlSkipCheck = shouldSkipMoneylineBet(mlPick, gameContext, realOdds, mlConfidence, rawMLEdge * 100);

    // Spread predictions with live odds integration
    const marketSpread = hasLiveOdds ? (realOdds.spread_line || 0) : 0;
    const marketFavorite = realOdds.spread_favorite;
    
    const modelHomeMargin = predictedSpread;
    let marketHomeMargin = 0;
    if (hasLiveOdds && marketSpread !== 0) {
      marketHomeMargin = marketFavorite === 'home' ? Math.abs(marketSpread) : -Math.abs(marketSpread);
    }
    
    const marginDifference = modelHomeMargin - marketHomeMargin;
    const spreadThreshold = hasLiveOdds ? 2.5 : 1.0;
    
    let spreadPick;
    let displayedSpread;
    
    if (!hasLiveOdds) {
      if (modelHomeMargin > 1.5) {
        spreadPick = homeCode;
      } else if (modelHomeMargin < -1.5) {
        spreadPick = awayCode;
      } else {
        spreadPick = 'push';
      }
      displayedSpread = Math.abs(modelHomeMargin);
    } else {
      if (Math.abs(marginDifference) < spreadThreshold) {
        spreadPick = 'push';
      } else if (marginDifference > spreadThreshold) {
        spreadPick = homeCode;
      } else {
        spreadPick = awayCode;
      }
      displayedSpread = Math.abs(marketSpread);
    }
    
    const spreadEdge = Math.abs(marginDifference);
    
    const baseSpreadConfidence = calculateConfidence(0.6, 0.52, spreadEdge / 14, avgConfidence, avgEvidence, scoreDifference, 'spread', gameContext);
    const spreadConfidence = baseSpreadConfidence; // Always show actual confidence
    
    // Use spread-specific skip check that detects pushes AND checks confidence/edge thresholds
    const spreadSkipCheck = shouldSkipSpreadBet(spreadPick, marginDifference, gameContext, realOdds, spreadConfidence, spreadEdge);

    const predictedTotal = calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread, homeScoreData.specialTeams, awayScoreData.specialTeams);
    const marketTotal = hasLiveOdds ? (realOdds.total_line || 44) : 44;
    
    const totalDifference = predictedTotal - marketTotal;
    const totalPick = predictedTotal > marketTotal ? 'over' : 'under';
    const totalEdge = Math.abs(totalDifference);
    const totalConfidence = calculateConfidence(0.6, 0.52, totalEdge / 10, avgConfidence, avgEvidence, 0, 'total', gameContext);
    
    // Use proper totals skip check with confidence and edge thresholds
    const totalSkipCheck = shouldSkipTotalBet(totalPick, totalDifference, gameContext, realOdds, totalConfidence, totalEdge);

    return {
      ...game,
      predictions: {
        home_win_prob: Number(homeWinProb.toFixed(3)),
        away_win_prob: Number(awayWinProb.toFixed(3)),
        moneyline: { 
          pick: mlPick,  // Always show the pick
          confidence: mlConfidence,  // Always show confidence
          edge: Number((mlEdge * 100).toFixed(1)),  // Always show edge
          bet: !mlSkipCheck.skip,  // True = BET, False = NO BET
          betRecommendation: mlSkipCheck.skip ? "NO BET" : "BET",
          skipReason: mlSkipCheck.reason || null,
          displayNote: mlSkipCheck.skip ? "NO BET" : "BET"
        },
        spread: { 
          pick: spreadPick,  // Always show the pick
          confidence: spreadConfidence,  // Always show confidence
          line: hasLiveOdds ? marketSpread : Number(displayedSpread.toFixed(1)),
          predicted: Number(Math.abs(predictedSpread).toFixed(1)),
          edge: Number(spreadEdge.toFixed(1)),  // Always show edge
          model_home_margin: Number(modelHomeMargin.toFixed(1)),
          bet: !spreadSkipCheck.skip,  // Use spread-specific skip check
          betRecommendation: spreadSkipCheck.skip ? "NO BET" : "BET",
          skipReason: spreadSkipCheck.reason || null,
          displayNote: spreadSkipCheck.skip ? "NO BET" : "BET"
        },
        total: { 
          pick: totalPick, 
          confidence: totalConfidence, 
          line: marketTotal, 
          predicted: Number(predictedTotal.toFixed(1)), 
          edge: Number(totalEdge.toFixed(1)),
          bet: !totalSkipCheck.skip,  // True = BET, False = NO BET
          betRecommendation: totalSkipCheck.skip ? "NO BET" : "BET",
          skipReason: totalSkipCheck.reason || null,
          displayNote: totalSkipCheck.skip ? "NO BET" : "BET"
        }
      },
      
      odds: {
        moneyline: { 
          home: realOdds.ml_home, 
          away: realOdds.ml_away
        },
        spread: { 
          line: realOdds.spread_line, 
          favorite: realOdds.spread_favorite
        },
        total: { line: realOdds.total_line },
        live_odds_available: hasLiveOdds
      },
      
      modelEnhancements: {
        version: 'v13_logic_v8_odds_enhanced_epa',
        fixesApplied: [
          "v13: Deterministic special teams (no Math.random)",
          "v13: Reduced multipliers (CORE_EPA 30→24, TIER_BASE 10→8)",
          "v13: Z-score clipping (±2.5 max)",
          "v13: NaN shield for league stats",
          "v13: Fixed spread calculation logic",
          "v13: No input mutation (pure functions)",
          "v8: Working odds data extraction",
          "v8: Proven team name mapping",
          "v8: Functional live odds integration",
          "ENHANCED: 55-65% confidence band calibration fix",
          "ENHANCED: True edge calculation with vig removal",
          "ENHANCED: No-bet logic for insufficient edges",
          "ENHANCED: Public team bias detection",
          "ENHANCED: Sophisticated variance modeling"
        ],
        enhancedFeatures: {
          calibrationFix: "Applied to confidence band 55-65%",
          noBetLogic: skipCheck.skip ? skipCheck.reason : "Sufficient edge",
          publicBias: publicBiasAdjustment < 1.0 ? "Detected" : "None",
          varianceLevel: isHighVariance ? "High" : "Normal",
          enhancedVariance: enhancedVariance.toFixed(3)
        },
        diagnostics: {
          homeScore: homeScoreData.score.toFixed(2),
          awayScore: awayScoreData.score.toFixed(2),
          scoreDiff: scoreDifference.toFixed(2),
          marginDiff: marginDifference.toFixed(2),
          spreadPick: spreadPick,
          liveOddsWorking: hasLiveOdds
        }
      },
      
      teamStats: {
        home: {
          strength: Number(homeWinProb.toFixed(3)),
          score: Number(homeScoreData.score.toFixed(2)),
          confidence: Number(homeScoreData.confidence.toFixed(3)),
          specialTeamsValue: homeScoreData.specialTeams?.total_st_value || 0
        },
        away: {
          strength: Number(awayWinProb.toFixed(3)),
          score: Number(awayScoreData.score.toFixed(2)),
          confidence: Number(awayScoreData.confidence.toFixed(3)),
          specialTeamsValue: awayScoreData.specialTeams?.total_st_value || 0
        }
      }
    };
  });

  const parlayComponents = generateParlayComponents(games, predictions);
  const parlaySuggestions = generateResponsibleParlays(parlayComponents);
  
  console.log(`Generated ${parlaySuggestions.length} parlay suggestions from ${parlayComponents.length} qualifying components`);

  return {
    predictions: predictions,
    parlaySuggestions: parlaySuggestions,
    parlayMetadata: {
      totalComponents: parlayComponents.length,
      averageConfidence: parlayComponents.length > 0 ? 
        parlayComponents.reduce((sum, c) => sum + c.confidence, 0) / parlayComponents.length : 0,
      responsibleGambling: {
        maxRecommendedUnit: Math.max(...parlaySuggestions.map(p => p.recommended_unit || 0)),
        riskWarning: "Parlays have exponentially higher risk. Only bet what you can afford to lose.",
        bankrollManagement: "Never exceed 5% of total bankroll on parlays combined."
      }
    }
  };
}

export default async (request, context) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    let games = [];
    let season = '2025';
    
    if (request.method === 'POST') {
      const body = await request.json();
      games = body.games || [];
      season = body.season || '2025';
    } else if (request.method === 'GET') {
      const url = new URL(request.url);
      season = url.searchParams.get('season') || '2025';
      games = [];
    }

    const result = await generateAdvancedPredictions(games, season);
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Hybrid v13+v8 prediction error:', error);
    
    return new Response(JSON.stringify({
      error: 'Hybrid prediction generation failed',
      message: error.message
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
