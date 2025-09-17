// netlify/functions/nfl-predictions-generate/index.mjs
// HYBRID v7 - EMERGENCY FIX: Massive team differentiation amplification

import { loadAdvancedMetrics, loadInjuries, validateAdvancedMetrics, getTeamMetrics, getCurrentWeek, getCurrentWeights, diagnoseMetricsData } from '../_lib/blobs-nfl.js';
import { calculateMatchups, calculateExpectedPlays, calculateMatchupScore } from '../_lib/matchups.js';

// EMERGENCY: Dramatically increased weights for maximum differentiation
const BASE_WEIGHTS = {
  // Tier 1 - Process metrics with MASSIVE amplification
  pressure_diff: 0.25,   // Increased from 0.18 - highest weight
  explosive_diff: 0.20,  // Increased from 0.15
  turnover_diff: 0.15,   // Increased from 0.12
  eds: 0.12,             // Increased from 0.10
  
  // Tier 2 - Reduced outcome metrics for early season
  rz_td: 0.15,           // Keep at 0.15
  third_down: 0.08,      // Reduced from 0.10
  penalty_diff: 0.02,    // Reduced from 0.05
  
  // Tier 3 - Minimal weight for noisy metrics
  fourth_down_agg: 0.02, // Reduced from 0.08
  top_eff: 0.01          // Reduced from 0.07
};

// Advanced feature weights with enhanced early season focus
const ADVANCED_WEIGHTS = {
  form: 0.08,            // Increased recent form impact
  consistency: 0.01,     // Minimal - unreliable early season
  tempo: 0.02,           // Increased - stabilizes quickly  
  formations: 0.02,      // Increased - process metric
  script_adaptation: 0.01
};

// EMERGENCY: Massive amplification factors
const AMPLIFICATION_FACTORS = {
  CORE_EPA: 35,          // Increased from 16 to 35
  TIER_MULTIPLIER: 8,    // Increased from 3-5 to 8
  ADVANCED_MULTIPLIER: 6, // Increased from 3 to 6
  MATCHUP_MULTIPLIER: 4  // Increased from 3 to 4
};

