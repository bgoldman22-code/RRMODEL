// netlify/functions/nfl-predictions-generate/index.mjs
// v13 LOGIC + v8 WORKING ODDS: Enhanced EPA System with Sophisticated Fixes - DEPLOYED
// v4.1 PRODUCTION SAFEGUARDS: GPT-recommended safety rails integrated

import { loadAdvancedMetrics, loadInjuries, validateAdvancedMetrics, getTeamMetrics, getCurrentWeek, getCurrentWeights, diagnoseMetricsData } from '../_lib/blobs-nfl.js';
import { calculateMatchups, calculateExpectedPlays, calculateMatchupScore } from '../_lib/matchups.js';
import { updateInjuryDurations, initializeInjuryDurationTracking } from '../_lib/injury-duration-tracker.js';
// Canonical Availability v5: Single source of truth for player availability
import { buildCanonicalAvailability, applyPositionCaps } from '../_lib/canonical-availability-v5.mjs';
// Kelly Hybrid Staking: Explicit staking system
import { recommendUnits } from '../_lib/kelly-hybrid-staking.mjs';

// v4.1 PRODUCTION SAFEGUARDS: Import new safety systems
import { 
  loadCalibrationMapping, 
  applyCalibratedProbability, 
  applyMarketAnchoring, 
  applyProductionSafetyLimits,
  PRODUCTION_LIMITS 
} from '../_lib/calibration-v4.mjs';

import { 
  applyDepthChartSafeguards, 
  validateDepthChartConsistency,
  DEPTH_SAFEGUARDS 
} from '../_lib/depth-chart-safeguards-v4.mjs';

import { 
  filterSituationalEPA, 
  calculateSituationalBaseline,
  detectDataQualityIssues,
  SITUATIONAL_THRESHOLDS 
} from '../_lib/situational-epa-filters-v4.mjs';

// v4.1 PRODUCTION SAFEGUARDS: Helper function for EPA filtering
function applySituationalEPAFilters(homeMetrics, awayMetrics, game) {
  const results = { home: null, away: null };
  
  if (homeMetrics?.epa_data) {
    const homeFiltered = filterSituationalEPA(homeMetrics.epa_data);
    results.home = {
      filteredData: homeFiltered.filteredData,
      filterStats: homeFiltered.filterStats,
      dataQualityIssues: detectDataQualityIssues(homeMetrics.epa_data)
    };
    console.log(`📈 Home EPA filtering: ${homeFiltered.filterStats.filterRate.toFixed(1)}% filtered`);
  }
  
  if (awayMetrics?.epa_data) {
    const awayFiltered = filterSituationalEPA(awayMetrics.epa_data);
    results.away = {
      filteredData: awayFiltered.filteredData,
      filterStats: awayFiltered.filterStats,
      dataQualityIssues: detectDataQualityIssues(awayMetrics.epa_data)
    };
    console.log(`📈 Away EPA filtering: ${awayFiltered.filterStats.filterRate.toFixed(1)}% filtered`);
  }
  
  return results;
}

