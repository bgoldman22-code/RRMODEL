// netlify/functions/nfl-predictions-generate/index.mjs
// v13: Critical fixes for determinism, spread logic, and multiplier stability
// Addressing ChatGPT's analysis: non-determinism, aggressive multipliers, spread calculation errors

import { loadAdvancedMetrics, loadInjuries, validateAdvancedMetrics, getTeamMetrics, getCurrentWeek, getCurrentWeights, diagnoseMetricsData } from '../_lib/blobs-nfl.js';
import { calculateMatchups, calculateExpectedPlays, calculateMatchupScore } from '../_lib/matchups.js';

// FIXED: Toned down aggressive multipliers per ChatGPT analysis
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

// FIXED: Reduced aggressive multipliers (ChatGPT: CORE_EPA 30→24, TIER_BASE 10→8)
const SCORING_MULTIPLIERS = {
  CORE_EPA: 24,        // Reduced from 30
  TIER_BASE: 8,        // Reduced from 10  
  ADVANCED_BASE: 6,    // Kept same
  MATCHUP_BASE: 3.2,
  SPECIAL_TEAMS_BASE: 3
};

const ROSTER_CONTINUITY_FACTORS = {
  qb_change: 0.3, coach_change: 0.2, coordinator_change: 0.15, major_trades: 0.1, draft_impact: 0.05
};

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

// Utility functions with ChatGPT's NaN protection
function z(val, mean = 0, std = 1) { 
  if (isNaN(val) || isNaN(mean) || isNaN(std) || std <= 0) return 0;
  return (val - mean) / std; 
}

// FIXED: Clip z-scores to prevent extreme outliers (ChatGPT recommendation)
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