// NEW: Roster continuity factors for context-aware weighting
const ROSTER_CONTINUITY_FACTORS = {
  qb_change: 0.3,        // Major QB change reduces historical weight
  coach_change: 0.2,     // New coaching staff reduces historical weight
  coordinator_change: 0.15, // OC/DC change moderately reduces historical weight
  major_trades: 0.1,     // Significant roster moves
  draft_impact: 0.05     // High draft picks making immediate impact
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

// NEW: Calculate roster continuity score for context-aware weighting
function calculateRosterContinuity(teamMetrics, teamCode) {
  console.log('Calculating roster continuity for', teamCode);
  
  // Check for major changes (this would come from offseason data)
  const rosterData = teamMetrics?.roster_continuity || {};
  
  let continuityScore = 1.0; // Start with full continuity
  
  // Apply continuity factors based on changes
  if (rosterData.qb_change) continuityScore -= ROSTER_CONTINUITY_FACTORS.qb_change;
  if (rosterData.coach_change) continuityScore -= ROSTER_CONTINUITY_FACTORS.coach_change;
  if (rosterData.coordinator_change) continuityScore -= ROSTER_CONTINUITY_FACTORS.coordinator_change;
  if (rosterData.major_trades) continuityScore -= ROSTER_CONTINUITY_FACTORS.major_trades * rosterData.major_trades;
  if (rosterData.draft_impact) continuityScore -= ROSTER_CONTINUITY_FACTORS.draft_impact;
  
  continuityScore = clamp(continuityScore, 0.3, 1.0); // Minimum 30% historical weight
  
  console.log('Roster continuity score:', continuityScore, 'for', teamCode);
  return continuityScore;
}

// NEW: Calculate context-aware historical weights based on team situation
function calculateContextAwareWeights(currentWeek, homeMetrics, awayMetrics) {
  console.log('Calculating context-aware weights for week', currentWeek);
  
  // EMERGENCY: Even more aggressive current season weighting
  let baseCurrentWeight;
  if (currentWeek <= 3) {
    baseCurrentWeight = 0.75; // Increased from 0.65 to 0.75
  } else if (currentWeek <= 6) {
    baseCurrentWeight = 0.80;
  } else if (currentWeek <= 12) {
    baseCurrentWeight = 0.85;
  } else {
    baseCurrentWeight = 0.90;
  }
  
  // Adjust based on roster continuity
  const homeContinuity = calculateRosterContinuity(homeMetrics, 'HOME');
  const awayContinuity = calculateRosterContinuity(awayMetrics, 'AWAY');
  const avgContinuity = (homeContinuity + awayContinuity) / 2;
  
  // Lower continuity = higher current season weight
  const continuityAdjustment = (1 - avgContinuity) * 0.2; // Up to 20% boost to current season
  const adjustedCurrentWeight = clamp(baseCurrentWeight + continuityAdjustment, 0.6, 0.95);
  
  const weights = {
    season_2025: adjustedCurrentWeight,
    season_2024: (1 - adjustedCurrentWeight) * 0.7,  // 70% of remaining weight
    season_2023: (1 - adjustedCurrentWeight) * 0.3,  // 30% of remaining weight
    recent_4_weeks: currentWeek <= 4 ? 0.15 : 0.1    // Boost recent form in early season
  };
  
  console.log('EMERGENCY: Enhanced context-aware weights:', weights);
  return weights;
}

// NEW: Calculate evidence strength for Bayesian updating
function calculateEvidenceStrength(teamMetrics, currentWeek) {
  console.log('Calculating evidence strength for week', currentWeek);
  
  // Process metrics that stabilize quickly get higher evidence strength
  const processMetrics = {
    pressure_consistency: Math.abs(teamMetrics?.pressure?.pressure_diff || 0),
    explosive_consistency: Math.abs(teamMetrics?.situational?.explosive_diff || 0),
    pace_consistency: teamMetrics?.tempo?.pace_consistency || 0.5
  };
  
  // Outcome variance (lower = more reliable)
  const outcomeVariance = teamMetrics?.consistency?.variance || 0.5;
  
  // Sample size factor
  const sampleFactor = Math.min(currentWeek / 6, 1); // Reaches full strength by week 6
  
  // Calculate overall evidence strength
  const processStrength = (processMetrics.pressure_consistency + processMetrics.explosive_consistency) / 2;
  const reliabilityFactor = 1 - outcomeVariance;
  
  const evidenceStrength = (processStrength * 0.4 + reliabilityFactor * 0.3 + sampleFactor * 0.3);
  
  console.log('Evidence strength:', evidenceStrength, 'for current week', currentWeek);
  return clamp(evidenceStrength, 0.2, 1.0);
}

// NEW: Bayesian updating with dynamic confidence
function applyBayesianUpdating(historicalScore, currentScore, evidenceStrength, currentWeight) {
  console.log('Applying EMERGENCY Bayesian updating...');
  
  // Historical score is our prior belief
  const prior = historicalScore;
  
  // Current score is our new evidence
  const evidence = currentScore;
  
  // EMERGENCY: More aggressive evidence weighting
  const updateStrength = evidenceStrength * currentWeight * 1.5; // 1.5x multiplier
  
  // Bayesian update: posterior = prior + (evidence - prior) * update_strength
  const posteriorScore = prior + (evidence - prior) * updateStrength;
  
  console.log('EMERGENCY Bayesian update:', {
    prior, evidence, updateStrength, posteriorScore
  });
  
  return posteriorScore;
}

// EMERGENCY: Massively amplified team scoring function
function scoreTeamFromFeatures(teamData, league, contextWeights, matchupTerms = null, isHome = false, currentWeek = 3) {
  if (!teamData || !league) {
    return { score: 0, confidence: 0.5, evidenceStrength: 0.25 };
  }

  console.log(`EMERGENCY v7: Massively amplified scoring for ${isHome ? 'home' : 'away'} team (week ${currentWeek})`);
  
  // Check if we have historical metadata
  const hasHistoricalData = teamData._metadata?.hasHistoricalData || false;

  // Graceful defaults for all metric categories
  const sit = teamData?.situational || {};
  const press = teamData?.pressure || {};
  const to = teamData?.turnovers || {};
  const coach = teamData?.coaching || {};
  const disc = teamData?.discipline || {};
  const tempo = teamData?.tempo || {};
  const core = teamData?.core || {};
  const script = teamData?.script || {};
  const formations = teamData?.formations || {};

  // Calculate z-scores vs league (normalized features) - prioritize leading indicators
  const zPress = z(press.pressure_diff ?? 0, league.means?.pressure_diff || 0, league.stds?.pressure_diff || 1);
  const zExpl = z(sit.explosive_diff ?? 0, league.means?.explosive_diff || 0, league.stds?.explosive_diff || 1);
  const zTOdiff = z(to.turnover_diff ?? 0, league.means?.turnover_diff || 0, league.stds?.turnover_diff || 1);
  const zEDS = z(sit.eds ?? 0, league.means?.eds || 0, league.stds?.eds || 1);
  const zRZ = z(sit.rz_td_off ?? 0, league.means?.rz_td_off || 0, league.stds?.rz_td_off || 1);
  const zThird = z(sit.third_down_off ?? 0, league.means?.third_down_off || 0, league.stds?.third_down_off || 1);
  const z4th = z(coach.fourth_down_agg ?? 0, league.means?.fourth_down_agg || 0, league.stds?.fourth_down_agg || 1);
  const zPen = z(disc.penalty_diff ?? 0, league.means?.penalty_diff || 0, league.stds?.penalty_diff || 1);
  const zTOP = z(tempo.top_eff ?? 0, league.means?.top_eff || 0, league.stds?.top_eff || 1);

  // EMERGENCY: Core EPA backbone with MASSIVE amplification
  const offEPA = core.off_adj_epa ?? core.off_epa ?? 0;
  const defEPA = -(core.def_adj_epa ?? core.def_epa ?? 0);
  
  console.log(`EMERGENCY v7: Raw EPA - Off: ${offEPA}, Def: ${defEPA}`);

  // EMERGENCY: MASSIVELY amplified core score
  const coreScore = (offEPA + defEPA) * AMPLIFICATION_FACTORS.CORE_EPA;
  
  console.log(`EMERGENCY v7: Amplified core score: ${coreScore}`);

  // Advanced features with historical context  
  const consistency = teamData?.consistency?.off ?? 0.5;
  const form = teamData?.form?.off ?? 0;
  
  // Enhanced form calculation with recent games boost
  const enhancedForm = hasHistoricalData && contextWeights?.recent_4_weeks > 0 ? 
    form * (1 + contextWeights.recent_4_weeks * 2) : form;

  const paceAdj = clamp((tempo.pace ?? 30) / 30 - 1, -0.5, 0.5);
  const motionAdv = (formations.motion_rate ?? 0.4) - 0.4;
  const scriptAdapt = script.trailing_epa ?? 0;

  // Calculate evidence strength for this team
  const evidenceStrength = calculateEvidenceStrength(teamData, currentWeek);

  // EMERGENCY: Massively amplified tier calculation
  const tierScore = 
    (BASE_WEIGHTS.pressure_diff * zPress * AMPLIFICATION_FACTORS.TIER_MULTIPLIER) +
    (BASE_WEIGHTS.explosive_diff * zExpl * AMPLIFICATION_FACTORS.TIER_MULTIPLIER) +
    (BASE_WEIGHTS.turnover_diff * zTOdiff * AMPLIFICATION_FACTORS.TIER_MULTIPLIER) +
    (BASE_WEIGHTS.eds * zEDS * AMPLIFICATION_FACTORS.TIER_MULTIPLIER) +
    (BASE_WEIGHTS.rz_td * zRZ * (AMPLIFICATION_FACTORS.TIER_MULTIPLIER * 0.8)) +
    (BASE_WEIGHTS.third_down * zThird * (AMPLIFICATION_FACTORS.TIER_MULTIPLIER * 0.6)) +
    (BASE_WEIGHTS.fourth_down_agg * z4th * (AMPLIFICATION_FACTORS.TIER_MULTIPLIER * 0.4)) +
    (BASE_WEIGHTS.penalty_diff * zPen * (AMPLIFICATION_FACTORS.TIER_MULTIPLIER * 0.4)) +
    (BASE_WEIGHTS.top_eff * zTOP * (AMPLIFICATION_FACTORS.TIER_MULTIPLIER * 0.4));

  console.log(`EMERGENCY v7: Amplified tier score: ${tierScore}`);

  // EMERGENCY: Amplified advanced features
  const advancedScore = 
    (ADVANCED_WEIGHTS.consistency * (consistency - 0.5) * AMPLIFICATION_FACTORS.ADVANCED_MULTIPLIER) +
    (ADVANCED_WEIGHTS.form * enhancedForm * AMPLIFICATION_FACTORS.ADVANCED_MULTIPLIER) +
    (ADVANCED_WEIGHTS.tempo * paceAdj * AMPLIFICATION_FACTORS.ADVANCED_MULTIPLIER) +
    (ADVANCED_WEIGHTS.formations * motionAdv * AMPLIFICATION_FACTORS.ADVANCED_MULTIPLIER) +
    (ADVANCED_WEIGHTS.script_adaptation * scriptAdapt * AMPLIFICATION_FACTORS.ADVANCED_MULTIPLIER);

  // EMERGENCY: Amplified matchup score component
  const matchupScore = calculateMatchupScore(matchupTerms) * AMPLIFICATION_FACTORS.MATCHUP_MULTIPLIER;

  // Historical vs current season score separation
  const currentSeasonScore = coreScore + tierScore + advancedScore + matchupScore;
  const historicalScore = currentSeasonScore * 0.8; // Assume historical is 20% lower differentiation
  
  // Apply Bayesian updating
  const finalScore = applyBayesianUpdating(
    historicalScore, 
    currentSeasonScore, 
    evidenceStrength, 
    contextWeights.season_2025
  );
  
  // Calculate prediction confidence based on evidence strength and sample size
  const baseConfidence = 0.5;
  const evidenceBoost = evidenceStrength * 0.3;
  const sampleBoost = Math.min(currentWeek / 8, 0.2); // Max 20% boost by week 8
  const finalConfidence = clamp(baseConfidence + evidenceBoost + sampleBoost, 0.3, 0.9);
  
  console.log('EMERGENCY v7: Final scoring breakdown:', {
    coreScore, tierScore, advancedScore, matchupScore, 
    currentSeasonScore, historicalScore, finalScore,
    evidenceStrength, finalConfidence
  });

  return { 
    score: finalScore, 
    confidence: finalConfidence,
    evidenceStrength: evidenceStrength
  };
}

// Enhanced injury adjustments with more impact
function applyInjuryAdjustments(scoreData, teamCode, injuries) {
  const teamInjuries = injuries.teams?.[teamCode] || {};
  let delta = 0;

  // EMERGENCY: Increased QB status impact
  switch (teamInjuries.qb_status) {
    case 'out':
      delta -= 8; // Increased from 5
      break;
    case 'doubtful':
      delta -= 4; // Increased from 2.5
      break;
    case 'questionable':
      delta -= 2; // Increased from 1
      break;
    default:
      break;
  }

  // Positional cluster impacts
  const olOut = teamInjuries.ol_starters_out ?? 0;
  const dbOut = teamInjuries.db_starters_out ?? 0;

  if (olOut >= 2) delta -= 2.5; // Increased impact
  if (olOut >= 3) delta -= 5;   // Increased impact
  if (dbOut >= 2) delta -= 2;   // Increased impact

  console.log('EMERGENCY injury adjustment for', teamCode, ':', delta, 'points');
  
  return {
    score: scoreData.score + delta,
    confidence: scoreData.confidence * (1 - Math.abs(delta) * 0.03), // Reduce confidence with injuries
    evidenceStrength: scoreData.evidenceStrength
  };
}

// EMERGENCY: Enhanced spread prediction with massive amplification
function calculateSpreadPrediction(homeScoreData, awayScoreData) {
  console.log('=== EMERGENCY v7 SPREAD PREDICTION ===');
  console.log('Score data:', { homeScoreData, awayScoreData });
  
  // EMERGENCY: Dynamic home field advantage based on confidence
  const avgConfidence = (homeScoreData.confidence + awayScoreData.confidence) / 2;
  const confidentHFA = 1.5;  // Increased from 1.2
  const uncertainHFA = 0.5;  // Decreased from 0.8
  
  const dynamicHFA = confidentHFA - (confidentHFA - uncertainHFA) * (1 - avgConfidence);
  
  // EMERGENCY: Massively amplified score difference calculation
  const scoreDifference = homeScoreData.score - awayScoreData.score;
  const amplifiedDifference = scoreDifference * 0.8; // Direct score to spread conversion
  
  // Calculate predicted home margin
  const predictedHomeMargin = dynamicHFA + amplifiedDifference;
  
  const finalSpread = clamp(predictedHomeMargin, -28, 28);
  
  console.log('EMERGENCY spread calculation:', { 
    avgConfidence, dynamicHFA, scoreDifference, amplifiedDifference, predictedHomeMargin, finalSpread 
  });
  
  return finalSpread;
}

// EMERGENCY: Enhanced total prediction with amplification
function calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread = 0) {
  console.log('=== EMERGENCY v7 TOTAL PREDICTION ===');
  
  // Base team scoring rates from EPA
  const homeOffEPA = homeMetrics?.core?.off_epa || 0;
  const awayOffEPA = awayMetrics?.core?.off_epa || 0;
  const homeDefEPA = homeMetrics?.core?.def_epa || 0;
  const awayDefEPA = awayMetrics?.core?.def_epa || 0;
  
  // Historical form adjustments
  const homeForm = homeMetrics?.form?.off || 0;
  const awayForm = awayMetrics?.form?.off || 0;
  
  console.log('EMERGENCY total factors:', { 
    homeOffEPA, awayOffEPA, homeDefEPA, awayDefEPA, homeForm, awayForm 
  });
  
  // EMERGENCY: Massively amplified EPA-to-points conversion
  const homePointsPerPlay = (homeOffEPA * 10) + 0.55 + (homeForm * 0.3); // Increased multipliers
  const awayPointsPerPlay = (awayOffEPA * 10) + 0.55 + (awayForm * 0.3);
  
  // Use dynamic expected plays calculation
  const expectedPlays = calculateExpectedPlays(homeMetrics?.tempo, awayMetrics?.tempo, marketSpread);
  console.log('Expected plays (dynamic):', expectedPlays);
  
  // EMERGENCY: Enhanced defensive adjustments
  const homeDefAdj = (homeDefEPA * 0.8); // Increased from 0.7
  const awayDefAdj = (awayDefEPA * 0.8);
  
  const homeProjected = Math.max(10, (homePointsPerPlay + awayDefAdj) * (expectedPlays/2));
  const awayProjected = Math.max(10, (awayPointsPerPlay + homeDefAdj) * (expectedPlays/2));
  
  const total = clamp(homeProjected + awayProjected, 30, 75);
  
  console.log('EMERGENCY total calculation:', { 
    homePointsPerPlay, awayPointsPerPlay, expectedPlays,
    homeProjected, awayProjected, total 
  });
  
  return total;
}

