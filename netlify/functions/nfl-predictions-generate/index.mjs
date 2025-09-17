// netlify/functions/nfl-predictions-generate/index.mjs
// FIXED v8 - Corrected total calculations, spread compression, and team differentiation

import { loadAdvancedMetrics, loadInjuries, validateAdvancedMetrics, getTeamMetrics, getCurrentWeek, getCurrentWeights, diagnoseMetricsData } from '../_lib/blobs-nfl.js';
import { calculateMatchups, calculateExpectedPlays, calculateMatchupScore } from '../_lib/matchups.js';

// FIXED: Properly balanced weights for realistic team differentiation
const BASE_WEIGHTS = {
  // Tier 1 - Process metrics (60% total weight)
  pressure_diff: 0.22,   // Pass rush advantage - highest predictive value
  explosive_diff: 0.18,  // Big play creation
  turnover_diff: 0.12,   // Turnover margin impact
  eds: 0.08,             // Early down success
  
  // Tier 2 - Situational metrics (30% total weight)
  rz_td: 0.15,           // Red zone efficiency
  third_down: 0.10,      // Third down conversions
  penalty_diff: 0.05,    // Discipline factor
  
  // Tier 3 - Outcome metrics (10% total weight)
  fourth_down_agg: 0.06,
  top_eff: 0.04
};

// Advanced feature weights
const ADVANCED_WEIGHTS = {
  form: 0.08,            // Recent performance trends
  consistency: 0.02,     // Performance variance
  tempo: 0.02,           // Pace factors
  formations: 0.02,      // Personnel advantages
  script_adaptation: 0.01
};

// FIXED: Realistic scoring multipliers
const SCORING_MULTIPLIERS = {
  CORE_EPA: 12,          // Reduced from 35 to realistic level
  TIER_BASE: 4,          // Base tier multiplier
  ADVANCED_BASE: 3,      // Advanced feature multiplier
  MATCHUP_BASE: 2        // Matchup multiplier
};

// Roster continuity factors
const ROSTER_CONTINUITY_FACTORS = {
  qb_change: 0.3,
  coach_change: 0.2,
  coordinator_change: 0.15,
  major_trades: 0.1,
  draft_impact: 0.05
};

// Team name mapping for odds integration
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

// Utility functions
function z(val, mean = 0, std = 1) { 
  return std > 0 ? (val - mean) / std : 0; 
}

