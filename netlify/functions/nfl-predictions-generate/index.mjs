// netlify/functions/nfl-predictions-generate/index.mjs
// Enhanced version with historical data integration, dynamic weighting, simulation mode, and matchup analysis
// CORRECTED VERSION with GPT fixes

import { loadAdvancedMetrics, loadInjuries, validateAdvancedMetrics, getTeamMetrics, getCurrentWeek, getCurrentWeights, diagnoseMetricsData } from '../_lib/blobs-nfl.js';
import { calculateMatchups, calculateExpectedPlays, calculateMatchupScore } from '../_lib/matchups.js';

// Base tiered weights (will be modified by historical weighting)
const BASE_WEIGHTS = {
  // Tier 1 - Highest predictive value (50% total) - Scoring efficiency focus
  rz_td: 0.22,           // Red zone TD rate - directly correlates with scoring
  explosive_diff: 0.15,   // Explosive plays lead directly to TDs
  turnover_diff: 0.13,    // Turnovers directly impact scoring opportunities
  
  // Tier 2 - Strong correlation (32% total)
  third_down: 0.12,      // Sustaining drives matters but less than scoring
  eds: 0.10,             // Early down success - sets up scoring opportunities
  pressure_diff: 0.10,   // Pass rush affects all offensive efficiency
  
  // Tier 3 - Meaningful but situational (18% total)
  fourth_down_agg: 0.08,
  penalty_diff: 0.05,
  top_eff: 0.05
};

// Advanced feature weights with enhanced historical context
const ADVANCED_WEIGHTS = {
  form: 0.08,            // Recent performance - enhanced with historical data
  consistency: 0.02,     // Historical consistency patterns
  tempo: 0.01,
  formations: 0.01,
  script_adaptation: 0.01
};