// PHASE 1: Enhanced EPA Features - Simplified Calibration Fix
function applyCalibrationFix(confidencePercentage, recentResults = []) {
  // Convert percentage to probability foWr internal calculations
  const rawProb = confidencePercentage / 100.0;
  
  // Platt scaling on last 8 weeks only (if sufficient data available)
  if (recentResults.length >= 20) {
    const calibratedProb = plattCalibration(rawProb, recentResults.slice(-20));
    return Math.round(calibratedProb * 100);
  }
  
  // Light conservative adjustment for very high confidence (>80%) only
  if (confidencePercentage > 80) {
    const conservativeAdjustment = (confidencePercentage - 80) * 0.05;
    return Math.round(Math.max(40, Math.min(95, confidencePercentage - conservativeAdjustment)));
  }
  
  // Return raw confidence with reasonable bounds (preserve signal separation)
  return Math.round(Math.max(25, Math.min(95, confidencePercentage)));
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
    return Math.max(0.25, Math.min(0.95, calibrated)); // Looser bounds to preserve signal
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
function shouldSkipMoneylineBet(mlPick, gameContext = {}, marketOdds = null, confidence = null, edge = null, winProbability = null) {
  // PRIMARY RULE: Bet if model win probability ≥ 58% OR vig-free edge ≥ 2%
  
  if (winProbability !== null && winProbability >= 58) {
    return { skip: false, reason: `model_confidence_${winProbability}%` };
  }
  
  if (edge !== null && Math.abs(edge) >= 2.0) {
    return { skip: false, reason: `edge_${Math.abs(edge).toFixed(1)}%` };
  }
  
  // Skip extreme dogs unless edge ≥ 5%
  if (winProbability !== null && winProbability < 35 && (edge === null || Math.abs(edge) < 5.0)) {
    return { skip: true, reason: `extreme_dog_${winProbability}%_insufficient_edge` };
  }
  
  // Skip if neither condition met
  const reason = winProbability < 58 ? `confidence_${winProbability}%<58%` : `edge_${Math.abs(edge || 0).toFixed(1)}%<2%`;
  return { skip: true, reason: reason };
}

// Total bet skip logic 
function shouldSkipTotalBet(totalPick, totalDiff, gameContext = {}, marketOdds = null, confidence = null, edge = null) {
  // PRIMARY RULE: Bet if model total vs line differs by ≥ 3 points
  const pointDiff = Math.abs(totalDiff);
  
  if (pointDiff < 3.0) {
    return { skip: true, reason: `total_diff_${pointDiff.toFixed(1)}pts<3.0pts` };
  }
  
  // Scale confidence by point differential:
  // 3-4 pts → 56-59%, 4-6 pts → 60-63%, 6+ pts → 64%+
  let scaledConfidence;
  if (pointDiff >= 6.0) {
    scaledConfidence = Math.min(64 + (pointDiff - 6.0) * 2, 72);
  } else if (pointDiff >= 4.0) {
    scaledConfidence = 60 + ((pointDiff - 4.0) / 2.0) * 3; // 60-63%
  } else {
    scaledConfidence = 56 + ((pointDiff - 3.0) / 1.0) * 3; // 56-59%
  }
  
  return { skip: false, reason: `total_diff_${pointDiff.toFixed(1)}pts_conf_${Math.round(scaledConfidence)}%` };
}

// Push detection logic for spread bets
function shouldSkipSpreadBet(spreadPick, marginDiff, gameContext = {}, marketOdds = null, confidence = null, edge = null) {
  // Push predictions should always be no-bet
  if (spreadPick === 'push' || Math.abs(marginDiff) < 0.5) {
    return { skip: true, reason: "push_prediction" };
  }
  
  // PRIMARY RULE: Bet if model margin vs line differs by ≥ 2.5 points
  const pointDiff = Math.abs(marginDiff);
  
  if (pointDiff < 2.5) {
    return { skip: true, reason: `margin_diff_${pointDiff.toFixed(1)}pts<2.5pts` };
  }
  
  // Scale confidence by point differential:
  // 2.5-4.0 pts → 58-61%, 4.0-6.0 pts → 62-65%, 6.0+ pts → 66%+
  let scaledConfidence;
  if (pointDiff >= 6.0) {
    scaledConfidence = Math.min(66 + (pointDiff - 6.0) * 2, 75);
  } else if (pointDiff >= 4.0) {
    scaledConfidence = 62 + ((pointDiff - 4.0) / 2.0) * 3; // 62-65%
  } else {
    scaledConfidence = 58 + ((pointDiff - 2.5) / 1.5) * 3; // 58-61%
  }
  
  return { skip: false, reason: `spread_diff_${pointDiff.toFixed(1)}pts_conf_${Math.round(scaledConfidence)}%` };
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

// Helper to get team abbreviation from full name (for schedule parsing)
function getTeamAbbreviation(fullName) {
  if (!fullName) return '';
  
  // If it's already an abbreviation, return it
  if (Object.keys(TEAM_NAME_MAPPING).includes(fullName)) return fullName;
  
  // Find abbreviation by full name
  for (const [abbr, name] of Object.entries(TEAM_NAME_MAPPING)) {
    if (name === fullName) return abbr;
  }
  
  // Fallback for common variations
  const nameMap = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
    // Handle LA abbreviation issues
    "LA": "LAR", "LAR": "LAR", "LAC": "LAC"
  };
  
  return nameMap[fullName] || fullName;
}

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
    'Jayden Daniels': [0.26, 0.04, 1.0], // Strong rookie season, big dropoff to Mariota
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
  'WAS': { RB: 0.6, WR: 0.75, TE: 0.6, QB: 0.95 }, // Jayden Daniels rookie system dependent
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

function applyInjuryAdjustments(scoreData, teamCode, injuries, weekNumber = 1) {
  const teamInjuries = injuries.teams?.[teamCode] || {};
  let totalDelta = 0;
  const injuryAnalysis = {
    adjustments: [],
    totalImpact: 0,
    confidence: 1.0
  };
  
  // ==================================================
  // CANONICAL AVAILABILITY V5 INTEGRATION
  // ==================================================
  console.log(`📋 Building canonical availability for ${teamCode}, Week ${weekNumber}...`);
  
  const now = Date.now();
  const allPlayers = [];
  
  // Process QB
  if (teamInjuries.qb_name && teamInjuries.qb_status) {
    const qbSources = [{
      type: 'INJURY_REPORT',
      gameStatus: teamInjuries.qb_status,
      injuryStatus: teamInjuries.qb_status,
      isStarter: true,
      depthPosition: 1,
      timestamp: now
    }];
    
    const qbAvail = buildCanonicalAvailability(
      `${teamCode}_QB_${teamInjuries.qb_name}`,
      teamInjuries.qb_name,
      teamCode,
      'QB',
      weekNumber,
      qbSources,
      now
    );
    
    const qbImpact = qbAvail.calculateImpact();
    if (Math.abs(qbImpact.spreadImpact) > 0.01) {
      allPlayers.push({
        name: teamInjuries.qb_name,
        position: 'QB',
        status: teamInjuries.qb_status,
        impact: qbImpact.spreadImpact,
        confidence: qbImpact.confidence,
        availability: qbAvail
      });
      totalDelta += qbImpact.spreadImpact;
    }
  }
  
  // Process skill positions (RB, WR, TE)
  const skillPositions = ['RB', 'WR', 'TE'];
  skillPositions.forEach(position => {
    const positionInjuries = teamInjuries[`${position.toLowerCase()}_injuries`] || [];
    
    positionInjuries.forEach(injury => {
      const playerName = injury.name || injury.player || 'Unknown';
      const status = injury.status || 'active';
      const depthPosition = injury.depth || 1;
      
      // Skip healthy players beyond depth 2
      if (status === 'active' && depthPosition > 2) return;
      
      const sources = [{
        type: 'INJURY_REPORT',
        gameStatus: status,
        injuryStatus: status,
        isStarter: depthPosition === 1,
        depthPosition: depthPosition,
        timestamp: now
      }];
      
      const avail = buildCanonicalAvailability(
        `${teamCode}_${position}_${playerName}`,
        playerName,
        teamCode,
        position,
        weekNumber,
        sources,
        now
      );
      
      const impact = avail.calculateImpact();
      if (Math.abs(impact.spreadImpact) > 0.01) {
        allPlayers.push({
          name: playerName,
          position: position,
          status: status,
          depth: depthPosition,
          impact: impact.spreadImpact,
          confidence: impact.confidence,
          availability: avail
        });
        totalDelta += impact.spreadImpact;
      }
    });
  });

  // Apply position caps with budget reallocation
  const teamAdjustments = {
    week: weekNumber,
    players: new Map(allPlayers.map(p => [p.name, p.availability])),
    positionSummaries: {},
    teamSummary: { totalImpact: totalDelta }
  };
  
  const cappedAdjustments = applyPositionCaps(teamAdjustments);
  totalDelta = cappedAdjustments.teamSummary.totalImpact;
  
  // Build injuryAnalysis from canonical availability
  allPlayers.forEach(player => {
    injuryAnalysis.adjustments.push({
      name: player.name,
      position: player.position,
      status: player.status,
      depth: player.depth,
      impact: player.impact,
      confidence: player.confidence,
      reason: 'Canonical availability v5 (field-level precedence)'
    });
  });
  
  // Traditional positional injuries (O-line, Defense, Special Teams) - fallback to simple calc
  const olOut = teamInjuries.ol_starters_out ?? 0;
  const dbOut = teamInjuries.db_starters_out ?? 0;
  if (olOut >= 2) {
    const olImpact = -2;
    totalDelta += olImpact;
    injuryAnalysis.adjustments.push({
      position: 'OL',
      impact: olImpact,
      reason: `${olOut} offensive line starters out`
    });
  }
  if (olOut >= 3) {
    const olImpact = -2; // Additional -2 for 3+ out (cumulative -4 total)
    totalDelta += olImpact;
    injuryAnalysis.adjustments.push({
      position: 'OL',
      impact: olImpact,
      reason: `${olOut} offensive line starters out (additional penalty)`
    });
  }
  if (dbOut >= 2) {
    const dbImpact = -1.5;
    totalDelta += dbImpact;
    injuryAnalysis.adjustments.push({
      position: 'DB',
      impact: dbImpact,
      reason: `${dbOut} defensive backs out`
    });
  }

  if (teamInjuries.kicker_status === 'out') {
    const kImpact = -1.5;
    totalDelta += kImpact;
    injuryAnalysis.adjustments.push({
      position: 'K',
      impact: kImpact,
      reason: 'Kicker out'
    });
  }
  if (teamInjuries.punter_status === 'out') {
    const pImpact = -1.0;
    totalDelta += pImpact;
    injuryAnalysis.adjustments.push({
      position: 'P',
      impact: pImpact,
      reason: 'Punter out'
    });
  }
  if (teamInjuries.returner_status === 'out') {
    const krImpact = -0.5;
    totalDelta += krImpact;
    injuryAnalysis.adjustments.push({
      position: 'KR/PR',
      impact: krImpact,
      reason: 'Return specialist out'
    });
  }

  // Calculate confidence from canonical availability (use min confidence from all players)
  const minConfidence = allPlayers.length > 0 
    ? Math.min(...allPlayers.map(p => p.confidence))
    : 1.0;
  
  injuryAnalysis.totalImpact = totalDelta;
  injuryAnalysis.confidence = minConfidence;
  
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

// Book priority for display consistency  
const BOOK_PRIORITY = ['FanDuel', 'DraftKings', 'BetMGM', 'Caesars', 'ESPNBet', 'Fanatics'];

// NEW: Extract structured odds with display vs best separation
function extractStructuredOdds(gameOdds, modelPicks) {
  if (!gameOdds) return { display: null, best: {}, all_books: {} };
  
  const bookmakers = gameOdds.bookmakers || [];
  if (bookmakers.length === 0) return { display: null, best: {}, all_books: {} };
  
  const timestamp = new Date().toISOString();
  const all_books = {};
  
  // Extract all bookmaker data
  bookmakers.forEach(book => {
    const bookName = book.title;
    const bookData = { bookmaker: bookName };
    
    if (book.markets) {
      // Extract H2H (moneyline)
      const h2hMarket = book.markets.find(m => m.key === 'h2h');
      if (h2hMarket) {
        const homeOutcome = h2hMarket.outcomes.find(o => o.name === gameOdds.home_team);
        const awayOutcome = h2hMarket.outcomes.find(o => o.name === gameOdds.away_team);
        bookData.h2h = {
          home: homeOutcome?.price || null,
          away: awayOutcome?.price || null,
          ts: timestamp
        };
      }
      
      // Extract spreads
      const spreadMarket = book.markets.find(m => m.key === 'spreads');
      if (spreadMarket) {
        const homeOutcome = spreadMarket.outcomes.find(o => o.name === gameOdds.home_team);
        const awayOutcome = spreadMarket.outcomes.find(o => o.name === gameOdds.away_team);
        bookData.spread = {
          home_line: homeOutcome?.point || 0,
          home_price: homeOutcome?.price || -110,
          away_line: awayOutcome?.point || 0,
          away_price: awayOutcome?.price || -110,
          ts: timestamp
        };
      }
      
      // Extract totals
      const totalMarket = book.markets.find(m => m.key === 'totals');
      if (totalMarket) {
        const overOutcome = totalMarket.outcomes.find(o => o.name === 'Over');
        const underOutcome = totalMarket.outcomes.find(o => o.name === 'Under');
        bookData.total = {
          over: { line: overOutcome?.point || 0, price: overOutcome?.price || -110 },
          under: { line: underOutcome?.point || 0, price: underOutcome?.price || -110 },
          ts: timestamp
        };
      }
    }
    
    all_books[bookName] = bookData;
  });
  
  // Select display book (consistent UI)
  let displayBook = null;
  for (const priorityBook of BOOK_PRIORITY) {
    if (all_books[priorityBook]) {
      displayBook = all_books[priorityBook];
      break;
    }
  }
  
  // Fallback to first available book
  if (!displayBook && Object.keys(all_books).length > 0) {
    displayBook = Object.values(all_books)[0];
  }
  
  // Find best book for each market based on model picks
  const best = {};
  
  // Best moneyline book
  if (modelPicks.mlPick && modelPicks.mlPick !== 'push') {
    const isHomePick = modelPicks.mlPick === 'home';
    let bestMLBook = null;
    let bestMLPrice = isHomePick ? -1000 : 0; // Worst possible starting point
    
    Object.entries(all_books).forEach(([bookName, book]) => {
      if (book.h2h) {
        const priceForPick = isHomePick ? book.h2h.home : book.h2h.away;
        if (priceForPick !== null) {
          const isBetter = isHomePick ? 
            (priceForPick > bestMLPrice) : // For favorites, higher (less negative) is better
            (priceForPick > bestMLPrice);   // For underdogs, higher (more positive) is better
          
          if (isBetter) {
            bestMLPrice = priceForPick;
            bestMLBook = bookName;
          }
        }
      }
    });
    
    if (bestMLBook) {
      best.h2h = {
        bookmaker: bestMLBook,
        pick_side: isHomePick ? 'home' : 'away',
        price: bestMLPrice,
        ts: timestamp
      };
    }
  }
  
  // Best spread book
  if (modelPicks.spreadPick && modelPicks.spreadPick !== 'push') {
    const teamPick = modelPicks.spreadPick; // Team abbreviation
    const isHomePick = teamPick === gameOdds.home_team;
    let bestSpreadBook = null;
    let bestSpreadLine = isHomePick ? -50 : 50; // Worst possible starting point
    let bestSpreadPrice = -200;
    
    Object.entries(all_books).forEach(([bookName, book]) => {
      if (book.spread) {
        const lineForPick = isHomePick ? book.spread.home_line : book.spread.away_line;
        const priceForPick = isHomePick ? book.spread.home_price : book.spread.away_price;
        
        if (lineForPick !== null) {
          // More favorable line logic: if backing favorite, want smaller spread; if backing dog, want bigger spread
          const lineIsBetter = lineForPick > bestSpreadLine; // This works for both cases
          const lineIsSame = Math.abs(lineForPick - bestSpreadLine) < 0.1;
          const priceIsBetter = priceForPick > bestSpreadPrice;
          
          if (lineIsBetter || (lineIsSame && priceIsBetter)) {
            bestSpreadLine = lineForPick;
            bestSpreadPrice = priceForPick;
            bestSpreadBook = bookName;
          }
        }
      }
    });
    
    if (bestSpreadBook) {
      best.spread = {
        bookmaker: bestSpreadBook,
        pick_side: isHomePick ? 'home' : 'away',
        line: bestSpreadLine,
        price: bestSpreadPrice,
        ts: timestamp
      };
    }
  }
  
  // Best total book
  if (modelPicks.totalPick && modelPicks.totalPick !== 'push') {
    const isOverPick = modelPicks.totalPick === 'over';
    let bestTotalBook = null;
    let bestTotalLine = isOverPick ? 100 : 0; // Worst possible starting point
    let bestTotalPrice = -200;
    
    Object.entries(all_books).forEach(([bookName, book]) => {
      if (book.total) {
        const targetOutcome = isOverPick ? book.total.over : book.total.under;
        if (targetOutcome.line !== null) {
          // For Over: want lowest line; For Under: want highest line
          const lineIsBetter = isOverPick ? 
            (targetOutcome.line < bestTotalLine) :
            (targetOutcome.line > bestTotalLine);
          const lineIsSame = Math.abs(targetOutcome.line - bestTotalLine) < 0.1;
          const priceIsBetter = targetOutcome.price > bestTotalPrice;
          
          if (lineIsBetter || (lineIsSame && priceIsBetter)) {
            bestTotalLine = targetOutcome.line;
            bestTotalPrice = targetOutcome.price;
            bestTotalBook = bookName;
          }
        }
      }
    });
    
    if (bestTotalBook) {
      best.total = {
        bookmaker: bestTotalBook,
        pick_side: isOverPick ? 'over' : 'under',
        line: bestTotalLine,
        price: bestTotalPrice,
        ts: timestamp
      };
    }
  }
  
  return {
    source_snapshot_at: timestamp,
    display: displayBook,
    best: best,
    all_books: all_books
  };
}

// LEGACY: Keep old function for backwards compatibility during transition
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
      const availabilityData = {
        totalImpact: (pred.modelEnhancements?.injuryAnalysis?.home?.totalImpact || 0) + 
                     (pred.modelEnhancements?.injuryAnalysis?.away?.totalImpact || 0),
        minConfidence: Math.min(
          pred.modelEnhancements?.injuryAnalysis?.home?.confidence || 1.0,
          pred.modelEnhancements?.injuryAnalysis?.away?.confidence || 1.0
        )
      };
      const unitInfo = calculateRecommendedUnits(mlPick.confidence, mlPick.edge, 'straight', availabilityData);
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
      const availabilityData = {
        totalImpact: (pred.modelEnhancements?.injuryAnalysis?.home?.totalImpact || 0) + 
                     (pred.modelEnhancements?.injuryAnalysis?.away?.totalImpact || 0),
        minConfidence: Math.min(
          pred.modelEnhancements?.injuryAnalysis?.home?.confidence || 1.0,
          pred.modelEnhancements?.injuryAnalysis?.away?.confidence || 1.0
        )
      };
      const unitInfo = calculateRecommendedUnits(spreadPick.confidence, spreadPick.edge, 'straight', availabilityData);
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
      const availabilityData = {
        totalImpact: (pred.modelEnhancements?.injuryAnalysis?.home?.totalImpact || 0) + 
                     (pred.modelEnhancements?.injuryAnalysis?.away?.totalImpact || 0),
        minConfidence: Math.min(
          pred.modelEnhancements?.injuryAnalysis?.home?.confidence || 1.0,
          pred.modelEnhancements?.injuryAnalysis?.away?.confidence || 1.0
        )
      };
      const unitInfo = calculateRecommendedUnits(totalPick.confidence, totalPick.edge, 'straight', availabilityData);
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

// Kelly Hybrid Staking Integration
function calculateRecommendedUnits(confidence, edge, betType = 'straight', availabilityData = null) {
  // For parlays, always use small units
  if (betType === 'parlay') {
    return edge >= 8 ? 0.5 : 0.25;
  }
  
  // Build signals for Kelly from availability data
  const signals = {
    edgePct: edge,
    clvPts: 0, // TODO: Add CLV tracking
    lineMoveToward: 0, // TODO: Add line movement tracking
    ticketsPct: 50, // TODO: Add public betting data
    handlePct: 50,
    availabilityConf: availabilityData?.minConfidence || 0.85,
    marketShockActive: false,
    injurySwingPts: Math.abs(availabilityData?.totalImpact || 0),
    injuryConfirmedHours: 24,
    modelCalibration: 0.85, // TODO: Track model calibration
    backtestRoi: 0, // TODO: Track backtest ROI
    primetimeGame: false
  };
  
  try {
    // Convert confidence % to probability
    const edgeProb = confidence / 100;
    // Assume -110 odds (1.909 decimal)
    const priceDec = 1.909;
    
    const kellyResult = recommendUnits(edgeProb, priceDec, signals, 10);
    
    console.log(`📊 Kelly recommendation: ${kellyResult.units}U (${kellyResult.recommendation})`);
    
    return {
      units: kellyResult.units,
      tier: kellyResult.recommendation,
      reasoning: kellyResult.reason || 'Kelly hybrid staking',
      kellyAudit: kellyResult.audit
    };
  } catch (error) {
    console.error('⚠️ Kelly error, using fallback:', error.message);
    // Fallback to simple thresholds
    if (confidence >= 65 && edge >= 8) {
      return { units: 1.5, tier: 'premium', reasoning: '65%+ conf, 8%+ edge (fallback)' };
    } else if (confidence >= 61 && edge >= 5) {
      return { units: 1.0, tier: 'strong', reasoning: '61-64% conf, 5-7% edge (fallback)' };
    } else if (confidence >= 58 && edge >= 2) {
      return { units: 0.5, tier: 'value', reasoning: '58-60% conf, 2-4% edge (fallback)' };
    } else {
      return { units: 1.0, tier: 'standard', reasoning: 'flat unit (fallback)' };
    }
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
  
  // FIRST: Generate 2 x 2-leg parlays (fixed)
  const topPremium = premiumComponents.slice(0, Math.min(6, premiumComponents.length));
  for (let i = 0; i < topPremium.length - 1 && parlays.length < 2; i++) {
    for (let j = i + 1; j < topPremium.length && parlays.length < 2; j++) {
      if (topPremium[i].gameId !== topPremium[j].gameId) {
        const avgConf = (topPremium[i].confidence + topPremium[j].confidence) / 2;
        const avgEdge = (topPremium[i].ev_score + topPremium[j].ev_score) / 2;
        
        parlays.push({
          type: "premium_2leg",
          legs: [topPremium[i], topPremium[j]],
          avg_confidence: avgConf,
          avg_edge: avgEdge,
          combined_ev: topPremium[i].ev_score + topPremium[j].ev_score,
          risk_level: "MODERATE",
          recommended_unit: avgEdge >= 8 ? 0.5 : 0.25,
          description: `${topPremium[i].description} + ${topPremium[j].description}`,
          note: "2-leg parlay (mix of ML/spread/total)"
        });
      }
    }
  }
  
  // SECOND: Generate 3 x smart logic parlays (variable legs)
  if (premiumComponents.length >= 3) {
    let smartParlayCount = 0;
    
    // 3-leg parlay if we have 4-6 premium picks
    if (premiumComponents.length >= 4 && smartParlayCount < 3) {
      const legs = premiumComponents.slice(0, 3).filter((c, idx, arr) => 
        arr.findIndex(x => x.gameId === c.gameId) === idx // unique games only
      );
      
      if (legs.length === 3) {
        const avgConf = legs.reduce((sum, c) => sum + c.confidence, 0) / 3;
        const avgEdge = legs.reduce((sum, c) => sum + c.ev_score, 0) / 3;
        
        parlays.push({
          type: "smart_3leg",
          legs: legs,
          avg_confidence: avgConf,
          avg_edge: avgEdge,
          combined_ev: legs.reduce((sum, c) => sum + c.ev_score, 0),
          risk_level: "HIGH",
          recommended_unit: 0.2,
          description: legs.map(c => c.description).join(" + "),
          note: "Smart 3-leg (auto-selected)"
        });
        smartParlayCount++;
      }
    }
    
    // Fill remaining smart slots with additional combinations
    while (smartParlayCount < 3 && premiumComponents.length >= 3) {
      const startIdx = smartParlayCount;
      let legs;
      
      if (premiumComponents.length >= 6 && smartParlayCount === 1) {
        // 4-leg parlay for second smart slot if enough picks
        legs = premiumComponents.slice(0, 4).filter((c, idx, arr) => 
          arr.findIndex(x => x.gameId === c.gameId) === idx
        ).slice(0, 4);
      } else {
        // 3-leg variations for remaining slots
        legs = premiumComponents.slice(startIdx, startIdx + 3).filter((c, idx, arr) => 
          arr.findIndex(x => x.gameId === c.gameId) === idx
        );
      }
      
      if (legs.length >= 2) {
        const finalLegs = legs.slice(0, Math.min(legs.length, 4));
        const avgConf = finalLegs.reduce((sum, c) => sum + c.confidence, 0) / finalLegs.length;
        const avgEdge = finalLegs.reduce((sum, c) => sum + c.ev_score, 0) / finalLegs.length;
        
        parlays.push({
          type: `smart_${finalLegs.length}leg`,
          legs: finalLegs,
          avg_confidence: avgConf,
          avg_edge: avgEdge,
          combined_ev: finalLegs.reduce((sum, c) => sum + c.ev_score, 0),
          risk_level: finalLegs.length >= 3 ? "HIGH" : "MODERATE",
          recommended_unit: finalLegs.length >= 4 ? 0.1 : (finalLegs.length === 3 ? 0.15 : 0.2),
          description: finalLegs.map(c => c.description).join(" + "),
          note: `Smart ${finalLegs.length}-leg (ML/spread/total mix)`
        });
        smartParlayCount++;
      } else {
        break;
      }
    }
  }
  
  // Sort by combined EV and return max 5 parlays (2 fixed 2-leg + 3 smart)
  parlays.sort((a, b) => b.combined_ev - a.combined_ev);
  return parlays.slice(0, 5);
}

// MAIN PREDICTION FUNCTION: v13 Logic + v8 Odds Integration
async function generateAdvancedPredictions(games, season) {
  console.log('=== v13 LOGIC + v8 WORKING ODDS INTEGRATION ===');
  
  let advancedMetrics = null;
  let injuries = null;
  
  try {
    advancedMetrics = await loadAdvancedMetrics(season);
    injuries = await loadInjuries();
    
    // **NEW: Initialize injury duration tracking when injuries are loaded**
    if (injuries && injuries.teams && Object.keys(injuries.teams).length > 0) {
      console.log('🔄 Updating injury duration tracking...');
      await updateInjuryDurations(injuries, currentWeek);
    }
    
    console.log('🔥 INJURY DEBUG - Loaded injuries:', {
      injuriesIsNull: injuries === null,
      injuriesType: typeof injuries,
      hasTeams: !!(injuries && injuries.teams),
      teamCount: injuries && injuries.teams ? Object.keys(injuries.teams).length : 0,
      wasTeam: injuries && injuries.teams && injuries.teams.WAS ? 'has WAS data' : 'no WAS data'
    });
    
    // Injury data is loaded from Netlify Blobs - no test harness needed
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

    // v4.1 PRODUCTION SAFEGUARDS: Apply EPA filtering before injury adjustments
    console.log(`🛡️ SAFEGUARDS v4.1: Applying EPA filters and depth chart validation`);
    const epaFilterResults = applySituationalEPAFilters(homeMetrics, awayMetrics, game);
    
    if (injuries) {
      console.log(`🔥 APPLYING CANONICAL AVAILABILITY for ${awayCode} @ ${homeCode}, Week ${currentWeek}`);
      homeScoreData = applyInjuryAdjustments(homeScoreData, homeCode, injuries, currentWeek);
      awayScoreData = applyInjuryAdjustments(awayScoreData, awayCode, injuries, currentWeek);
      
      // v4.1 SAFEGUARDS: Apply depth chart safeguards to injury impacts
      if (homeScoreData.injuryAnalysis?.adjustments?.length > 0) {
        const homeSafeguards = applyDepthChartSafeguards(
          homeScoreData.injuryAnalysis.adjustments,
          injuries,
          { team: homeCode, gameId: game.game_id }
        );
        homeScoreData.injuryAnalysis.safeguardedAdjustments = homeSafeguards.safeguardedImpacts;
        homeScoreData.injuryAnalysis.safeguardWarnings = homeSafeguards.warnings;
        console.log(`🛡️ Home injury safeguards: ${homeSafeguards.warnings.length} warnings, ${homeSafeguards.summary.totalImpactReduction.toFixed(1)}% reduction`);
      }
      
      if (awayScoreData.injuryAnalysis?.adjustments?.length > 0) {
        const awaySafeguards = applyDepthChartSafeguards(
          awayScoreData.injuryAnalysis.adjustments,
          injuries,
          { team: awayCode, gameId: game.game_id }
        );
        awayScoreData.injuryAnalysis.safeguardedAdjustments = awaySafeguards.safeguardedImpacts;
        awayScoreData.injuryAnalysis.safeguardWarnings = awaySafeguards.warnings;
        console.log(`🛡️ Away injury safeguards: ${awaySafeguards.warnings.length} warnings, ${awaySafeguards.summary.totalImpactReduction.toFixed(1)}% reduction`);
      }
    } else {
      console.log(`❌ NO INJURIES APPLIED - injuries object is falsy:`, injuries);
    }

    const scoreDifference = homeScoreData.score - awayScoreData.score;
    
    // v13 LOGIC: Fixed spread calculation
    const predictedSpread = calculateSpreadPrediction(homeScoreData, awayScoreData, homeCode, awayCode);
    const rawHomeWinProb = sigmoid(predictedSpread / 14);
    const rawAwayWinProb = 1 - rawHomeWinProb;

    // v4.1 PRODUCTION SAFEGUARDS: Apply calibration and market anchoring
    let homeWinProb = rawHomeWinProb;
    let awayWinProb = rawAwayWinProb;
    let calibrationData = null;
    let anchoringData = null;
    
    // Note: Calibration would be applied here with preloaded mapping
    // For now, use conservative adjustment for high confidence predictions
    if (rawHomeWinProb > 0.75) {
      homeWinProb = 0.50 + (rawHomeWinProb - 0.50) * 0.85; // Conservative scaling
      awayWinProb = 1 - homeWinProb;
      calibrationData = {
        applied: true,
        rawProb: rawHomeWinProb,
        calibratedProb: homeWinProb,
        adjustment: Math.abs(rawHomeWinProb - homeWinProb),
        method: 'conservative_scaling'
      };
      console.log(`📊 Conservative calibration: ${(rawHomeWinProb * 100).toFixed(1)}% → ${(homeWinProb * 100).toFixed(1)}%`);
    } else if (rawAwayWinProb > 0.75) {
      awayWinProb = 0.50 + (rawAwayWinProb - 0.50) * 0.85; // Conservative scaling
      homeWinProb = 1 - awayWinProb;
      calibrationData = {
        applied: true,
        rawProb: rawAwayWinProb,
        calibratedProb: awayWinProb,
        adjustment: Math.abs(rawAwayWinProb - awayWinProb),
        method: 'conservative_scaling'
      };
      console.log(`📊 Conservative calibration: Away ${(rawAwayWinProb * 100).toFixed(1)}% → ${(awayWinProb * 100).toFixed(1)}%`);
    }

    // Generate basic model picks for structured odds selection
    const mlPick = homeWinProb > awayWinProb ? homeCode : awayCode;
    const initialSpreadPick = predictedSpread > 1.5 ? homeCode : (predictedSpread < -1.5 ? awayCode : 'push');
    
    // Calculate basic predicted total for over/under (will be refined later)
    const basicPredictedTotal = homeScoreData.score + awayScoreData.score;
    let initialTotalPick = 'push';
    
    // v8 WORKING ODDS: Use proven working odds integration
    const gameOdds = findGameOdds(allOdds, homeCode, awayCode);
    
    // NEW: Extract structured odds with display vs best separation
    const modelPicks = {
      mlPick: mlPick === homeCode ? 'home' : 'away',
      spreadPick: initialSpreadPick,
      totalPick: initialTotalPick // Will be updated below when we know the market total
    };
    
    const structuredOdds = extractStructuredOdds(gameOdds, modelPicks);
    const realOdds = gameOdds ? extractOddsData(gameOdds) : {};  // Keep legacy for now
    const hasLiveOdds = gameOdds && realOdds.ml_home && realOdds.ml_away;
    
    // Update total pick now that we have market total
    if (structuredOdds.display?.total?.over?.line) {
      const marketTotal = structuredOdds.display.total.over.line;
      initialTotalPick = basicPredictedTotal > marketTotal + 3 ? 'over' : 
                  basicPredictedTotal < marketTotal - 3 ? 'under' : 'push';
      modelPicks.totalPick = initialTotalPick;
      
      // Re-extract odds with updated total pick
      if (initialTotalPick !== 'push') {
        const updatedStructuredOdds = extractStructuredOdds(gameOdds, modelPicks);
        Object.assign(structuredOdds, updatedStructuredOdds);
      }
    }
    
    console.log(`Live odds found: ${hasLiveOdds}, Spread: ${realOdds.spread_line}, Total: ${realOdds.total_line}`);
    console.log(`Structured odds display book: ${structuredOdds.display?.bookmaker || 'none'}`);
    
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
    
    const mlModelProb = Math.max(homeWinProb, awayWinProb);
    
    // NEW: Calculate edges using best-book pricing
    let mlEdge = 0;
    let mlMarketProb = 0.5;
    let mlConfidence = Math.round(mlModelProb * 100);
    
    if (structuredOdds.best.h2h) {
      const bestMLPrice = structuredOdds.best.h2h.price;
      mlMarketProb = americanToImplied(bestMLPrice);
      
      // Remove vig using both sides from the same best book
      const bestBook = structuredOdds.all_books[structuredOdds.best.h2h.bookmaker];
      if (bestBook?.h2h?.home && bestBook?.h2h?.away) {
        const homeImplied = americanToImplied(bestBook.h2h.home);
        const awayImplied = americanToImplied(bestBook.h2h.away);
        const totalImplied = homeImplied + awayImplied;
        const vigFreeHome = homeImplied / totalImplied;
        const vigFreeAway = awayImplied / totalImplied;
        
        mlMarketProb = structuredOdds.best.h2h.pick_side === 'home' ? vigFreeHome : vigFreeAway;
      }
      
      const rawMLEdge = mlModelProb - mlMarketProb;
      mlEdge = Math.abs(rawMLEdge);
    } else {
      // Fallback to legacy odds
      const homeMarketProb = americanToImplied(realOdds.ml_home) || 0.5;
      const awayMarketProb = americanToImplied(realOdds.ml_away) || 0.5;
      mlMarketProb = mlPick === homeCode ? homeMarketProb : awayMarketProb;
      const rawMLEdge = mlMarketProb && hasLiveOdds ? mlModelProb - mlMarketProb : 0;
      mlEdge = Math.abs(rawMLEdge);
    }
    
    const avgConfidence = (homeScoreData.confidence + awayScoreData.confidence) / 2;
    const avgEvidence = (homeScoreData.evidenceStrength + awayScoreData.evidenceStrength) / 2;
    
    // PHASE 3 ENHANCEMENT: Apply public bias detection
    const publicBiasAdjustment = detectPublicBias(mlPick, realOdds.spread_line, predictedSpread);
    const baseMLConfidence = calculateConfidence(mlModelProb, mlMarketProb, mlEdge, avgConfidence, avgEvidence, scoreDifference, 'moneyline', gameContext);
    mlConfidence = Math.round(baseMLConfidence * publicBiasAdjustment);
    
    // Add moneyline skip check using best-book edge
    const mlSkipCheck = shouldSkipMoneylineBet(mlPick, gameContext, realOdds, mlConfidence, mlEdge * 100);

    // Spread predictions with structured odds integration
    const marketSpread = hasLiveOdds ? (realOdds.spread_line || 0) : 0;
    const marketFavorite = realOdds.spread_favorite;
    
    const modelHomeMargin = predictedSpread;
    let marketHomeMargin = 0;
    if (hasLiveOdds && marketSpread !== 0) {
      marketHomeMargin = marketFavorite === 'home' ? Math.abs(marketSpread) : -Math.abs(marketSpread);
    }
    
    const marginDifference = modelHomeMargin - marketHomeMargin;
    const spreadThreshold = hasLiveOdds ? 2.5 : 1.0;
    
    let spreadPick = initialSpreadPick; // Start with initial pick
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
      // FIXED: Correct spread pick logic
      // If model predicts smaller margin than market, take the underdog
      // If model predicts larger margin than market, take the favorite
      if (Math.abs(marginDifference) < spreadThreshold) {
        spreadPick = 'push';
      } else if (marginDifference > spreadThreshold) {
        // Model thinks favorite will cover by more than market
        spreadPick = marketFavorite === 'home' ? homeCode : awayCode;
      } else {
        // Model thinks favorite won't cover, take underdog
        spreadPick = marketFavorite === 'home' ? awayCode : homeCode;
      }
      displayedSpread = Math.abs(marketSpread);
    }
    
    // Enhanced spread edge calculation using best-book data
    let spreadEdge = Math.abs(marginDifference);
    let bestSpreadInfo = null;
    
    if (structuredOdds.best.spread && spreadPick !== 'push') {
      const bestSpread = structuredOdds.best.spread;
      const bestBook = structuredOdds.all_books[bestSpread.bookmaker];
      
      if (bestBook?.spread) {
        // Use best-book line for edge calculation
        const bestLine = bestSpread.line;
        const modelLineForPick = spreadPick === homeCode ? modelHomeMargin : -modelHomeMargin;
        spreadEdge = Math.abs(modelLineForPick - bestLine);
        
        bestSpreadInfo = {
          bookmaker: bestSpread.bookmaker,
          line: bestLine,
          price: bestSpread.price,
          edge_points: spreadEdge
        };
      }
    }
    
    const baseSpreadConfidence = calculateConfidence(0.6, 0.52, spreadEdge / 14, avgConfidence, avgEvidence, scoreDifference, 'spread', gameContext);
    const spreadConfidence = baseSpreadConfidence;
    
    // Use spread-specific skip check with enhanced edge
    const spreadSkipCheck = shouldSkipSpreadBet(spreadPick, marginDifference, gameContext, realOdds, spreadConfidence, spreadEdge);

    // Enhanced total calculations
    const predictedTotal = calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread, homeScoreData.specialTeams, awayScoreData.specialTeams);
    const marketTotal = hasLiveOdds ? (realOdds.total_line || 44) : 44;
    
    let totalDifference = predictedTotal - marketTotal;
    const totalPick = predictedTotal > marketTotal ? 'over' : 'under';
    let totalEdge = Math.abs(totalDifference);
    let bestTotalInfo = null;
    
    // Enhanced total edge calculation using best-book data
    if (structuredOdds.best.total && totalPick !== 'push') {
      const bestTotal = structuredOdds.best.total;
      const bestTotalLine = bestTotal.line;
      
      totalDifference = predictedTotal - bestTotalLine;
      totalEdge = Math.abs(totalDifference);
      
      bestTotalInfo = {
        bookmaker: bestTotal.bookmaker,
        line: bestTotalLine,
        price: bestTotal.price,
        side: bestTotal.pick_side,
        edge_points: totalEdge
      };
    }
    
    const totalConfidence = calculateConfidence(0.6, 0.52, totalEdge / 10, avgConfidence, avgEvidence, 0, 'total', gameContext);
    
    // Use proper totals skip check with enhanced edge
    const totalSkipCheck = shouldSkipTotalBet(totalPick, totalDifference, gameContext, realOdds, totalConfidence, totalEdge);

    // v4.1 PRODUCTION SAFEGUARDS: Apply final safety limits to all bet recommendations
    const rawPredictions = {
      moneyline: { 
        pick: mlPick,
        confidence: mlConfidence,
        edge: Number((mlEdge * 100).toFixed(1)),
        bet: !mlSkipCheck.skip,
        betRecommendation: mlSkipCheck.skip ? "NO BET" : "BET",
        skipReason: mlSkipCheck.reason || null,
        displayNote: mlSkipCheck.skip ? "NO BET" : "BET",
        best_book: structuredOdds.best.h2h ? {
          bookmaker: structuredOdds.best.h2h.bookmaker,
          price: structuredOdds.best.h2h.price,
          edge_pct: Number((mlEdge * 100).toFixed(1))
        } : null
      },
      spread: { 
        pick: spreadPick,
        confidence: spreadConfidence,
        line: hasLiveOdds ? marketSpread : Number(displayedSpread.toFixed(1)),
        predicted: Number(Math.abs(predictedSpread).toFixed(1)),
        edge: Number(spreadEdge.toFixed(1)),
        model_home_margin: Number(modelHomeMargin.toFixed(1)),
        bet: !spreadSkipCheck.skip,
        betRecommendation: spreadSkipCheck.skip ? "NO BET" : "BET",
        skipReason: spreadSkipCheck.reason || null,
        displayNote: spreadSkipCheck.skip ? "NO BET" : "BET",
        best_book: bestSpreadInfo
      },
      total: { 
        pick: totalPick, 
        confidence: totalConfidence, 
        line: marketTotal, 
        predicted: Number(predictedTotal.toFixed(1)), 
        edge: Number(totalEdge.toFixed(1)),
        bet: !totalSkipCheck.skip,
        betRecommendation: totalSkipCheck.skip ? "NO BET" : "BET",
        skipReason: totalSkipCheck.reason || null,
        displayNote: totalSkipCheck.skip ? "NO BET" : "BET",
        best_book: bestTotalInfo
      }
    };
    
    // Apply production safety limits
    const safeguardedPredictions = applyProductionSafetyLimits(
      rawPredictions,
      realOdds,
      {
        modelConfidence: Math.max(homeScoreData.confidence, awayScoreData.confidence),
        marketDivergence: anchoringData?.divergence || 0,
        dataQuality: (epaFilterResults.home?.filterStats?.filterRate || 0) + (epaFilterResults.away?.filterStats?.filterRate || 0) > 40 ? 0.6 : 0.8
      }
    );
    
    console.log(`🛡️ Safety limits applied: ${safeguardedPredictions.safetyLimits?.applied?.length || 0} adjustments`);

    return {
      ...game,
      predictions: {
        home_win_prob: Number(homeWinProb.toFixed(3)),
        away_win_prob: Number(awayWinProb.toFixed(3)),
        ...safeguardedPredictions
      },
      
      // NEW: Structured odds with display vs best separation
      odds: structuredOdds.display ? {
        // Display book for consistent UI
        display: structuredOdds.display,
        display_book: structuredOdds.display.bookmaker,
        
        // Best book info for edge calculations
        best: structuredOdds.best,
        
        // Legacy format for backwards compatibility
        moneyline: { 
          home: structuredOdds.display.h2h?.home || realOdds.ml_home, 
          away: structuredOdds.display.h2h?.away || realOdds.ml_away
        },
        spread: { 
          line: structuredOdds.display.spread?.home_line || realOdds.spread_line, 
          favorite: realOdds.spread_favorite,
          home_line: structuredOdds.display.spread?.home_line,
          away_line: structuredOdds.display.spread?.away_line
        },
        total: { 
          line: structuredOdds.display.total?.over?.line || realOdds.total_line,
          over_price: structuredOdds.display.total?.over?.price,
          under_price: structuredOdds.display.total?.under?.price
        },
        
        // Metadata
        source_snapshot_at: structuredOdds.source_snapshot_at,
        live_odds_available: hasLiveOdds,
        books_available: Object.keys(structuredOdds.all_books || {})
      } : {
        // Fallback to legacy structure
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
        version: 'v4.1_safeguarded_production',
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
          "ENHANCED: Sophisticated variance modeling",
          "v4.1: Conservative probability calibration",
          "v4.1: Situational EPA filtering",
          "v4.1: Depth chart safeguards", 
          "v4.1: Production safety limits",
          "v4.1: Market anchoring framework"
        ],
        safeguards: {
          calibrationApplied: calibrationData?.applied || false,
          calibrationMethod: calibrationData?.method || 'none',
          calibrationAdjustment: calibrationData?.adjustment?.toFixed(3) || '0.000',
          epaFilteringHome: epaFilterResults.home?.filterStats?.filterRate?.toFixed(1) + '%' || 'N/A',
          epaFilteringAway: epaFilterResults.away?.filterStats?.filterRate?.toFixed(1) + '%' || 'N/A',
          depthChartWarnings: (homeScoreData.injuryAnalysis?.safeguardWarnings?.length || 0) + (awayScoreData.injuryAnalysis?.safeguardWarnings?.length || 0),
          safetyLimitsApplied: safeguardedPredictions.safetyLimits?.applied?.length || 0,
          marketAnchoringAvailable: !!anchoringData
        },
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
        },
        // INJURY ANALYSIS: Expose injury data for debugging and transparency
        injuryAnalysis: {
          home: homeScoreData.injuryAnalysis || null,
          away: awayScoreData.injuryAnalysis || null,
          hasInjuryImpact: !!(homeScoreData.injuryAnalysis?.adjustments?.length || awayScoreData.injuryAnalysis?.adjustments?.length),
          injuryDataAvailable: !!injuries?.teams
        }
      },
      
      teamStats: {
        home: {
          strength: Number(homeWinProb.toFixed(3)),
          score: Number(homeScoreData.score.toFixed(2)),
          confidence: Number(homeScoreData.confidence.toFixed(3)),
          specialTeamsValue: homeScoreData.specialTeams?.total_st_value || 0,
          injuryImpact: homeScoreData.injuryAnalysis || null,
          safeguardedInjuryImpact: homeScoreData.injuryAnalysis?.safeguardedAdjustments || null,
          epaFilterStats: epaFilterResults.home?.filterStats || null
        },
        away: {
          strength: Number(awayWinProb.toFixed(3)),
          score: Number(awayScoreData.score.toFixed(2)),
          confidence: Number(awayScoreData.confidence.toFixed(3)),
          specialTeamsValue: awayScoreData.specialTeams?.total_st_value || 0,
          injuryImpact: awayScoreData.injuryAnalysis || null,
          safeguardedInjuryImpact: awayScoreData.injuryAnalysis?.safeguardedAdjustments || null,
          epaFilterStats: epaFilterResults.away?.filterStats || null
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
    },
    // INJURY INTEGRATION STATUS: For debugging and transparency
    injuryIntegrationStatus: {
      dataAvailable: !!injuries?.teams,
      teamsWithData: injuries?.teams ? Object.keys(injuries.teams).length : 0,
      gamesWithInjuryImpact: predictions.filter(p => 
        p.modelEnhancements?.injuryAnalysis?.hasInjuryImpact || 
        p.teamStats?.home?.injuryImpact?.adjustments?.length ||
        p.teamStats?.away?.injuryImpact?.adjustments?.length
      ).length,
      lastUpdated: injuries?.asOf || null
    }
  };
}

/**
 * Save advanced predictions to blob storage in the format that nfl-predictions-get expects
 * This bridges the sophisticated R Pipeline model to the live website
 */
async function saveAdvancedPredictionsToBlobs(result, season) {
  const { getStore } = await import('@netlify/blobs');
  
  // Transform advanced predictions to the format expected by the frontend
  const rows = result.predictions.map(game => {
    const homeTeam = TEAM_NAME_MAPPING[game.home_team] || game.home_team;
    const awayTeam = TEAM_NAME_MAPPING[game.away_team] || game.away_team;
    
    return {
      id: game.game_id,
      matchup: `${awayTeam} @ ${homeTeam}`,
      kickoff: game.start,
      homeTeam: homeTeam,
      awayTeam: awayTeam,
      
      // Transform advanced predictions to simple format
      odds: game.odds || {},
      
      // Use the sophisticated model's best pick as the main choice
      model_choice: {
        market: game.predictions.moneyline.bet ? "moneyline" : 
                game.predictions.spread.bet ? "spread" : 
                game.predictions.total.bet ? "total" : "moneyline",
        side: game.predictions.moneyline.bet ? 
              (game.predictions.moneyline.pick === game.home_team ? "home" : "away") :
              game.predictions.spread.bet ? 
              (game.predictions.spread.pick === game.home_team ? "home" : "away") : "home"
      },
      
      // Frontend display fields
      displayMarket: game.predictions.moneyline.bet ? "moneyline" : "spread",
      displayPick: game.predictions.moneyline.bet ? 
                   TEAM_NAME_MAPPING[game.predictions.moneyline.pick] || game.predictions.moneyline.pick :
                   TEAM_NAME_MAPPING[game.predictions.spread.pick] || game.predictions.spread.pick,
      displayPrice: game.odds?.moneyline?.home || null,
      displayLine: game.predictions.spread.line || null,
      
      // Enhanced confidence from sophisticated model
      confidence: Math.max(
        game.predictions.moneyline.confidence / 100,
        game.predictions.spread.confidence / 100,
        game.predictions.total.confidence / 100
      ),
      
      // Detailed pick information
      pick: {
        type: game.predictions.moneyline.bet ? "moneyline" : "spread",
        team: game.predictions.moneyline.bet ? 
              TEAM_NAME_MAPPING[game.predictions.moneyline.pick] || game.predictions.moneyline.pick :
              TEAM_NAME_MAPPING[game.predictions.spread.pick] || game.predictions.spread.pick,
        confidence: Math.max(
          game.predictions.moneyline.confidence / 100,
          game.predictions.spread.confidence / 100
        ),
        pickLabel: game.predictions.moneyline.bet ? 
                   `moneyline: ${TEAM_NAME_MAPPING[game.predictions.moneyline.pick] || game.predictions.moneyline.pick}` :
                   `spread: ${TEAM_NAME_MAPPING[game.predictions.spread.pick] || game.predictions.spread.pick} ${game.predictions.spread.line}`
      },
      
      // Advanced metadata for power users
      _advanced: {
        modelVersion: game.modelEnhancements?.version || 'v13_r_pipeline',
        mlEdge: game.predictions.moneyline.edge,
        spreadEdge: game.predictions.spread.edge,
        totalEdge: game.predictions.total.edge,
        homeWinProb: game.predictions.home_win_prob,
        awayWinProb: game.predictions.away_win_prob,
        betRecommendations: {
          moneyline: game.predictions.moneyline.betRecommendation,
          spread: game.predictions.spread.betRecommendation,
          total: game.predictions.total.betRecommendation
        }
      }
    };
  });
  
  // Create the payload in the expected format
  const blobData = {
    ok: true,
    updated: new Date().toISOString(),
    rows: rows,
    source: 'r_pipeline_advanced_epa_model',
    version: 'v13_hybrid_integration',
    totalGames: rows.length,
    metadata: {
      season: season,
      modelEnhancements: result.predictions[0]?.modelEnhancements || {},
      parlayData: result.parlaySuggestions || [],
      generatedAt: new Date().toISOString(),
      dataSource: 'nfl-predictions-generate (R Pipeline + NFLVerse EPA)'
    }
  };
  
  // Save to the same blob storage that nfl-predictions-get reads from
  const name = process.env.BLOBS_STORE_NFL || "nfl-td";
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;
  const store = (siteID && token) ? getStore({ siteID, token, name }) : getStore(name);
  
  await store.set("predictions/current.json", JSON.stringify(blobData));
  
  console.log(`💾 Saved ${rows.length} advanced predictions to blob storage (predictions/current.json)`);
  return blobData;
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
    const saveToBlobs = request.method === 'GET'; // Auto-save when called via GET (like a refresh)
    
    if (request.method === 'POST') {
      const body = await request.json();
      games = body.games || [];
      season = body.season || '2025';
    } else if (request.method === 'GET') {
      const url = new URL(request.url);
      season = url.searchParams.get('season') || '2025';
      
      // AUTO-FETCH GAMES: When called via GET, automatically get current week games
      try {
        console.log('🔄 Auto-fetching current NFL games for predictions...');
        const scheduleRes = await fetch('https://bgroundrobin.com/.netlify/functions/nfl-schedule-get');
        if (scheduleRes.ok) {
          const scheduleData = await scheduleRes.json();
          games = (scheduleData.matchups || scheduleData.games || []).map(game => ({
            game_id: game.id || `${game.away || game.awayTeam}_${game.home || game.homeTeam}`,
            home_team: getTeamAbbreviation(game.home || game.homeTeam),
            away_team: getTeamAbbreviation(game.away || game.awayTeam),
            start: game.kickoff || game.start
          }));
          console.log(`✅ Auto-fetched ${games.length} games for predictions`);
        }
      } catch (error) {
        console.warn('⚠️  Failed to auto-fetch games:', error.message);
        games = []; // Continue with empty games if fetch fails
      }
    }

    const result = await generateAdvancedPredictions(games, season);
    
    // LIVE SITE INTEGRATION: Always save to blob storage when we have predictions
    if (result.predictions && result.predictions.length > 0) {
      try {
        await saveAdvancedPredictionsToBlobs(result, season);
        console.log('✅ Saved advanced predictions to blob storage for live site');
      } catch (error) {
        console.error('❌ Failed to save to blobs:', error);
        // Continue anyway - don't fail the request
      }
    }
    
    // PICK LOCKING: Check for kickoff events and trigger locks
    await checkAndLockKickoffGames(result.predictions || result);
    
    // PICK RETRIEVAL: Replace live predictions with locked picks for started games
    const finalResult = await integrateLockedPicks(result);
    
    return new Response(JSON.stringify(finalResult), {
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

/**
 * Check games for kickoff events and trigger pick locking
 * Auto-locks picks within 5 minutes of kickoff (before or after)
 */
async function checkAndLockKickoffGames(predictions) {
  const now = new Date();
  const lockPromises = [];
  
  for (const game of predictions) {
    if (!game.start || !game.game_id) continue;
    
    const kickoff = new Date(game.start);
    const timeToKickoff = kickoff - now; // negative = game started
    const minutesToKickoff = timeToKickoff / (1000 * 60);
    
    // Lock picks in 10-minute window around kickoff (-5 to +5 minutes)
    if (minutesToKickoff <= 5 && minutesToKickoff >= -5) {
      console.log(`[KICKOFF] Game ${game.game_id} kickoff detected, triggering lock (${minutesToKickoff.toFixed(1)}min)`);
      
      // Async lock - don't wait for completion to avoid blocking predictions
      const lockPromise = lockGamePicks(game.game_id, game, 'kickoff')
        .catch(error => {
          console.error(`[KICKOFF] Failed to lock ${game.game_id}:`, error);
        });
      
      lockPromises.push(lockPromise);
    }
  }
  
  // Wait for all lock attempts to complete (with timeout)
  if (lockPromises.length > 0) {
    console.log(`[KICKOFF] Triggering ${lockPromises.length} game locks`);
    try {
      await Promise.allSettled(lockPromises);
    } catch (error) {
      console.error('[KICKOFF] Error in lock promises:', error);
    }
  }
}

/**
 * Replace live predictions with locked picks for games that have started
 */
async function integrateLockedPicks(result) {
  const predictions = result.predictions || result;
  const now = new Date();
  
  for (let i = 0; i < predictions.length; i++) {
    const game = predictions[i];
    if (!game.start || !game.game_id) continue;
    
    const kickoff = new Date(game.start);
    const gameStarted = now > kickoff;
    
    // For started games, try to load locked picks
    if (gameStarted) {
      try {
        const lockedPicks = await getLockedPicks(game.game_id);
        if (lockedPicks && Object.keys(lockedPicks).length > 0) {
          // Merge locked picks into game predictions
          predictions[i] = mergeLockedPicks(game, lockedPicks);
          console.log(`[LOCKED] Using locked picks for ${game.game_id}`);
        }
      } catch (error) {
        console.warn(`[LOCKED] Could not load locked picks for ${game.game_id}:`, error.message);
        // Continue with live predictions as fallback
      }
    }
  }
  
  return result;
}

/**
 * Lock picks for a specific game by calling the locking function
 */
async function lockGamePicks(gameId, gameData, source) {
  try {
    // Call our locking function
    const response = await fetch(`${process.env.URL || 'https://localhost:8888'}/.netlify/functions/nfl-picks-lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'lock',
        gameId: gameId,
        source: source,
        gameData: gameData // Pass current predictions for locking
      })
    });
    
    if (!response.ok) {
      throw new Error(`Lock request failed: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`[LOCK] Successfully locked ${gameId}:`, result.status);
    return result;
    
  } catch (error) {
    console.error(`[LOCK] Failed to lock picks for ${gameId}:`, error);
    throw error;
  }
}

/**
 * Get locked picks from storage
 */
async function getLockedPicks(gameId) {
  try {
    const response = await fetch(`${process.env.URL || 'https://localhost:8888'}/.netlify/functions/nfl-picks-lock`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'get',
        gameId: gameId
      })
    });
    
    if (!response.ok) {
      throw new Error(`Get locked picks failed: ${response.status}`);
    }
    
    const result = await response.json();
    return result.lockedPicks;
    
  } catch (error) {
    console.error(`[LOCKED] Failed to get locked picks for ${gameId}:`, error);
    return null;
  }
}

/**
 * Merge locked picks into game prediction structure
 */
function mergeLockedPicks(game, lockedPicks) {
  const mergedGame = { ...game };
  
  // Add locked pick indicators to predictions
  if (mergedGame.predictions) {
    if (lockedPicks.spread) {
      mergedGame.predictions.spread = {
        ...mergedGame.predictions.spread,
        ...lockedPicks.spread,
        isLocked: true,
        lockedAt: lockedPicks.spread.locked_at,
        lockSource: lockedPicks.spread.source
      };
    }
    
    if (lockedPicks.total) {
      mergedGame.predictions.total = {
        ...mergedGame.predictions.total,
        ...lockedPicks.total,
        isLocked: true,
        lockedAt: lockedPicks.total.locked_at,
        lockSource: lockedPicks.total.source
      };
    }
    
    if (lockedPicks.moneyline) {
      mergedGame.predictions.moneyline = {
        ...mergedGame.predictions.moneyline,
        ...lockedPicks.moneyline,
        isLocked: true,
        lockedAt: lockedPicks.moneyline.locked_at,
        lockSource: lockedPicks.moneyline.source
      };
    }
  }
  
  return mergedGame;
}