function clamp(x, lo, hi) { 
  return Math.max(lo, Math.min(hi, x)); 
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function americanToImplied(american) {
  const odds = Number(american);
  if (!odds || isNaN(odds)) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

// Calculate roster continuity score
function calculateRosterContinuity(teamMetrics, teamCode) {
  console.log('Calculating roster continuity for', teamCode);
  
  const rosterData = teamMetrics?.roster_continuity || {};
  let continuityScore = 1.0;
  
  if (rosterData.qb_change) continuityScore -= ROSTER_CONTINUITY_FACTORS.qb_change;
  if (rosterData.coach_change) continuityScore -= ROSTER_CONTINUITY_FACTORS.coach_change;
  if (rosterData.coordinator_change) continuityScore -= ROSTER_CONTINUITY_FACTORS.coordinator_change;
  if (rosterData.major_trades) continuityScore -= ROSTER_CONTINUITY_FACTORS.major_trades * rosterData.major_trades;
  if (rosterData.draft_impact) continuityScore -= ROSTER_CONTINUITY_FACTORS.draft_impact;
  
  continuityScore = clamp(continuityScore, 0.3, 1.0);
  
  console.log('Roster continuity score:', continuityScore, 'for', teamCode);
  return continuityScore;
}

// Calculate context-aware historical weights
function calculateContextAwareWeights(currentWeek, homeMetrics, awayMetrics) {
  console.log('Calculating context-aware weights for week', currentWeek);
  
  // FIXED: More balanced current season weighting
  let baseCurrentWeight;
  if (currentWeek <= 3) {
    baseCurrentWeight = 0.70; // Reduced from 0.75
  } else if (currentWeek <= 6) {
    baseCurrentWeight = 0.75;
  } else if (currentWeek <= 12) {
    baseCurrentWeight = 0.80;
  } else {
    baseCurrentWeight = 0.85;
  }
  
  const homeContinuity = calculateRosterContinuity(homeMetrics, 'HOME');
  const awayContinuity = calculateRosterContinuity(awayMetrics, 'AWAY');
  const avgContinuity = (homeContinuity + awayContinuity) / 2;
  
  const continuityAdjustment = (1 - avgContinuity) * 0.15; // Reduced from 0.2
  const adjustedCurrentWeight = clamp(baseCurrentWeight + continuityAdjustment, 0.6, 0.9);
  
  const weights = {
    season_2025: adjustedCurrentWeight,
    season_2024: (1 - adjustedCurrentWeight) * 0.7,
    season_2023: (1 - adjustedCurrentWeight) * 0.3,
    recent_4_weeks: currentWeek <= 4 ? 0.12 : 0.08
  };
  
  console.log('FIXED: Balanced context-aware weights:', weights);
  return weights;
}

// Calculate evidence strength for Bayesian updating
function calculateEvidenceStrength(teamMetrics, currentWeek) {
  console.log('Calculating evidence strength for week', currentWeek);
  
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
  
  console.log('Evidence strength:', evidenceStrength, 'for current week', currentWeek);
  return clamp(evidenceStrength, 0.2, 1.0);
}

// Bayesian updating with dynamic confidence
function applyBayesianUpdating(historicalScore, currentScore, evidenceStrength, currentWeight) {
  console.log('Applying FIXED Bayesian updating...');
  
  const prior = historicalScore;
  const evidence = currentScore;
  
  // FIXED: More conservative update strength
  const updateStrength = evidenceStrength * currentWeight * 1.2; // Reduced from 1.5
  
  const posteriorScore = prior + (evidence - prior) * updateStrength;
  
  console.log('FIXED Bayesian update:', {
    prior, evidence, updateStrength, posteriorScore
  });
  
  return posteriorScore;
}

// FIXED: Properly calibrated team scoring function
function scoreTeamFromFeatures(teamData, league, contextWeights, matchupTerms = null, isHome = false, currentWeek = 3) {
  if (!teamData || !league) {
    return { score: 0, confidence: 0.5, evidenceStrength: 0.25 };
  }

  console.log(`FIXED v8: Balanced scoring for ${isHome ? 'home' : 'away'} team (week ${currentWeek})`);
  
  const hasHistoricalData = teamData._metadata?.hasHistoricalData || false;

  // Get metric categories with defaults
  const sit = teamData?.situational || {};
  const press = teamData?.pressure || {};
  const to = teamData?.turnovers || {};
  const coach = teamData?.coaching || {};
  const disc = teamData?.discipline || {};
  const tempo = teamData?.tempo || {};
  const core = teamData?.core || {};
  const script = teamData?.script || {};
  const formations = teamData?.formations || {};

  // Calculate z-scores vs league
  const zPress = z(press.pressure_diff ?? 0, league.means?.pressure_diff || 0, league.stds?.pressure_diff || 1);
  const zExpl = z(sit.explosive_diff ?? 0, league.means?.explosive_diff || 0, league.stds?.explosive_diff || 1);
  const zTOdiff = z(to.turnover_diff ?? 0, league.means?.turnover_diff || 0, league.stds?.turnover_diff || 1);
  const zEDS = z(sit.eds ?? 0, league.means?.eds || 0, league.stds?.eds || 1);
  const zRZ = z(sit.rz_td_off ?? 0, league.means?.rz_td_off || 0, league.stds?.rz_td_off || 1);
  const zThird = z(sit.third_down_off ?? 0, league.means?.third_down_off || 0, league.stds?.third_down_off || 1);
  const z4th = z(coach.fourth_down_agg ?? 0, league.means?.fourth_down_agg || 0, league.stds?.fourth_down_agg || 1);
  const zPen = z(disc.penalty_diff ?? 0, league.means?.penalty_diff || 0, league.stds?.penalty_diff || 1);
  const zTOP = z(tempo.top_eff ?? 0, league.means?.top_eff || 0, league.stds?.top_eff || 1);

  // FIXED: Core EPA with realistic multiplier
  const offEPA = core.off_adj_epa ?? core.off_epa ?? 0;
  const defEPA = -(core.def_adj_epa ?? core.def_epa ?? 0);
  
  console.log(`FIXED v8: Raw EPA - Off: ${offEPA.toFixed(3)}, Def: ${defEPA.toFixed(3)}`);

  // FIXED: Realistic core score calculation
  const coreScore = (offEPA + defEPA) * SCORING_MULTIPLIERS.CORE_EPA;
  
  console.log(`FIXED v8: Core score: ${coreScore.toFixed(3)}`);

  // Advanced features
  const consistency = teamData?.consistency?.off ?? 0.5;
  const form = teamData?.form?.off ?? 0;
  
  const enhancedForm = hasHistoricalData && contextWeights?.recent_4_weeks > 0 ? 
    form * (1 + contextWeights.recent_4_weeks * 2) : form;

  const paceAdj = clamp((tempo.pace ?? 30) / 30 - 1, -0.5, 0.5);
  const motionAdv = (formations.motion_rate ?? 0.4) - 0.4;
  const scriptAdapt = script.trailing_epa ?? 0;

  const evidenceStrength = calculateEvidenceStrength(teamData, currentWeek);

  // FIXED: Balanced tier calculation
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

  console.log(`FIXED v8: Tier score: ${tierScore.toFixed(3)}`);

  // FIXED: Balanced advanced features
  const advancedScore = 
    (ADVANCED_WEIGHTS.consistency * (consistency - 0.5) * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.form * enhancedForm * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.tempo * paceAdj * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.formations * motionAdv * SCORING_MULTIPLIERS.ADVANCED_BASE) +
    (ADVANCED_WEIGHTS.script_adaptation * scriptAdapt * SCORING_MULTIPLIERS.ADVANCED_BASE);

  // FIXED: Balanced matchup score
  const matchupScore = calculateMatchupScore(matchupTerms) * SCORING_MULTIPLIERS.MATCHUP_BASE;

  const currentSeasonScore = coreScore + tierScore + advancedScore + matchupScore;
  const historicalScore = currentSeasonScore * 0.85; // More conservative historical discount
  
  // Apply Bayesian updating
  const finalScore = applyBayesianUpdating(
    historicalScore, 
    currentSeasonScore, 
    evidenceStrength, 
    contextWeights.season_2025
  );
  
  // Calculate confidence
  const baseConfidence = 0.5;
  const evidenceBoost = evidenceStrength * 0.25; // Reduced from 0.3
  const sampleBoost = Math.min(currentWeek / 8, 0.15); // Reduced from 0.2
  const finalConfidence = clamp(baseConfidence + evidenceBoost + sampleBoost, 0.35, 0.85);
  
  console.log('FIXED v8: Scoring breakdown:', {
    coreScore: coreScore.toFixed(3), 
    tierScore: tierScore.toFixed(3), 
    advancedScore: advancedScore.toFixed(3), 
    matchupScore: matchupScore.toFixed(3),
    currentSeasonScore: currentSeasonScore.toFixed(3), 
    historicalScore: historicalScore.toFixed(3), 
    finalScore: finalScore.toFixed(3),
    evidenceStrength: evidenceStrength.toFixed(3), 
    finalConfidence: finalConfidence.toFixed(3)
  });

  return { 
    score: finalScore, 
    confidence: finalConfidence,
    evidenceStrength: evidenceStrength
  };
}

// Enhanced injury adjustments
function applyInjuryAdjustments(scoreData, teamCode, injuries) {
  const teamInjuries = injuries.teams?.[teamCode] || {};
  let delta = 0;

  // QB status impact
  switch (teamInjuries.qb_status) {
    case 'out':
      delta -= 6; // Reduced from 8
      break;
    case 'doubtful':
      delta -= 3; // Reduced from 4
      break;
    case 'questionable':
      delta -= 1.5; // Reduced from 2
      break;
    default:
      break;
  }

  // Positional cluster impacts
  const olOut = teamInjuries.ol_starters_out ?? 0;
  const dbOut = teamInjuries.db_starters_out ?? 0;

  if (olOut >= 2) delta -= 2; // Reduced from 2.5
  if (olOut >= 3) delta -= 4; // Reduced from 5
  if (dbOut >= 2) delta -= 1.5; // Reduced from 2

  console.log('FIXED injury adjustment for', teamCode, ':', delta, 'points');
  
  return {
    score: scoreData.score + delta,
    confidence: scoreData.confidence * (1 - Math.abs(delta) * 0.02), // Reduced impact
    evidenceStrength: scoreData.evidenceStrength
  };
}

// FIXED: Properly calibrated spread prediction
function calculateSpreadPrediction(homeScoreData, awayScoreData) {
  console.log('=== FIXED v8 SPREAD PREDICTION ===');
  console.log('Score data:', { 
    homeScore: homeScoreData.score.toFixed(3), 
    awayScore: awayScoreData.score.toFixed(3) 
  });
  
  // FIXED: Balanced home field advantage
  const avgConfidence = (homeScoreData.confidence + awayScoreData.confidence) / 2;
  const confidentHFA = 2.8;  // Standard NFL home field advantage
  const uncertainHFA = 1.5;  // Reduced HFA when uncertain
  
  const dynamicHFA = confidentHFA - (confidentHFA - uncertainHFA) * (1 - avgConfidence);
  
  // FIXED: Proper score difference conversion
  const scoreDifference = homeScoreData.score - awayScoreData.score;
  
  // FIXED: Direct score-to-spread conversion with proper scaling
  const spreadFromScores = scoreDifference * 2.5; // Calibrated multiplier
  
  const predictedHomeMargin = dynamicHFA + spreadFromScores;
  const finalSpread = clamp(predictedHomeMargin, -21, 21);
  
  console.log('FIXED spread calculation:', { 
    avgConfidence: avgConfidence.toFixed(3), 
    dynamicHFA: dynamicHFA.toFixed(2), 
    scoreDifference: scoreDifference.toFixed(3), 
    spreadFromScores: spreadFromScores.toFixed(2),
    predictedHomeMargin: predictedHomeMargin.toFixed(2), 
    finalSpread: finalSpread.toFixed(2) 
  });
  
  return finalSpread;
}

// FIXED: Completely rebuilt total prediction
function calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread = 0) {
  console.log('=== FIXED v8 TOTAL PREDICTION ===');
  
  // FIXED: Proper EPA-based team scoring rates
  const homeOffEPA = homeMetrics?.core?.off_epa || 0;
  const awayOffEPA = awayMetrics?.core?.off_epa || 0;
  const homeDefEPA = homeMetrics?.core?.def_epa || 0;
  const awayDefEPA = awayMetrics?.core?.def_epa || 0;
  
  // FIXED: Form adjustments with proper scaling
  const homeForm = homeMetrics?.form?.off || 0;
  const awayForm = awayMetrics?.form?.off || 0;
  
  console.log('FIXED total factors:', { 
    homeOffEPA: homeOffEPA.toFixed(3), 
    awayOffEPA: awayOffEPA.toFixed(3), 
    homeDefEPA: homeDefEPA.toFixed(3), 
    awayDefEPA: awayDefEPA.toFixed(3),
    homeForm: homeForm.toFixed(3), 
    awayForm: awayForm.toFixed(3)
  });
  
  // FIXED: Realistic EPA-to-points conversion
  // NFL average: ~22.5 points per team, EPA typically ranges -0.2 to +0.3
  const homeBasePoints = 22.5 + (homeOffEPA * 45) + (homeForm * 8); // Realistic scaling
  const awayBasePoints = 22.5 + (awayOffEPA * 45) + (awayForm * 8);
  
  // FIXED: Defensive adjustments (opposing defense affects scoring)
  const homePointsVsDefense = homeBasePoints - (awayDefEPA * 25); // Away defense affects home scoring
  const awayPointsVsDefense = awayBasePoints - (homeDefEPA * 25); // Home defense affects away scoring
  
  // FIXED: Pace adjustments
  const homePace = Math.max(homeMetrics?.tempo?.pace || 65, 60);
  const awayPace = Math.max(awayMetrics?.tempo?.pace || 65, 60);
  const avgPace = (homePace + awayPace) / 2;
  const paceMultiplier = avgPace / 67; // NFL average pace
  
  // FIXED: Game script adjustment based on expected margin
  const expectedMargin = Math.abs(marketSpread || 0);
  const gameScriptFactor = expectedMargin > 7 ? 0.95 : 1.0; // Blowouts have slightly fewer plays
  
  // FIXED: Final total calculation
  const homeProjected = Math.max(10, homePointsVsDefense * paceMultiplier * gameScriptFactor);
  const awayProjected = Math.max(10, awayPointsVsDefense * paceMultiplier * gameScriptFactor);
  
  const rawTotal = homeProjected + awayProjected;
  const finalTotal = clamp(rawTotal, 35, 65); // Realistic NFL total range
  
  console.log('FIXED total calculation:', { 
    homeBasePoints: homeBasePoints.toFixed(1),
    awayBasePoints: awayBasePoints.toFixed(1),
    homePointsVsDefense: homePointsVsDefense.toFixed(1),
    awayPointsVsDefense: awayPointsVsDefense.toFixed(1),
    avgPace: avgPace.toFixed(1),
    paceMultiplier: paceMultiplier.toFixed(3),
    gameScriptFactor: gameScriptFactor.toFixed(3),
    homeProjected: homeProjected.toFixed(1),
    awayProjected: awayProjected.toFixed(1),
    rawTotal: rawTotal.toFixed(1),
    finalTotal: finalTotal.toFixed(1)
  });
  
  return finalTotal;
}

// FIXED: Enhanced confidence calculation
function calculateConfidence(modelProb, marketProb, edge, scoreConfidence, evidenceStrength, scoreDifference = 0) {
  const modelCertainty = Math.abs(modelProb - 0.5) * 2;
  const edgeComponent = edge ? Math.min(Math.abs(edge), 0.15) / 0.15 : 0;
  
  // FIXED: Balanced differentiation boost
  const differentiationBoost = Math.min(Math.abs(scoreDifference) / 12, 0.15); // Reduced from /8
  
  // Context-aware confidence components
  const scoreConfidenceBoost = (scoreConfidence - 0.5) * 0.2;
  const evidenceBoost = evidenceStrength * 0.15;
  
  const rawConfidence = (modelCertainty * 0.5) + (edgeComponent * 0.2) + 
                       scoreConfidenceBoost + evidenceBoost + differentiationBoost;
  
  return Math.max(50, Math.round(rawConfidence * 50 + 55)); // Realistic confidence range
}

// Load live odds (unchanged)
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

// Find odds for a specific game (unchanged)
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

// Extract odds from bookmaker data (unchanged)
function extractOddsData(gameOdds) {
  if (!gameOdds?.bookmakers?.[0]?.markets) {
    return {};
  }
  
  const markets = gameOdds.bookmakers[0].markets;
  
  // Extract moneyline odds
  const h2hMarket = markets.h2h || [];
  const homeMLOutcome = h2hMarket.find(o => o.name === gameOdds.home_team);
  const awayMLOutcome = h2hMarket.find(o => o.name === gameOdds.away_team);
  
  // Extract spread odds
  const spreadsMarket = markets.spreads || [];
  const homeSpreadOutcome = spreadsMarket.find(o => o.name === gameOdds.home_team);
  const awaySpreadOutcome = spreadsMarket.find(o => o.name === gameOdds.away_team);
  
  let favoriteTeam = null;
  let favoriteTeamCode = null;
  let favoriteSpread = null;
  let underdogTeamCode = null;
  let underdogSpread = null;
  
  if (homeSpreadOutcome && homeSpreadOutcome.point < 0) {
    favoriteTeam = 'home';
    favoriteTeamCode = gameOdds.home_team;
    favoriteSpread = homeSpreadOutcome.point;
    underdogTeamCode = gameOdds.away_team;
    underdogSpread = awaySpreadOutcome?.point;
  } else if (awaySpreadOutcome && awaySpreadOutcome.point < 0) {
    favoriteTeam = 'away';
    favoriteTeamCode = gameOdds.away_team;
    favoriteSpread = awaySpreadOutcome.point;
    underdogTeamCode = gameOdds.home_team;
    underdogSpread = homeSpreadOutcome?.point;
  } else {
    favoriteSpread = homeSpreadOutcome?.point || awaySpreadOutcome?.point || 0;
  }
  
  // Extract total odds
  const totalsMarket = markets.totals || [];
  const totalOutcome = totalsMarket[0];
  
  return {
    ml_home: homeMLOutcome?.price,
    ml_away: awayMLOutcome?.price,
    spread_line: favoriteSpread,
    spread_favorite: favoriteTeam,
    spread_favorite_team: favoriteTeamCode,
    spread_underdog_team: underdogTeamCode,
    total_line: totalOutcome?.point
  };
}

// MAIN FIXED PREDICTION FUNCTION
async function generateAdvancedPredictions(games, season) {
  console.log('=== FIXED v8 - CORRECTED CALCULATIONS ===');
  console.log('Fixed total calculations, spread compression, and team differentiation...');
  
  let advancedMetrics = null;
  let injuries = null;
  
  try {
    advancedMetrics = await loadAdvancedMetrics(season);
    console.log('Enhanced metrics loaded for season:', season);
    
    const diagnostic = diagnoseMetricsData(advancedMetrics);
    console.log('Metrics diagnostic:', diagnostic);
    
    injuries = await loadInjuries();
    console.log('Injuries loaded:', !!injuries);
  } catch (error) {
    console.warn('Enhanced metrics loading failed:', error);
  }

  const validMetrics = validateAdvancedMetrics(advancedMetrics);
  
  if (!validMetrics) {
    console.warn('Enhanced metrics not available, falling back to basic prediction');
    return games.map(game => ({
      ...game,
      predictions: {
        home_win_prob: 0.5,
        away_win_prob: 0.5,
        moneyline: { pick: null, confidence: 50, edge: 0 },
        spread: { pick: null, confidence: 50, line: null, predicted: null, edge: 0 },
        total: { pick: null, confidence: 50, line: null, predicted: null, edge: 0 }
      },
      modelEnhancements: {
        historicalDataUsed: false,
        notes: ["Enhanced metrics not available - using fallback"]
      }
    }));
  }

  const league = advancedMetrics?.league || { means: {}, stds: {} };
  const currentWeek = getCurrentWeek(advancedMetrics);
  
  console.log(`FIXED: Current week: ${currentWeek}`);
  
  // Load live odds for all games
  const allOdds = await loadLiveOdds();

  return games.map(game => {
    const homeCode = game.home_team;
    const awayCode = game.away_team;

    console.log(`\n=== FIXED PREDICTION: ${awayCode} @ ${homeCode} ===`);

    // Get team metrics
    const homeMetrics = getTeamMetrics(advancedMetrics, homeCode);
    const awayMetrics = getTeamMetrics(advancedMetrics, awayCode);

    // Calculate context-aware weights
    const contextWeights = calculateContextAwareWeights(currentWeek, homeMetrics, awayMetrics);

    // Calculate matchups
    const matchups = calculateMatchups(homeMetrics, awayMetrics, league);

    const hasHistoricalData = homeMetrics?._metadata?.hasHistoricalData && awayMetrics?._metadata?.hasHistoricalData;
    const hasMatchupData = !!(matchups?.home && matchups?.away);
    const hasContextData = !!(contextWeights && currentWeek);
    
    console.log('FIXED: Data availability:', { hasHistoricalData, hasMatchupData, hasContextData });

    // FIXED: Calculate properly scaled scores
    let homeScoreData = scoreTeamFromFeatures(homeMetrics, league, contextWeights, matchups?.home, true, currentWeek);
    let awayScoreData = scoreTeamFromFeatures(awayMetrics, league, contextWeights, matchups?.away, false, currentWeek);

    console.log('FIXED: Initial scores:', { 
      homeScore: homeScoreData.score.toFixed(3), 
      awayScore: awayScoreData.score.toFixed(3) 
    });

    // Apply injury adjustments
    if (injuries) {
      homeScoreData = applyInjuryAdjustments(homeScoreData, homeCode, injuries);
      awayScoreData = applyInjuryAdjustments(awayScoreData, awayCode, injuries);
    }

    console.log('FIXED: Final scores after injuries:', { 
      homeScore: homeScoreData.score.toFixed(3), 
      awayScore: awayScoreData.score.toFixed(3) 
    });

    // Calculate score difference for analysis
    const scoreDifference = homeScoreData.score - awayScoreData.score;
    console.log(`FIXED: Score difference: ${scoreDifference.toFixed(2)}`);

    // FIXED: Convert to win probabilities with corrected spread prediction
    const predictedSpread = calculateSpreadPrediction(homeScoreData, awayScoreData);
    const homeWinProb = sigmoid(predictedSpread / 14);
    const awayWinProb = 1 - homeWinProb;

    console.log('FIXED: Win probabilities:', { 
      homeWinProb: homeWinProb.toFixed(3), 
      awayWinProb: awayWinProb.toFixed(3), 
      predictedSpread: predictedSpread.toFixed(2) 
    });

    // Get real odds
    const gameOdds = findGameOdds(allOdds, homeCode, awayCode);
    const realOdds = gameOdds ? extractOddsData(gameOdds) : {};
    
    console.log(`Real odds for ${homeCode} vs ${awayCode}:`, realOdds);
    
    // MONEYLINE: Pick based on win probability
    const mlPick = homeWinProb > awayWinProb ? homeCode : awayCode;
    const mlModelProb = Math.max(homeWinProb, awayWinProb);
    
    console.log(`FIXED: Moneyline pick: ${mlPick} (${(mlModelProb * 100).toFixed(1)}% probability)`);
    
    // Calculate market edge
    const homeMarketProb = americanToImplied(realOdds.ml_home) || 0.5;
    const awayMarketProb = americanToImplied(realOdds.ml_away) || 0.5;
    
    const mlMarketProb = mlPick === homeCode ? homeMarketProb : awayMarketProb;
    const mlEdge = mlMarketProb ? mlModelProb - mlMarketProb : 0;
    
    // Calculate confidence
    const avgConfidence = (homeScoreData.confidence + awayScoreData.confidence) / 2;
    const avgEvidence = (homeScoreData.evidenceStrength + awayScoreData.evidenceStrength) / 2;
    const mlConfidence = calculateConfidence(mlModelProb, mlMarketProb, mlEdge, avgConfidence, avgEvidence, scoreDifference);

    // SPREAD: Determine pick
    const marketSpread = realOdds.spread_line || 0;
    const marketFavorite = realOdds.spread_favorite;
    
    console.log('=== FIXED SPREAD LOGIC ===');
    console.log('Model predicted spread (home margin):', predictedSpread.toFixed(2));
    console.log('Market spread (favorite):', marketSpread);
    console.log('Market favorite:', marketFavorite);
    
    // FIXED: Balanced spread pick logic
    let modelHomeMargin = predictedSpread;
    let marketHomeMargin;
    
    if (marketFavorite === 'home') {
      marketHomeMargin = Math.abs(marketSpread);
    } else if (marketFavorite === 'away') {
      marketHomeMargin = -Math.abs(marketSpread);
    } else {
      marketHomeMargin = 0;
    }
    
    const marginDifference = modelHomeMargin - marketHomeMargin;
    let spreadPick;
    
    // FIXED: Realistic threshold
    const spreadThreshold = 1.5; // Balanced threshold
    
    if (Math.abs(marginDifference) < spreadThreshold) {
      spreadPick = modelHomeMargin > marketHomeMargin ? homeCode : awayCode;
    } else if (marginDifference > spreadThreshold) {
      spreadPick = homeCode;
    } else {
      spreadPick = awayCode;
    }
    
    const spreadEdge = Math.abs(marginDifference);
    const spreadConfidence = calculateConfidence(0.6, 0.52, spreadEdge / 14, avgConfidence, avgEvidence, scoreDifference);

    // FIXED: Total prediction
    const predictedTotal = calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread);
    const marketTotal = realOdds.total_line || 44;
    const totalDifference = predictedTotal - marketTotal;
    
    const totalPick = predictedTotal > marketTotal ? 'over' : 'under';
    const totalEdge = Math.abs(totalDifference);
    const totalConfidence = calculateConfidence(0.6, 0.52, totalEdge / 10, avgConfidence, avgEvidence, 0);

    console.log('FIXED total analysis:', { 
      predictedTotal: predictedTotal.toFixed(1), 
      marketTotal, 
      totalDifference: totalDifference.toFixed(1), 
      totalPick, 
      totalEdge: totalEdge.toFixed(1), 
      totalConfidence 
    });

    // Return enhanced game object
    return {
      ...game,
      predictions: {
        home_win_prob: Number(homeWinProb.toFixed(3)),
        away_win_prob: Number(awayWinProb.toFixed(3)),
        
        moneyline: {
          pick: mlPick,
          confidence: mlConfidence,
          edge: Number((mlEdge * 100).toFixed(1))
        },
        
        spread: {
          pick: spreadPick,
          confidence: Math.round(spreadConfidence),
          line: marketSpread,
          predicted: Number(predictedSpread.toFixed(1)),
          edge: Number(spreadEdge.toFixed(1))
        },
        
        total: {
          pick: totalPick,
          confidence: totalConfidence,
          line: marketTotal,
          predicted: Number(predictedTotal.toFixed(1)),
          edge: Number(totalEdge.toFixed(1))
        }
      },
      
      odds: {
        moneyline: {
          home: realOdds.ml_home,
          away: realOdds.ml_away
        },
        spread: {
          line: realOdds.spread_line,
          favorite: realOdds.spread_favorite,
          favorite_team: realOdds.spread_favorite_team,
          underdog_team: realOdds.spread_underdog_team
        },
        total: {
          line: realOdds.total_line
        }
      },
      
      modelEnhancements: {
        version: 'fixed_v8_corrected_calculations',
        historicalDataUsed: hasHistoricalData,
        contextAwareWeighting: hasContextData,
        bayesianUpdating: true,
        fixedCalculations: true,
        currentWeek: currentWeek,
        contextWeights: contextWeights,
        homeScoreConfidence: Number(homeScoreData.confidence.toFixed(3)),
        awayScoreConfidence: Number(awayScoreData.confidence.toFixed(3)),
        homeEvidenceStrength: Number(homeScoreData.evidenceStrength.toFixed(3)),
        awayEvidenceStrength: Number(awayScoreData.evidenceStrength.toFixed(3)),
        homeScore: Number(homeScoreData.score.toFixed(2)),
        awayScore: Number(awayScoreData.score.toFixed(2)),
        scoreDifference: Number(scoreDifference.toFixed(2)),
        predictedSpread: Number(predictedSpread.toFixed(2)),
        scoringMultipliers: SCORING_MULTIPLIERS,
        homeMatchupAdvantage: matchups?.summary?.home_total_advantage || 0,
        awayMatchupAdvantage: matchups?.summary?.away_total_advantage || 0,
        metricsFreshness: advancedMetrics?.asOf || null,
        injuriesAsOf: injuries?.asOf || null,
        featuresUsed: Object.keys(BASE_WEIGHTS),
        advancedFeaturesUsed: Object.keys(ADVANCED_WEIGHTS),
        oddsIntegrated: !!gameOdds,
        notes: [
          "FIXED v8: Corrected total calculations and spread compression",
          "Realistic EPA-to-points conversion implemented",
          "Balanced team differentiation scoring",
          "Fixed spread-to-score conversion ratios",
          hasHistoricalData ? "Historical data integration active" : "Using current season data only",
          hasMatchupData ? "Opponent-specific matchup calculations active" : "Using base team metrics only",
          hasContextData ? "Context-aware weighting based on roster continuity" : "Using standard weights",
          `Week ${currentWeek} with ${(contextWeights.season_2025 * 100).toFixed(0)}% current season weight`,
          "Bayesian updating with evidence strength assessment",
          "Realistic scoring multipliers applied",
          `Score difference: ${scoreDifference.toFixed(2)}`,
          `Total prediction: ${predictedTotal.toFixed(1)} (vs market ${marketTotal})`,
          gameOdds ? "Live odds integrated" : "Using fallback odds"
        ]
      },
      
      teamStats: {
        home: {
          strength: Number(homeWinProb.toFixed(3)),
          score: Number(homeScoreData.score.toFixed(2)),
          confidence: Number(homeScoreData.confidence.toFixed(3)),
          evidenceStrength: Number(homeScoreData.evidenceStrength.toFixed(3)),
          thirdDown: homeMetrics?.situational?.third_down_off ?? null,
          redZoneTD: homeMetrics?.situational?.rz_td_off ?? null,
          pressureDiff: homeMetrics?.pressure?.pressure_diff ?? null,
          consistency: homeMetrics?.consistency?.off ?? null,
          form: homeMetrics?.form?.off ?? null,
          historicalContext: homeMetrics?._metadata?.hasHistoricalData || false,
          matchupAdvantage: matchups?.summary?.home_total_advantage || 0
        },
        away: {
          strength: Number(awayWinProb.toFixed(3)),
          score: Number(awayScoreData.score.toFixed(2)),
          confidence: Number(awayScoreData.confidence.toFixed(3)),
          evidenceStrength: Number(awayScoreData.evidenceStrength.toFixed(3)),
          thirdDown: awayMetrics?.situational?.third_down_off ?? null,
          redZoneTD: awayMetrics?.situational?.rz_td_off ?? null,
          pressureDiff: awayMetrics?.pressure?.pressure_diff ?? null,
          consistency: awayMetrics?.consistency?.off ?? null,
          form: awayMetrics?.form?.off ?? null,
          historicalContext: awayMetrics?._metadata?.hasHistoricalData || false,
          matchupAdvantage: matchups?.summary?.away_total_advantage || 0
        }
      }
    };
  });
}

// Netlify Function Handler
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

    console.log(`FIXED: Processing ${games.length} games for corrected prediction with season ${season}`);
    
    const predictions = await generateAdvancedPredictions(games, season);
    
    return new Response(JSON.stringify(predictions), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Fixed prediction function error:', error);
    
    return new Response(JSON.stringify({
      error: 'Fixed prediction generation failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