// FIXED: Deterministic special teams generation (no Math.random)
function generateSpecialTeamsFromBasics(teamCode, teamMetrics, league) {
  const offEPA = teamMetrics?.core?.off_epa || 0;
  const defEPA = teamMetrics?.core?.def_epa || 0;
  const teamQuality = (offEPA - defEPA) / 2;
  const stQualityFactor = teamQuality * 0.4;
  
  // FIXED: Deterministic variation based on team code hash instead of Math.random()
  const teamHash = teamCode.split('').reduce((hash, char) => hash + char.charCodeAt(0), 0);
  const deterministicVariation = ((teamHash % 100) / 100 - 0.5) * 0.1; // -0.05 to +0.05
  
  const finalSTFactor = stQualityFactor + deterministicVariation;
  
  // Return object instead of mutating input (ChatGPT recommendation)
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

// FIXED: ChatGPT's NaN shield for league stats
function scoreTeamFromFeatures(teamData, league, contextWeights, matchupTerms = null, isHome = false, currentWeek = 3, opponentData = null, teamCode = null) {
  if (!teamData || !league) {
    return { score: 0, confidence: 0.5, evidenceStrength: 0.25, specialTeams: null };
  }

  // FIXED: Safe proxy for league means/stds (ChatGPT recommendation)
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

  // FIXED: Use clippedZ to prevent extreme outliers
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

  // FIXED: Don't mutate teamData - generate ST separately
  let specialTeamsScore = 0;
  let specialTeamsMetrics = null;
  
  if (opponentData && teamCode) {
    const teamST = teamData.special_teams || generateSpecialTeamsFromBasics(teamCode, teamData, league);
    const oppST = opponentData.special_teams || generateSpecialTeamsFromBasics('OPP', opponentData, league);
    
    // Create temporary metrics objects instead of mutating
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

function applyInjuryAdjustments(scoreData, teamCode, injuries) {
  const teamInjuries = injuries.teams?.[teamCode] || {};
  let delta = 0;

  switch (teamInjuries.qb_status) {
    case 'out': delta -= 6; break;
    case 'doubtful': delta -= 3; break;
    case 'questionable': delta -= 1.5; break;
    default: break;
  }

  const olOut = teamInjuries.ol_starters_out ?? 0;
  const dbOut = teamInjuries.db_starters_out ?? 0;
  if (olOut >= 2) delta -= 2;
  if (olOut >= 3) delta -= 4;
  if (dbOut >= 2) delta -= 1.5;

  if (teamInjuries.kicker_status === 'out') delta -= 1.5;
  if (teamInjuries.punter_status === 'out') delta -= 1.0;
  if (teamInjuries.returner_status === 'out') delta -= 0.5;
  
  return {
    score: scoreData.score + delta,
    confidence: scoreData.confidence * (1 - Math.abs(delta) * 0.02),
    evidenceStrength: scoreData.evidenceStrength,
    specialTeams: scoreData.specialTeams
  };
}

// FIXED: Corrected spread calculation logic
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
  
  // FIXED: This was the core issue - spread calculation needs to be meaningful
  const scoreDifference = homeScoreData.score - awayScoreData.score;
  const spreadFromScores = scoreDifference * 3.5; // Reduced multiplier for more realistic spreads
  
  let stSpreadAdjustment = 0;
  if (homeScoreData.specialTeams && awayScoreData.specialTeams) {
    const homeSTValue = homeScoreData.specialTeams.total_st_value;
    const awaySTValue = awayScoreData.specialTeams.total_st_value;
    stSpreadAdjustment = (homeSTValue - awaySTValue) * 0.5;
  }
  
  // This is the model's pure prediction of home margin
  const predictedHomeMargin = adjustedHFA + spreadFromScores + stSpreadAdjustment;
  
  console.log('FIXED Spread calculation:', {
    homeScore: homeScoreData.score.toFixed(2),
    awayScore: awayScoreData.score.toFixed(2), 
    scoreDiff: scoreDifference.toFixed(2),
    HFA: adjustedHFA.toFixed(2),
    modelMargin: predictedHomeMargin.toFixed(2)
  });
  
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
  
  return Math.round(baseConfidence);
}

async function loadLiveOdds() {
  try {
    console.log('=== LOADING LIVE ODDS ===');
    const oddsRes = await fetch('/.netlify/functions/nfl-odds-get?regions=us&markets=h2h,spreads,totals');
    
    if (!oddsRes.ok) {
      console.warn(`Odds function returned ${oddsRes.status}, continuing with fallback`);
      return [];
    }
    
    const oddsResponse = await oddsRes.json();
    
    if (oddsResponse.error || oddsResponse.fallback) {
      console.warn('Odds response indicates fallback mode:', oddsResponse.error);
      return oddsResponse.games || [];
    }
    
    const oddsData = oddsResponse.games || [];
    console.log(`Successfully loaded odds for ${oddsData.length} games`);
    return oddsData;
    
  } catch (error) {
    console.warn('Failed to load live odds:', error.message);
    return [];
  }
}

function findGameOdds(allOdds, homeTeam, awayTeam) {
  const homeTeamFull = TEAM_NAME_MAPPING[homeTeam] || homeTeam;
  const awayTeamFull = TEAM_NAME_MAPPING[awayTeam] || awayTeam;
  
  let found = allOdds.find(odds => 
    odds.home_team === homeTeamFull && odds.away_team === awayTeamFull
  );
  
  if (found) return found;
  
  found = allOdds.find(odds => 
    odds.home_team.includes(homeTeamFull.split(' ').pop()) && 
    odds.away_team.includes(awayTeamFull.split(' ').pop())
  );
  
  return found || null;
}

function extractOddsData(gameOdds) {
  if (!gameOdds) return {};
  
  let markets = {};
  
  if (gameOdds.markets) {
    markets = gameOdds.markets;
  } else if (gameOdds.bookmakers?.[0]?.markets) {
    const primaryBook = gameOdds.bookmakers[0];
    primaryBook.markets.forEach(market => {
      markets[market.key] = market.outcomes || [];
    });
  } else {
    return {};
  }
  
  const h2hMarket = markets.h2h || [];
  const homeMLOutcome = h2hMarket.find(o => o.name === gameOdds.home_team);
  const awayMLOutcome = h2hMarket.find(o => o.name === gameOdds.away_team);
  
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
  
  const totalsMarket = markets.totals || [];
  const totalOutcome = totalsMarket[0];
  
  return {
    ml_home: homeMLOutcome?.price,
    ml_away: awayMLOutcome?.price,
    spread_line: favoriteSpread,
    spread_favorite: favoriteTeam,
    total_line: totalOutcome?.point,
    _extraction_success: !!(homeMLOutcome && awayMLOutcome && favoriteSpread !== null && totalOutcome)
  };
}

function generateParlayComponents(games, predictions) {
  const components = [];
  
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const pred = predictions[i];
    
    const mlPick = pred.predictions.moneyline;
    const spreadPick = pred.predictions.spread;
    const totalPick = pred.predictions.total;
    
    if (mlPick.confidence >= 65 && mlPick.edge >= 10) {
      components.push({
        gameId: game.game_id || `${game.away_team}_${game.home_team}`,
        matchup: `${game.away_team} @ ${game.home_team}`,
        type: 'moneyline',
        pick: mlPick.pick,
        confidence: mlPick.confidence,
        edge: mlPick.edge,
        description: `${mlPick.pick} ML`,
        odds: pred.odds?.moneyline?.pick_odds,
        ev_score: (mlPick.confidence - 50) * mlPick.edge
      });
    }
    
    if (spreadPick.confidence >= 62 && spreadPick.edge >= 1.5) {
      components.push({
        gameId: game.game_id || `${game.away_team}_${game.home_team}`,
        matchup: `${game.away_team} @ ${game.home_team}`,
        type: 'spread',
        pick: spreadPick.pick,
        confidence: spreadPick.confidence,
        edge: spreadPick.edge,
        description: `${spreadPick.pick} ${spreadPick.line >= 0 ? '+' : ''}${spreadPick.line}`,
        odds: pred.odds?.spread?.pick_odds,
        ev_score: (spreadPick.confidence - 50) * spreadPick.edge
      });
    }
    
    if (totalPick.confidence >= 60 && totalPick.edge >= 2.5) {
      components.push({
        gameId: game.game_id || `${game.away_team}_${game.home_team}`,
        matchup: `${game.away_team} @ ${game.home_team}`,
        type: 'total',
        pick: totalPick.pick,
        confidence: totalPick.confidence,
        edge: totalPick.edge,
        description: `${totalPick.pick.toUpperCase()} ${totalPick.line}`,
        odds: null,
        ev_score: (totalPick.confidence - 50) * totalPick.edge * 0.8
      });
    }
  }
  
  components.sort((a, b) => b.ev_score - a.ev_score);
  return components;
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
  
  const topComponents = components.slice(0, 4);
  for (let i = 0; i < topComponents.length - 1; i++) {
    for (let j = i + 1; j < topComponents.length; j++) {
      if (topComponents[i].gameId !== topComponents[j].gameId) {
        parlays.push({
          type: "conservative_2leg",
          legs: [topComponents[i], topComponents[j]],
          avg_confidence: (topComponents[i].confidence + topComponents[j].confidence) / 2,
          combined_ev: topComponents[i].ev_score + topComponents[j].ev_score,
          risk_level: "LOW",
          recommended_unit: 0.5,
          description: `${topComponents[i].description} + ${topComponents[j].description}`
        });
      }
    }
  }
  
  if (components.length >= 3) {
    const top3 = components.slice(0, 3);
    const uniqueGames = new Set(top3.map(c => c.gameId));
    
    if (uniqueGames.size === 3) {
      parlays.push({
        type: "moderate_3leg",
        legs: top3,
        avg_confidence: top3.reduce((sum, c) => sum + c.confidence, 0) / 3,
        combined_ev: top3.reduce((sum, c) => sum + c.ev_score, 0),
        risk_level: "MODERATE",
        recommended_unit: 0.25,
        description: top3.map(c => c.description).join(" + ")
      });
    }
  }
  
  if (components.length >= 6) {
    const top4 = components.slice(0, 4);
    const uniqueGames = new Set(top4.map(c => c.gameId));
    
    if (uniqueGames.size >= 3) {
      parlays.push({
        type: "aggressive_4leg",
        legs: top4,
        avg_confidence: top4.reduce((sum, c) => sum + c.confidence, 0) / 4,
        combined_ev: top4.reduce((sum, c) => sum + c.ev_score, 0),
        risk_level: "HIGH",
        recommended_unit: 0.1,
        description: top4.map(c => c.description).join(" + ")
      });
    }
  }
  
  parlays.sort((a, b) => b.combined_ev - a.combined_ev);
  return parlays.slice(0, 6);
}

async function generateAdvancedPredictions(games, season) {
  console.log('=== NFL PREDICTION SYSTEM v13 - CRITICAL FIXES ===');
  
  let advancedMetrics = null;
  let injuries = null;
  
  try {
    advancedMetrics = await loadAdvancedMetrics(season);
    injuries = await loadInjuries();
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
        modelEnhancements: { version: 'v13_critical_fixes', notes: ["Metrics unavailable"] }
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
  const allOdds = await loadLiveOdds();

  console.log(`v13 fixes - deterministic ST, reduced multipliers, clipped z-scores, fixed spread logic`);

  const predictions = games.map(game => {
    const homeCode = game.home_team;
    const awayCode = game.away_team;

    console.log(`\n=== PROCESSING GAME: ${awayCode} @ ${homeCode} ===`);

    const homeMetrics = getTeamMetrics(advancedMetrics, homeCode);
    const awayMetrics = getTeamMetrics(advancedMetrics, awayCode);
    const contextWeights = calculateContextAwareWeights(currentWeek, homeMetrics, awayMetrics);
    const matchups = calculateMatchups(homeMetrics, awayMetrics, league);

    // FIXED: Pass team codes for deterministic ST generation
    let homeScoreData = scoreTeamFromFeatures(homeMetrics, league, contextWeights, matchups?.home, true, currentWeek, awayMetrics, homeCode);
    let awayScoreData = scoreTeamFromFeatures(awayMetrics, league, contextWeights, matchups?.away, false, currentWeek, homeMetrics, awayCode);

    if (injuries) {
      homeScoreData = applyInjuryAdjustments(homeScoreData, homeCode, injuries);
      awayScoreData = applyInjuryAdjustments(awayScoreData, awayCode, injuries);
    }

    const scoreDifference = homeScoreData.score - awayScoreData.score;
    
    // FIXED: This should now produce meaningful spread differences
    const predictedSpread = calculateSpreadPrediction(homeScoreData, awayScoreData, homeCode, awayCode);
    const homeWinProb = sigmoid(predictedSpread / 14);
    const awayWinProb = 1 - homeWinProb;

    const gameOdds = findGameOdds(allOdds, homeCode, awayCode);
    const realOdds = gameOdds ? extractOddsData(gameOdds) : {};
    const hasLiveOdds = gameOdds && realOdds._extraction_success;
    
    const gameContext = {
      week: currentWeek,
      divisional: isDivisionalGame(homeCode, awayCode),
      majorInjuries: (injuries?.teams?.[homeCode]?.qb_status === 'out') || (injuries?.teams?.[awayCode]?.qb_status === 'out')
    };
    
    const mlPick = homeWinProb > awayWinProb ? homeCode : awayCode;
    const mlModelProb = Math.max(homeWinProb, awayWinProb);
    
    const homeMarketProb = americanToImplied(realOdds.ml_home) || 0.5;
    const awayMarketProb = americanToImplied(realOdds.ml_away) || 0.5;
    const mlMarketProb = mlPick === homeCode ? homeMarketProb : awayMarketProb;
    const mlEdge = mlMarketProb && hasLiveOdds ? mlModelProb - mlMarketProb : 0;
    
    const avgConfidence = (homeScoreData.confidence + awayScoreData.confidence) / 2;
    const avgEvidence = (homeScoreData.evidenceStrength + awayScoreData.evidenceStrength) / 2;
    const mlConfidence = calculateConfidence(mlModelProb, mlMarketProb, mlEdge, avgConfidence, avgEvidence, scoreDifference, 'moneyline', gameContext);

    // FIXED: Spread predictions should now have actual logic
    const marketSpread = hasLiveOdds ? (realOdds.spread_line || 0) : 0;
    const marketFavorite = realOdds.spread_favorite;
    
    const modelHomeMargin = predictedSpread;
    let marketHomeMargin = 0;
    if (hasLiveOdds && marketSpread !== 0) {
      marketHomeMargin = marketFavorite === 'home' ? Math.abs(marketSpread) : -Math.abs(marketSpread);
    }
    
    // This difference should now be meaningful
    const marginDifference = modelHomeMargin - marketHomeMargin;
    const spreadThreshold = 2.0; // Increased threshold for pickiness
    
    let spreadPick;
    let displayedSpread;
    
    if (Math.abs(marginDifference) < spreadThreshold) {
      spreadPick = 'push'; // Model sees no clear edge
    } else if (marginDifference > spreadThreshold) {
      spreadPick = homeCode; // Model likes home team more than market
    } else {
      spreadPick = awayCode; // Model likes away team more than market
    }
    
    // Clean display values
    displayedSpread = Math.abs(marketSpread || predictedSpread);
    
    const spreadEdge = Math.abs(marginDifference);
    const spreadConfidence = calculateConfidence(0.6, 0.52, spreadEdge / 14, avgConfidence, avgEvidence, scoreDifference, 'spread', gameContext);

    const predictedTotal = calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread, homeScoreData.specialTeams, awayScoreData.specialTeams);
    const marketTotal = hasLiveOdds ? (realOdds.total_line || 44) : 44;
    const totalDifference = predictedTotal - marketTotal;
    const totalPick = predictedTotal > marketTotal ? 'over' : 'under';
    const totalEdge = Math.abs(totalDifference);
    const totalConfidence = calculateConfidence(0.6, 0.52, totalEdge / 10, avgConfidence, avgEvidence, 0, 'total', gameContext);

    return {
      ...game,
      predictions: {
        home_win_prob: Number(homeWinProb.toFixed(3)),
        away_win_prob: Number(awayWinProb.toFixed(3)),
        moneyline: { pick: mlPick, confidence: mlConfidence, edge: Number((mlEdge * 100).toFixed(1)) },
        spread: { 
          pick: spreadPick, 
          confidence: spreadConfidence, 
          line: displayedSpread,
          predicted: Number(Math.abs(predictedSpread).toFixed(1)),
          edge: Number(spreadEdge.toFixed(1)),
          model_home_margin: Number(modelHomeMargin.toFixed(1))
        },
        total: { pick: totalPick, confidence: totalConfidence, line: marketTotal, predicted: Number(predictedTotal.toFixed(1)), edge: Number(totalEdge.toFixed(1)) }
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
        version: 'v13_critical_fixes',
        fixesApplied: [
          "Deterministic special teams (no Math.random)",
          "Reduced multipliers (CORE_EPA 30→24, TIER_BASE 10→8)",
          "Z-score clipping (±2.5 max)",
          "NaN shield for league stats",
          "Fixed spread calculation logic",
          "No input mutation (pure functions)",
          "Improved spread threshold (2.0 points)"
        ],
        diagnostics: {
          homeScore: homeScoreData.score.toFixed(2),
          awayScore: awayScoreData.score.toFixed(2),
          scoreDiff: scoreDifference.toFixed(2),
          marginDiff: marginDifference.toFixed(2),
          spreadPick: spreadPick
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
    console.error('Enhanced prediction v13 error:', error);
    
    return new Response(JSON.stringify({
      error: 'Enhanced prediction generation failed',
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