// Historical weights by week for simulation mode
const SIMULATION_WEIGHTS = {
  1: { season_2025: 0.1, season_2024: 0.6, season_2023: 0.3, recent_4_weeks: 0.05 },
  2: { season_2025: 0.2, season_2024: 0.5, season_2023: 0.3, recent_4_weeks: 0.08 },
  3: { season_2025: 0.4, season_2024: 0.4, season_2023: 0.2, recent_4_weeks: 0.1 },
  4: { season_2025: 0.5, season_2024: 0.35, season_2023: 0.15, recent_4_weeks: 0.12 },
  5: { season_2025: 0.6, season_2024: 0.3, season_2023: 0.1, recent_4_weeks: 0.15 },
  6: { season_2025: 0.65, season_2024: 0.25, season_2023: 0.1, recent_4_weeks: 0.18 },
  7: { season_2025: 0.7, season_2024: 0.22, season_2023: 0.08, recent_4_weeks: 0.2 },
  8: { season_2025: 0.72, season_2024: 0.2, season_2023: 0.08, recent_4_weeks: 0.22 },
  9: { season_2025: 0.75, season_2024: 0.18, season_2023: 0.07, recent_4_weeks: 0.25 },
  10: { season_2025: 0.78, season_2024: 0.16, season_2023: 0.06, recent_4_weeks: 0.25 },
  11: { season_2025: 0.8, season_2024: 0.15, season_2023: 0.05, recent_4_weeks: 0.25 },
  12: { season_2025: 0.8, season_2024: 0.15, season_2023: 0.05, recent_4_weeks: 0.25 },
  13: { season_2025: 0.82, season_2024: 0.13, season_2023: 0.05, recent_4_weeks: 0.25 },
  14: { season_2025: 0.83, season_2024: 0.12, season_2023: 0.05, recent_4_weeks: 0.25 },
  15: { season_2025: 0.85, season_2024: 0.1, season_2023: 0.05, recent_4_weeks: 0.25 },
  16: { season_2025: 0.85, season_2024: 0.1, season_2023: 0.05, recent_4_weeks: 0.25 },
  17: { season_2025: 0.85, season_2024: 0.1, season_2023: 0.05, recent_4_weeks: 0.25 },
  18: { season_2025: 0.85, season_2024: 0.1, season_2023: 0.05, recent_4_weeks: 0.25 }
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

// Get historical weights for simulation mode
function getSimulationWeights(simulationWeek, currentWeek) {
  if (simulationWeek && SIMULATION_WEIGHTS[simulationWeek]) {
    console.log(`Using simulation weights for Week ${simulationWeek}:`, SIMULATION_WEIGHTS[simulationWeek]);
    return SIMULATION_WEIGHTS[simulationWeek];
  }
  
  // Fallback to current weights if no simulation
  return SIMULATION_WEIGHTS[currentWeek] || SIMULATION_WEIGHTS[3];
}

// ENHANCED: Core team scoring function with historical data integration, simulation, and matchups
function scoreTeamFromFeatures(teamData, league, historicalWeights, matchupTerms = null, isSimulation = false) {
  if (!teamData || !league) {
    return 0.5; // Neutral if no data
  }

  console.log(`Scoring team with ${isSimulation ? 'simulation' : 'live'} historical weights:`, historicalWeights);
  
  // Check if we have historical metadata
  const hasHistoricalData = teamData._metadata?.hasHistoricalData || false;
  console.log(`Team has historical data integration: ${hasHistoricalData}`);

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

  // Calculate z-scores vs league (normalized features)
  const zThird = z(sit.third_down_off ?? 0, league.means.third_down_off, league.stds.third_down_off);
  const zRZ = z(sit.rz_td_off ?? 0, league.means.rz_td_off, league.stds.rz_td_off);
  const zTOdiff = z(to.turnover_diff ?? 0, league.means.turnover_diff, league.stds.turnover_diff);
  
  // FIX 1: Safe explosive z-score calculation to avoid fake defensive stats
  const explosiveOff = sit.explosive_off ?? 0;
  const explosiveDef = (sit.explosive_def ?? null);
  const zExpl = (explosiveDef == null)
    ? z(explosiveOff, league.means.explosive_off, league.stds.explosive_off)
    : z(explosiveOff - explosiveDef, league.means.explosive_diff, league.stds.explosive_diff);
  
  const zEDS = z(sit.eds ?? 0, league.means.eds, league.stds.eds);
  const zPress = z(press.pressure_diff ?? 0, league.means.pressure_diff, league.stds.pressure_diff);
  const z4th = z(coach.fourth_down_agg ?? 0, league.means.fourth_down_agg, league.stds.fourth_down_agg);
  const zPen = z(disc.penalty_diff ?? 0, league.means.penalty_diff, league.stds.penalty_diff);
  const zTOP = z(tempo.top_eff ?? 0, league.means.top_eff, league.stds.top_eff);

  // Core EPA backbone (prefer opponent-adjusted, enhanced with historical context)
  const offEPA = core.off_adj_epa ?? core.off_epa ?? 0;
  const defEPA = -(core.def_adj_epa ?? core.def_epa ?? 0);

  // ENHANCED: Advanced features with historical context
  const consistency = teamData?.consistency?.off ?? 0.5;
  const form = teamData?.form?.off ?? 0;
  
  // Enhanced form calculation with recent games boost
  const enhancedForm = hasHistoricalData && historicalWeights.recent_4_weeks > 0 ? 
    form * (1 + historicalWeights.recent_4_weeks * 2) : form;

  const paceAdj = clamp((tempo.pace ?? 30) / 30 - 1, -0.5, 0.5);
  const motionAdv = (formations.motion_rate ?? 0.4) - 0.4;
  const scriptAdapt = script.trailing_epa ?? 0;

  // ENHANCED: Historical confidence modifier (adjusted for simulation)
  const historicalConfidenceBoost = hasHistoricalData ? 
    (historicalWeights.season_2024 + historicalWeights.season_2023) * (isSimulation ? 0.15 : 0.1) : 0;

  // Weighted combination with historical enhancement
  const coreScore = (offEPA * 0.25) + (defEPA * 0.25);
  
  const tierScore = 
    (BASE_WEIGHTS.third_down * zThird) +
    (BASE_WEIGHTS.rz_td * zRZ) +
    (BASE_WEIGHTS.turnover_diff * zTOdiff) +
    (BASE_WEIGHTS.explosive_diff * zExpl) +
    (BASE_WEIGHTS.eds * zEDS) +
    (BASE_WEIGHTS.pressure_diff * zPress) +
    (BASE_WEIGHTS.fourth_down_agg * z4th) +
    (BASE_WEIGHTS.penalty_diff * zPen) +
    (BASE_WEIGHTS.top_eff * zTOP);

  const advancedScore = 
    (ADVANCED_WEIGHTS.consistency * (consistency - 0.5)) +
    (ADVANCED_WEIGHTS.form * enhancedForm) + // Enhanced with historical data
    (ADVANCED_WEIGHTS.tempo * paceAdj) +
    (ADVANCED_WEIGHTS.formations * motionAdv) +
    (ADVANCED_WEIGHTS.script_adaptation * scriptAdapt) +
    historicalConfidenceBoost; // Enhanced for simulation

  // Add matchup score component
  const matchupScore = calculateMatchupScore(matchupTerms);
  console.log('Matchup score contribution:', matchupScore, 'from terms:', matchupTerms);

  const totalLinear = coreScore + tierScore + advancedScore + matchupScore;

  // Convert to probability and clamp for sanity
  const probability = sigmoid(totalLinear);
  return clamp(probability, 0.1, 0.9);
}

// Enhanced injury adjustments with historical context
function applyInjuryAdjustments(probability, teamCode, injuries) {
  const teamInjuries = injuries.teams?.[teamCode] || {};
  let delta = 0;

  // QB status impact
  switch (teamInjuries.qb_status) {
    case 'out':
      delta -= 0.03;
      break;
    case 'doubtful':
      delta -= 0.02;
      break;
    case 'questionable':
      delta -= 0.01;
      break;
    default:
      break;
  }

  // Positional cluster impacts
  const olOut = teamInjuries.ol_starters_out ?? 0;
  const dbOut = teamInjuries.db_starters_out ?? 0;

  if (olOut >= 2) delta -= 0.005;
  if (olOut >= 3) delta -= 0.010;
  if (dbOut >= 2) delta -= 0.005;

  // Apply backup QB penalty if available
  if (teamInjuries.qb_status === 'out' && teamInjuries.qb_backup_adj_ppp) {
    delta += Math.max(teamInjuries.qb_backup_adj_ppp, -0.05);
  }

  return clamp(probability + delta, 0.05, 0.95);
}

// Calculate spread prediction (enhanced)
function calculateSpreadPrediction(homeWinProb, awayWinProb, homeMetrics, awayMetrics) {
  console.log('=== ENHANCED SPREAD PREDICTION DEBUG ===');
  console.log('Win probabilities:', { homeWinProb, awayWinProb });
  
  // Convert win probability to point spread
  const probDiff = homeWinProb - awayWinProb;
  const predictedSpread = probDiff * 14; // Rough conversion
  
  // Enhanced EPA factor with historical context
  const homeOffEPA = homeMetrics?.core?.off_epa || 0;
  const homeDefEPA = homeMetrics?.core?.def_epa || 0;
  const awayOffEPA = awayMetrics?.core?.off_epa || 0;
  const awayDefEPA = awayMetrics?.core?.def_epa || 0;
  
  console.log('Enhanced EPA values:', { homeOffEPA, homeDefEPA, awayOffEPA, awayDefEPA });
  
  const epaSpread = (homeOffEPA - homeDefEPA) - (awayOffEPA - awayDefEPA);
  
  // Historical consistency adjustment (slightly dampened as suggested)
  const homeConsistency = homeMetrics?.consistency?.off || 0.5;
  const awayConsistency = awayMetrics?.consistency?.off || 0.5;
  const consistencyAdj = (homeConsistency - awayConsistency) * 2; // Reduced from 3 to 2
  
  const adjustedSpread = predictedSpread + (epaSpread * 5) + consistencyAdj;
  const finalSpread = clamp(adjustedSpread, -21, 21);
  
  console.log('Enhanced spread calculation:', { 
    probDiff, predictedSpread, epaSpread, consistencyAdj, adjustedSpread, finalSpread 
  });
  
  return finalSpread;
}

// FIX 2: Calculate total prediction without double-counting form
function calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread = 0) {
  console.log('=== ENHANCED TOTAL PREDICTION WITH DYNAMIC PLAYS (FIXED) ===');
  
  // Enhanced EPA to points conversion with historical context
  const homeOffEPA = homeMetrics?.core?.off_epa || 0;
  const awayOffEPA = awayMetrics?.core?.off_epa || 0;
  const homeDefEPA = homeMetrics?.core?.def_epa || 0;
  const awayDefEPA = awayMetrics?.core?.def_epa || 0;
  
  // Historical form adjustments (only in points-per-play, not additive)
  const homeForm = homeMetrics?.form?.off || 0;
  const awayForm = awayMetrics?.form?.off || 0;
  
  console.log('Enhanced total factors:', { 
    homeOffEPA, awayOffEPA, homeDefEPA, awayDefEPA, homeForm, awayForm 
  });
  
  const homePointsPerPlay = (homeOffEPA * 3) + 0.35 + (homeForm * 0.1);
  const awayPointsPerPlay = (awayOffEPA * 3) + 0.35 + (awayForm * 0.1);
  
  // Use expected plays instead of static pace average
  const expectedPlays = calculateExpectedPlays(homeMetrics?.tempo, awayMetrics?.tempo, marketSpread);
  console.log('Expected plays (dynamic):', expectedPlays, 'vs static average:', 
    ((homeMetrics?.tempo?.pace || 65) + (awayMetrics?.tempo?.pace || 65)) / 2);
  
  // Defensive adjustments
  const homeDefAdj = (homeDefEPA * 0.4);
  const awayDefAdj = (awayDefEPA * 0.4);
  
  const homeProjected = Math.max(14, (homePointsPerPlay + awayDefAdj) * (expectedPlays/2));
  const awayProjected = Math.max(14, (awayPointsPerPlay + homeDefAdj) * (expectedPlays/2));
  
  // FIXED: No double form adjustment - form is already included in points-per-play
  const total = clamp(homeProjected + awayProjected, 35, 68);
  
  console.log('Enhanced total calculation result:', total);
  return total;
}