// EMERGENCY: Enhanced confidence calculation with team differentiation boost
function calculateConfidence(modelProb, marketProb, edge, scoreConfidence, evidenceStrength, scoreDifference = 0) {
  const modelCertainty = Math.abs(modelProb - 0.5) * 2;
  const edgeComponent = edge ? Math.min(Math.abs(edge), 0.20) / 0.20 : 0;
  
  // EMERGENCY: Team differentiation confidence boost
  const differentiationBoost = Math.min(Math.abs(scoreDifference) / 8, 0.2); // Up to 20% boost for large score differences
  
  // Context-aware confidence boosts
  const scoreConfidenceBoost = (scoreConfidence - 0.5) * 0.25; // Increased from 0.2
  const evidenceBoost = evidenceStrength * 0.2; // Increased from 0.15
  
  const rawConfidence = (modelCertainty * 0.5) + (edgeComponent * 0.2) + 
                       scoreConfidenceBoost + evidenceBoost + differentiationBoost;
  
  return Math.max(55, Math.round(rawConfidence * 50 + 60)); // Increased base from 50 to 60
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
  
  // Extract spread odds with proper favorite identification
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

// MAIN EMERGENCY HYBRID PREDICTION FUNCTION
async function generateAdvancedPredictions(games, season) {
  console.log('=== EMERGENCY HYBRID v7 - MAXIMUM TEAM DIFFERENTIATION ===');
  console.log('Massively amplified scoring to force team separation...');
  
  let advancedMetrics = null;
  let injuries = null;
  
  try {
    advancedMetrics = await loadAdvancedMetrics(season);
    console.log('Enhanced metrics loaded for season:', season);
    
    // Diagnostic check
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
        contextAwareWeighting: false,
        bayesianUpdating: false,
        emergencyFix: true,
        notes: ["Enhanced metrics not available - using fallback"]
      }
    }));
  }

  const league = advancedMetrics?.league || { means: {}, stds: {} };
  const currentWeek = getCurrentWeek(advancedMetrics);
  
  console.log(`EMERGENCY: Current week: ${currentWeek}`);
  
  // Load live odds for all games
  const allOdds = await loadLiveOdds();

  return games.map(game => {
    const homeCode = game.home_team;
    const awayCode = game.away_team;

    console.log(`\n=== EMERGENCY PREDICTION: ${awayCode} @ ${homeCode} ===`);

    // Get team enhanced metrics
    const homeMetrics = getTeamMetrics(advancedMetrics, homeCode);
    const awayMetrics = getTeamMetrics(advancedMetrics, awayCode);

    // Calculate context-aware weights based on roster continuity and week
    const contextWeights = calculateContextAwareWeights(currentWeek, homeMetrics, awayMetrics);

    // Calculate opponent-specific matchups
    const matchups = calculateMatchups(homeMetrics, awayMetrics, league);

    const hasHistoricalData = homeMetrics?._metadata?.hasHistoricalData && awayMetrics?._metadata?.hasHistoricalData;
    const hasMatchupData = !!(matchups?.home && matchups?.away);
    const hasContextData = !!(contextWeights && currentWeek);
    
    console.log('EMERGENCY: Data availability:', { hasHistoricalData, hasMatchupData, hasContextData });

    // EMERGENCY: Calculate massively amplified scores
    let homeScoreData = scoreTeamFromFeatures(homeMetrics, league, contextWeights, matchups?.home, true, currentWeek);
    let awayScoreData = scoreTeamFromFeatures(awayMetrics, league, contextWeights, matchups?.away, false, currentWeek);

    console.log('EMERGENCY: Initial amplified scores:', { homeScoreData, awayScoreData });

    // Apply injury adjustments
    if (injuries) {
      homeScoreData = applyInjuryAdjustments(homeScoreData, homeCode, injuries);
      awayScoreData = applyInjuryAdjustments(awayScoreData, awayCode, injuries);
    }

    console.log('EMERGENCY: Final scores after injuries:', { homeScoreData, awayScoreData });

    // Calculate score difference for diagnostics
    const scoreDifference = homeScoreData.score - awayScoreData.score;
    console.log(`EMERGENCY: Score difference: ${scoreDifference.toFixed(2)} (target: >4)`);

    // Convert to win probabilities with amplified spread prediction
    const predictedSpread = calculateSpreadPrediction(homeScoreData, awayScoreData);
    const homeWinProb = sigmoid(predictedSpread / 14);
    const awayWinProb = 1 - homeWinProb;

    console.log('EMERGENCY: Amplified win probabilities:', { homeWinProb, awayWinProb, predictedSpread });

    // Get real odds for this game
    const gameOdds = findGameOdds(allOdds, homeCode, awayCode);
    const realOdds = gameOdds ? extractOddsData(gameOdds) : {};
    
    console.log(`Real odds for ${homeCode} vs ${awayCode}:`, realOdds);
    
    // MONEYLINE: Pick who the model thinks will win (should now properly pick strong away teams)
    const mlPick = homeWinProb > awayWinProb ? homeCode : awayCode;
    const mlModelProb = Math.max(homeWinProb, awayWinProb);
    
    console.log(`EMERGENCY: Moneyline pick: ${mlPick} (${(mlModelProb * 100).toFixed(1)}% probability)`);
    
    // Calculate market probabilities and edge for betting analysis
    const homeMarketProb = americanToImplied(realOdds.ml_home) || 0.5;
    const awayMarketProb = americanToImplied(realOdds.ml_away) || 0.5;
    
    const mlMarketProb = mlPick === homeCode ? homeMarketProb : awayMarketProb;
    const mlEdge = mlMarketProb ? mlModelProb - mlMarketProb : 0;
    
    // Enhanced confidence calculation with score difference
    const avgConfidence = (homeScoreData.confidence + awayScoreData.confidence) / 2;
    const avgEvidence = (homeScoreData.evidenceStrength + awayScoreData.evidenceStrength) / 2;
    const mlConfidence = calculateConfidence(mlModelProb, mlMarketProb, mlEdge, avgConfidence, avgEvidence, scoreDifference);

    // SPREAD: Pick who model thinks will cover
    const marketSpread = realOdds.spread_line || 0;
    const marketFavorite = realOdds.spread_favorite;
    
    console.log('=== EMERGENCY SPREAD LOGIC ===');
    console.log('Model predicted spread (home margin):', predictedSpread);
    console.log('Market spread (favorite):', marketSpread);
    console.log('Market favorite:', marketFavorite);
    
    // Determine spread pick with amplified confidence
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
    
    // EMERGENCY: Reduced threshold for more decisive picks
    const spreadThreshold = 0.5; // Reduced from 1.0
    
    if (Math.abs(marginDifference) < spreadThreshold) {
      spreadPick = modelHomeMargin > marketHomeMargin ? homeCode : awayCode;
    } else if (marginDifference > 0) {
      spreadPick = homeCode;
    } else {
      spreadPick = awayCode;
    }
    
    const spreadEdge = Math.abs(marginDifference);
    const spreadConfidence = calculateConfidence(0.65, 0.52, spreadEdge / 14, avgConfidence, avgEvidence, scoreDifference);

    // TOTAL: Pick what the model thinks will happen
    const predictedTotal = calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread);
    const marketTotal = realOdds.total_line || 44;
    const totalDifference = predictedTotal - marketTotal;
    
    const totalPick = predictedTotal > marketTotal ? 'over' : 'under';
    const totalEdge = Math.abs(totalDifference);
    const totalConfidence = calculateConfidence(0.6, 0.52, totalEdge / 10, avgConfidence, avgEvidence, 0);

    console.log('EMERGENCY total analysis:', { 
      predictedTotal, marketTotal, totalDifference, totalPick, totalEdge, totalConfidence 
    });

    // EMERGENCY: Enhanced game object with amplification metadata
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
        version: 'emergency_v7_maximum_differentiation',
        historicalDataUsed: hasHistoricalData,
        contextAwareWeighting: hasContextData,
        bayesianUpdating: true,
        emergencyFix: true,
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
        amplificationFactors: AMPLIFICATION_FACTORS,
        homeMatchupAdvantage: matchups?.summary?.home_total_advantage || 0,
        awayMatchupAdvantage: matchups?.summary?.away_total_advantage || 0,
        metricsFreshness: advancedMetrics?.asOf || null,
        injuriesAsOf: injuries?.asOf || null,
        featuresUsed: Object.keys(BASE_WEIGHTS),
        advancedFeaturesUsed: Object.keys(ADVANCED_WEIGHTS),
        oddsIntegrated: !!gameOdds,
        notes: [
          "EMERGENCY FIX: Massively amplified team differentiation",
          hasHistoricalData ? "Historical data integration active" : "Using current season data only",
          hasMatchupData ? "Opponent-specific matchup calculations active" : "Using base team metrics only",
          hasContextData ? "Context-aware weighting based on roster continuity" : "Using standard weights",
          `Week ${currentWeek} with ${(contextWeights.season_2025 * 100).toFixed(0)}% current season weight`,
          "Bayesian updating with evidence strength assessment",
          "Leading indicators prioritized for early season",
          "Dynamic home field advantage based on prediction confidence",
          "Process metrics weighted higher than outcome metrics",
          `Score difference: ${scoreDifference.toFixed(2)} (target >4)`,
          `Core EPA amplification: ${AMPLIFICATION_FACTORS.CORE_EPA}x`,
          `Tier multiplier: ${AMPLIFICATION_FACTORS.TIER_MULTIPLIER}x`,
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

    console.log(`EMERGENCY: Processing ${games.length} games for maximum differentiation with season ${season}`);
    
    const predictions = await generateAdvancedPredictions(games, season);
    
    return new Response(JSON.stringify(predictions), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Emergency prediction function error:', error);
    
    return new Response(JSON.stringify({
      error: 'Emergency prediction generation failed',
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