// Enhanced confidence calculation with simulation adjustments and optional capping
function calculateConfidence(modelProb, marketProb, edge, hasHistoricalData = false, isSimulation = false, simulationWeek = null, currentWeek = null) {
  const modelCertainty = Math.abs(modelProb - 0.5) * 2;
  const edgeComponent = edge ? Math.min(Math.abs(edge), 0.15) / 0.15 : 0;
  
  // Historical data boost to confidence (enhanced for simulation)
  const historicalBoost = hasHistoricalData ? (isSimulation ? 0.03 : 0.05) : 0;
  
  const rawConfidence = (modelCertainty * 0.7) + (edgeComponent * 0.3) + historicalBoost;
  let confidence = Math.max(50, Math.round(rawConfidence * 50 + 50));
  
  // Optional: Cap confidence for historical simulations to avoid overconfidence
  if (simulationWeek && currentWeek && simulationWeek < currentWeek) {
    confidence = Math.min(confidence, 70);
  }
  
  return confidence;
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

// Convert team identifiers to consistent format
function normalizeTeamIdentifier(team) {
  // If it's already a full name, return as-is
  if (Object.values(TEAM_NAME_MAPPING).includes(team)) {
    return team;
  }
  
  // If it's an abbreviation, convert to full name
  if (TEAM_NAME_MAPPING[team]) {
    return TEAM_NAME_MAPPING[team];
  }
  
  // Fallback: return as-is
  return team;
}

// ENHANCED: Main prediction function with historical data integration, simulation mode, and matchups
async function generateAdvancedPredictions(games, season, simulationWeek = null) {
  console.log('=== ENHANCED PREDICTION ENGINE WITH MATCHUPS (CORRECTED) ===');
  console.log(`Simulation mode: ${!!simulationWeek}, Target week: ${simulationWeek || 'current'}`);
  console.log('Attempting to load enhanced metrics with historical integration...');
  
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
        simulationMode: !!simulationWeek,
        matchupsCalculated: false,
        notes: ["Enhanced metrics not available - using fallback"]
      }
    }));
  }

  const league = advancedMetrics?.league || { means: {}, stds: {} };
  const currentWeek = getCurrentWeek(advancedMetrics);
  
  // Use simulation weights if in simulation mode
  const historicalWeights = simulationWeek ? 
    getSimulationWeights(simulationWeek, currentWeek) : 
    getCurrentWeights(advancedMetrics);
  
  const effectiveWeek = simulationWeek || currentWeek;
  
  console.log(`Current week: ${currentWeek}, Effective week: ${effectiveWeek}, Historical weights:`, historicalWeights);
  
  // Load live odds for all games (skip in simulation mode for old weeks)
  const allOdds = simulationWeek && simulationWeek < currentWeek ? [] : await loadLiveOdds();

  return games.map(game => {
    // Normalize team identifiers
    const homeCode = normalizeTeamIdentifier(game.home_team);
    const awayCode = normalizeTeamIdentifier(game.away_team);

    console.log(`\n=== ENHANCED PREDICTION WITH MATCHUPS: ${awayCode} @ ${homeCode} ===`);
    console.log(`Simulation mode: ${!!simulationWeek}, Week: ${effectiveWeek}`);

    // Get team enhanced metrics
    const homeMetrics = getTeamMetrics(advancedMetrics, homeCode);
    const awayMetrics = getTeamMetrics(advancedMetrics, awayCode);

    // Calculate opponent-specific matchups
    const matchups = calculateMatchups(homeMetrics, awayMetrics, league);
    console.log('Calculated matchups:', {
      home_advantages: matchups.home,
      away_advantages: matchups.away,
      home_total: matchups.summary.home_total_advantage,
      away_total: matchups.summary.away_total_advantage
    });

    const hasHistoricalData = homeMetrics?._metadata?.hasHistoricalData && awayMetrics?._metadata?.hasHistoricalData;
    console.log('Historical data available:', hasHistoricalData);

    // Calculate base probabilities using enhanced features WITH matchup terms
    let homeProb = scoreTeamFromFeatures(homeMetrics, league, historicalWeights, matchups.home, !!simulationWeek);
    let awayProb = scoreTeamFromFeatures(awayMetrics, league, historicalWeights, matchups.away, !!simulationWeek);

    console.log('Enhanced initial probabilities with matchups:', { homeProb, awayProb });

    // Normalize probabilities to sum to 1
    const total = homeProb + awayProb;
    if (total > 0) {
      homeProb = homeProb / total;
      awayProb = awayProb / total;
    }

    // Enhanced home field advantage (adjusted for simulation and early season)
    const earlySeasonPenalty = effectiveWeek <= 4 ? 0.003 : 0;
    const homeFieldAdv = hasHistoricalData ? 
      (0.015 - earlySeasonPenalty) : 
      (0.018 - earlySeasonPenalty);
    
    homeProb += homeFieldAdv;
    awayProb = 1 - homeProb;

    console.log('After enhanced home field advantage:', { homeProb, awayProb });

    // Apply injury adjustments (skip for simulation of old weeks)
    if (injuries && !simulationWeek) {
      homeProb = applyInjuryAdjustments(homeProb, homeCode, injuries);
      awayProb = applyInjuryAdjustments(awayProb, awayCode, injuries);
    }

    // Final normalization
    const finalSum = homeProb + awayProb;
    const homeWinProb = finalSum ? homeProb / finalSum : 0.5;
    const awayWinProb = 1 - homeWinProb;

    console.log('Final enhanced win probabilities:', { homeWinProb, awayWinProb });

    // Get real odds for this game (skip for simulation)
    const gameOdds = simulationWeek ? null : findGameOdds(allOdds, homeCode, awayCode);
    const realOdds = gameOdds ? extractOddsData(gameOdds) : {};
    
    console.log(`Real odds for ${homeCode} vs ${awayCode}:`, realOdds);
    
    // Enhanced moneyline predictions
    const mlPick = homeWinProb > 0.5 ? homeCode : awayCode;
    const mlModelProb = Math.max(homeWinProb, awayWinProb);
    const mlMarketProb = homeWinProb > 0.5 ? 
      americanToImplied(realOdds.ml_home) : 
      americanToImplied(realOdds.ml_away);
    const mlEdge = mlMarketProb ? mlModelProb - mlMarketProb : 0;
    const mlConfidence = calculateConfidence(mlModelProb, mlMarketProb, mlEdge, hasHistoricalData, !!simulationWeek, simulationWeek, currentWeek);

    // Enhanced spread predictions
    const predictedSpread = calculateSpreadPrediction(homeWinProb, awayWinProb, homeMetrics, awayMetrics);
    const marketSpread = realOdds.spread_line || 0;
    const marketFavorite = realOdds.spread_favorite;
    
    console.log('=== ENHANCED SPREAD LOGIC ===');
    console.log('Model predicted spread (home margin):', predictedSpread);
    console.log('Market spread (favorite):', marketSpread);
    console.log('Market favorite:', marketFavorite);
    
    // Enhanced spread logic with historical context
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
    console.log('Enhanced margin analysis - Model:', modelHomeMargin, 'Market:', marketHomeMargin, 'Diff:', marginDifference);
    
    let spreadPick;
    let spreadEdge = Math.abs(marginDifference);
    
    // Enhanced threshold with historical data and simulation adjustment
    const baseThreshold = hasHistoricalData ? 2.0 : 2.5;
    const simulationAdjustment = simulationWeek && effectiveWeek <= 4 ? 0.5 : 0;
    const spreadThreshold = baseThreshold + simulationAdjustment;
    
    if (Math.abs(marginDifference) < spreadThreshold) {
      spreadPick = 'push';
    } else if (marginDifference > 0) {
      spreadPick = homeCode;
    } else {
      spreadPick = awayCode;
    }
    
    const spreadConfidence = calculateConfidence(0.6, 0.5, spreadEdge / 14, hasHistoricalData, !!simulationWeek, simulationWeek, currentWeek);

    // Enhanced total predictions with dynamic plays (FIXED - no double form)
    const predictedTotal = calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread);
    const marketTotal = realOdds.total_line || 44;
    const totalPick = predictedTotal > marketTotal ? 'over' : 'under';
    const totalEdge = Math.abs(predictedTotal - marketTotal);
    const totalConfidence = calculateConfidence(0.6, 0.5, totalEdge / 10, hasHistoricalData, !!simulationWeek, simulationWeek, currentWeek);

    console.log('Enhanced total prediction (corrected):', { predictedTotal, marketTotal, totalPick, totalConfidence, totalEdge });

    // Enhanced game object with historical metadata, simulation info, and matchups
    return {
      ...game,
      home_team: homeCode,
      away_team: awayCode,
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
        version: 'enhanced_v4_matchups_corrected',
        historicalDataUsed: hasHistoricalData,
        matchupsCalculated: true,
        simulationMode: !!simulationWeek,
        simulationWeek: simulationWeek,
        currentWeek: currentWeek,
        effectiveWeek: effectiveWeek,
        historicalWeights: historicalWeights,
        homeMatchupAdvantage: matchups.summary.home_total_advantage,
        awayMatchupAdvantage: matchups.summary.away_total_advantage,
        metricsFreshness: advancedMetrics?.asOf || null,
        injuriesAsOf: injuries?.asOf || null,
        featuresUsed: Object.keys(BASE_WEIGHTS),
        advancedFeaturesUsed: Object.keys(ADVANCED_WEIGHTS),
        oddsIntegrated: !!gameOdds,
        notes: [
          hasHistoricalData ? "Historical data integration active" : "Using current season data only",
          simulationWeek ? `Simulating Week ${simulationWeek} predictions` : `Week ${currentWeek} dynamic weighting applied`,
          "Enhanced form and consistency calculations",
          "Opponent-specific matchup calculations active",
          "Dynamic expected plays for totals - corrected form calculation",
          "Safe explosive differential calculation",
          simulationWeek ? "Simulation mode - historical odds not available" : 
            (gameOdds ? "Live odds integrated" : "Using fallback odds")
        ]
      },
      
      // Add detailed matchup breakdown
      matchupAnalysis: {
        home_advantages: matchups.home,
        away_advantages: matchups.away,
        key_matchups: {
          home_passing: matchups.home.pass > 0.05 ? 'significant advantage' : 
                       matchups.home.pass < -0.05 ? 'significant disadvantage' : 'neutral',
          home_rushing: matchups.home.rush > 0.05 ? 'significant advantage' : 
                       matchups.home.rush < -0.05 ? 'significant disadvantage' : 'neutral',
          home_redzone: matchups.home.rz > 0.05 ? 'significant advantage' : 
                       matchups.home.rz < -0.05 ? 'significant disadvantage' : 'neutral',
          away_passing: matchups.away.pass > 0.05 ? 'significant advantage' : 
                       matchups.away.pass < -0.05 ? 'significant disadvantage' : 'neutral',
          away_rushing: matchups.away.rush > 0.05 ? 'significant advantage' : 
                       matchups.away.rush < -0.05 ? 'significant disadvantage' : 'neutral',
          away_redzone: matchups.away.rz > 0.05 ? 'significant advantage' : 
                       matchups.away.rz < -0.05 ? 'significant disadvantage' : 'neutral'
        }
      },
      
      teamStats: {
        home: {
          strength: Number(homeWinProb.toFixed(3)),
          thirdDown: homeMetrics?.situational?.third_down_off ?? null,
          redZoneTD: homeMetrics?.situational?.rz_td_off ?? null,
          pressureDiff: homeMetrics?.pressure?.pressure_diff ?? null,
          consistency: homeMetrics?.consistency?.off ?? null,
          form: homeMetrics?.form?.off ?? null,
          historicalContext: homeMetrics?._metadata?.hasHistoricalData || false,
          matchupAdvantage: matchups.summary.home_total_advantage
        },
        away: {
          strength: Number(awayWinProb.toFixed(3)),
          thirdDown: awayMetrics?.situational?.third_down_off ?? null,
          redZoneTD: awayMetrics?.situational?.rz_td_off ?? null,
          pressureDiff: awayMetrics?.pressure?.pressure_diff ?? null,
          consistency: awayMetrics?.consistency?.off ?? null,
          form: awayMetrics?.form?.off ?? null,
          historicalContext: awayMetrics?._metadata?.hasHistoricalData || false,
          matchupAdvantage: matchups.summary.away_total_advantage
        }
      }
    };
  });
}

// Netlify Function Handler with simulation support
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
    let simulationWeek = null;
    
    if (request.method === 'POST') {
      const body = await request.json();
      games = body.games || [];
      season = body.season || '2025';
      simulationWeek = body.simulation_week || body.simulationWeek || null;
      
      console.log('POST request body keys:', Object.keys(body));
      console.log('Simulation week from body:', simulationWeek);
    } else if (request.method === 'GET') {
      const url = new URL(request.url);
      season = url.searchParams.get('season') || '2025';
      simulationWeek = url.searchParams.get('simulation_week') || url.searchParams.get('simulationWeek') || null;
      games = [];
    }

    console.log(`Processing ${games.length} games for corrected enhanced prediction with matchups for season ${season}${simulationWeek ? `, simulating Week ${simulationWeek}` : ''}`);
    
    const predictions = await generateAdvancedPredictions(games, season, simulationWeek ? parseInt(simulationWeek) : null);
    
    return new Response(JSON.stringify(predictions), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Enhanced prediction function error:', error);
    
    return new Response(JSON.stringify({
      error: 'Enhanced prediction generation failed',
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
