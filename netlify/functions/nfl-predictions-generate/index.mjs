// netlify/functions/nfl-predictions-generate/index.mjs
// FIXED VERSION - Proper home field advantage without compounding bias

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

// REDUCED: Home/away offensive analysis - smaller impact
function calculateHomeAwayOffensiveAdvantage(teamMetrics, isHome, league) {
  console.log('Calculating reduced home/away offensive advantage for', isHome ? 'home' : 'away', 'team...');
  
  // Extract home vs away offensive splits
  const homeSplits = teamMetrics?.splits?.home || {};
  const awaySplits = teamMetrics?.splits?.away || {};
  
  const homeOffensiveStats = {
    ppg: homeSplits.points_per_game || 0,
    yards_per_play: homeSplits.offensive_yards_per_play || 0,
    red_zone_td_pct: homeSplits.red_zone_td_rate || 0,
    third_down_pct: homeSplits.third_down_conversion || 0
  };
  
  const awayOffensiveStats = {
    ppg: awaySplits.points_per_game || 0,
    yards_per_play: awaySplits.offensive_yards_per_play || 0,
    red_zone_td_pct: awaySplits.red_zone_td_rate || 0,
    third_down_pct: awaySplits.third_down_conversion || 0
  };
  
  // Calculate location-specific advantages
  const ppgAdvantage = homeOffensiveStats.ppg - awayOffensiveStats.ppg;
  const yppAdvantage = homeOffensiveStats.yards_per_play - awayOffensiveStats.yards_per_play;
  const rzAdvantage = homeOffensiveStats.red_zone_td_pct - awayOffensiveStats.red_zone_td_pct;
  const thirdDownAdvantage = homeOffensiveStats.third_down_pct - awayOffensiveStats.third_down_pct;
  
  // REDUCED: Weighted offensive location advantage (in points) - much smaller impact
  const offensiveLocationAdvantage = 
    (ppgAdvantage * 0.3) +           // Reduced from 1.0 to 0.3
    (yppAdvantage * 2) +             // Reduced from 8 to 2
    (rzAdvantage * 0.05 * 21) +      // Reduced from 0.15 to 0.05
    (thirdDownAdvantage * 0.03 * 14); // Reduced from 0.10 to 0.03
  
  console.log('Reduced offensive location analysis:', {
    ppgAdvantage, yppAdvantage, rzAdvantage, thirdDownAdvantage,
    offensiveLocationAdvantage,
    appliedAdvantage: isHome ? offensiveLocationAdvantage : -offensiveLocationAdvantage
  });
  
  return isHome ? offensiveLocationAdvantage : -offensiveLocationAdvantage;
}

// REDUCED: Home/away defensive analysis - smaller impact
function calculateHomeAwayDefensiveAdvantage(teamMetrics, isHome, league) {
  console.log('Calculating reduced home/away defensive advantage for', isHome ? 'home' : 'away', 'team...');
  
  // Extract home vs away defensive splits  
  const homeSplits = teamMetrics?.splits?.home || {};
  const awaySplits = teamMetrics?.splits?.away || {};
  
  const homeDefensiveStats = {
    points_allowed: homeSplits.points_allowed_per_game || 0,
    yards_per_play_allowed: homeSplits.defensive_yards_per_play_allowed || 0,
    red_zone_td_allowed: homeSplits.red_zone_td_allowed_rate || 0,
    takeaway_rate: homeSplits.takeaway_rate || 0
  };
  
  const awayDefensiveStats = {
    points_allowed: awaySplits.points_allowed_per_game || 0,
    yards_per_play_allowed: awaySplits.defensive_yards_per_play_allowed || 0,
    red_zone_td_allowed: awaySplits.red_zone_td_allowed_rate || 0,
    takeaway_rate: awaySplits.takeaway_rate || 0
  };
  
  // Calculate defensive location advantages (negative is better for defense)
  const pointsAllowedAdvantage = awayDefensiveStats.points_allowed - homeDefensiveStats.points_allowed;
  const yppAllowedAdvantage = awayDefensiveStats.yards_per_play_allowed - homeDefensiveStats.yards_per_play_allowed;
  const rzAllowedAdvantage = awayDefensiveStats.red_zone_td_allowed - homeDefensiveStats.red_zone_td_allowed;
  const takeawayAdvantage = homeDefensiveStats.takeaway_rate - awayDefensiveStats.takeaway_rate;
  
  // REDUCED: Weighted defensive location advantage (in points) - much smaller impact
  const defensiveLocationAdvantage = 
    (pointsAllowedAdvantage * 0.3) +        // Reduced from 1.0 to 0.3
    (yppAllowedAdvantage * 2) +             // Reduced from 8 to 2
    (rzAllowedAdvantage * 0.05 * 21) +      // Reduced from 0.15 to 0.05
    (takeawayAdvantage * 0.03 * 14);        // Reduced from 0.08 to 0.03
  
  console.log('Reduced defensive location analysis:', {
    pointsAllowedAdvantage, yppAllowedAdvantage, rzAllowedAdvantage, takeawayAdvantage,
    defensiveLocationAdvantage,
    appliedAdvantage: isHome ? defensiveLocationAdvantage : -defensiveLocationAdvantage
  });
  
  return isHome ? defensiveLocationAdvantage : -defensiveLocationAdvantage;
}

// VERY SMALL: ATS tendency analysis - ONLY for spread calculations, very minimal weight
function calculateMinimalATSTendencies(teamMetrics, isHome, league) {
  console.log('Calculating minimal ATS tendencies for', isHome ? 'home' : 'away', 'team (spread only)...');
  
  const homeSplits = teamMetrics?.splits?.home || {};
  const awaySplits = teamMetrics?.splits?.away || {};
  
  // ATS (Against The Spread) performance
  const homeATS = {
    wins: homeSplits.ats_wins || 0,
    losses: homeSplits.ats_losses || 0,
    avg_cover_margin: homeSplits.avg_cover_margin || 0
  };
  
  const awayATS = {
    wins: awaySplits.ats_wins || 0,
    losses: awaySplits.ats_losses || 0,
    avg_cover_margin: awaySplits.avg_cover_margin || 0
  };
  
  // Calculate ATS win rates
  const homeATSRate = homeATS.wins / Math.max(1, homeATS.wins + homeATS.losses);
  const awayATSRate = awayATS.wins / Math.max(1, awayATS.wins + awayATS.losses);
  
  // Cover margin differential
  const coverMarginDiff = homeATS.avg_cover_margin - awayATS.avg_cover_margin;
  
  // VERY MINIMAL: Location-specific spread advantage (much smaller impact)
  const atsLocationAdvantage = 
    ((homeATSRate - awayATSRate) * 1) +     // Reduced from 5 to 1
    (coverMarginDiff * 0.1);                // Reduced from 0.3 to 0.1
  
  console.log('Minimal ATS tendency analysis:', {
    homeATSRate, awayATSRate, coverMarginDiff,
    atsLocationAdvantage,
    appliedAdvantage: isHome ? atsLocationAdvantage : -atsLocationAdvantage
  });
  
  return isHome ? atsLocationAdvantage : -atsLocationAdvantage;
}

// ENHANCED: Core team scoring function with REDUCED home/away bias
function scoreTeamFromFeatures(teamData, league, historicalWeights, matchupTerms = null, isHome = false, prediction_type = 'moneyline') {
  if (!teamData || !league) {
    return 0; // Neutral point differential if no data
  }

  console.log(`Scoring team (${isHome ? 'home' : 'away'}) for ${prediction_type} with reduced home bias...`);
  
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

  // Calculate z-scores vs league (normalized features)
  const zThird = z(sit.third_down_off ?? 0, league.means?.third_down_off || 0, league.stds?.third_down_off || 1);
  const zRZ = z(sit.rz_td_off ?? 0, league.means?.rz_td_off || 0, league.stds?.rz_td_off || 1);
  const zTOdiff = z(to.turnover_diff ?? 0, league.means?.turnover_diff || 0, league.stds?.turnover_diff || 1);
  
  // Safe explosive calculation
  const explosiveOff = sit.explosive_off ?? 0;
  const explosiveDef = sit.explosive_def;
  const zExpl = explosiveDef != null
    ? z(explosiveOff - explosiveDef, league.means?.explosive_diff || 0, league.stds?.explosive_diff || 1)
    : z(explosiveOff, league.means?.explosive_off || 0, league.stds?.explosive_off || 1);
  
  const zEDS = z(sit.eds ?? 0, league.means?.eds || 0, league.stds?.eds || 1);
  const zPress = z(press.pressure_diff ?? 0, league.means?.pressure_diff || 0, league.stds?.pressure_diff || 1);
  const z4th = z(coach.fourth_down_agg ?? 0, league.means?.fourth_down_agg || 0, league.stds?.fourth_down_agg || 1);
  const zPen = z(disc.penalty_diff ?? 0, league.means?.penalty_diff || 0, league.stds?.penalty_diff || 1);
  const zTOP = z(tempo.top_eff ?? 0, league.means?.top_eff || 0, league.stds?.top_eff || 1);

  // Core EPA backbone (prefer opponent-adjusted, enhanced with historical context)
  const offEPA = core.off_adj_epa ?? core.off_epa ?? 0;
  const defEPA = -(core.def_adj_epa ?? core.def_epa ?? 0);

  // ENHANCED: Advanced features with historical context
  const consistency = teamData?.consistency?.off ?? 0.5;
  const form = teamData?.form?.off ?? 0;
  
  // Enhanced form calculation with recent games boost
  const enhancedForm = hasHistoricalData && historicalWeights?.recent_4_weeks > 0 ? 
    form * (1 + historicalWeights.recent_4_weeks * 2) : form;

  const paceAdj = clamp((tempo.pace ?? 30) / 30 - 1, -0.5, 0.5);
  const motionAdv = (formations.motion_rate ?? 0.4) - 0.4;
  const scriptAdapt = script.trailing_epa ?? 0;

  // REDUCED: Location-specific advantages - much smaller impact
  let offensiveLocationAdv = 0;
  let defensiveLocationAdv = 0;
  let atsLocationAdv = 0;
  
  // Apply reduced home/away advantages
  if (prediction_type === 'moneyline' || prediction_type === 'all') {
    offensiveLocationAdv = calculateHomeAwayOffensiveAdvantage(teamData, isHome, league);
    defensiveLocationAdv = calculateHomeAwayDefensiveAdvantage(teamData, isHome, league);
  }
  
  // ONLY apply minimal ATS for spread calculations
  if (prediction_type === 'spread') {
    atsLocationAdv = calculateMinimalATSTendencies(teamData, isHome, league);
  }

  // Weighted combination - convert to POINTS instead of probability
  const coreScore = (offEPA + defEPA) * 14; // Convert EPA to points (rough 14:1 ratio)
  
  const tierScore = 
    (BASE_WEIGHTS.third_down * zThird * 2) +
    (BASE_WEIGHTS.rz_td * zRZ * 3) +
    (BASE_WEIGHTS.turnover_diff * zTOdiff * 4) +
    (BASE_WEIGHTS.explosive_diff * zExpl * 3) +
    (BASE_WEIGHTS.eds * zEDS * 2) +
    (BASE_WEIGHTS.pressure_diff * zPress * 2.5) +
    (BASE_WEIGHTS.fourth_down_agg * z4th * 1) +
    (BASE_WEIGHTS.penalty_diff * zPen * 1.5) +
    (BASE_WEIGHTS.top_eff * zTOP * 1);

  const advancedScore = 
    (ADVANCED_WEIGHTS.consistency * (consistency - 0.5) * 4) +
    (ADVANCED_WEIGHTS.form * enhancedForm * 3) +
    (ADVANCED_WEIGHTS.tempo * paceAdj * 2) +
    (ADVANCED_WEIGHTS.formations * motionAdv * 2) +
    (ADVANCED_WEIGHTS.script_adaptation * scriptAdapt * 2);

  // Matchup score component
  const matchupScore = calculateMatchupScore(matchupTerms) * 10; // Scale matchup to points
  
  // FIXED: Controlled total point differential - no compounding home advantages
  const totalPointDifferential = coreScore + tierScore + advancedScore + matchupScore + 
    offensiveLocationAdv + defensiveLocationAdv + atsLocationAdv;
  
  console.log('Fixed point differential breakdown:', {
    coreScore, tierScore, advancedScore, matchupScore, 
    offensiveLocationAdv, defensiveLocationAdv, atsLocationAdv,
    total: totalPointDifferential
  });

  return totalPointDifferential; // Return points, not probability
}

// Enhanced injury adjustments - now affects point differential
function applyInjuryAdjustments(pointDiff, teamCode, injuries) {
  const teamInjuries = injuries.teams?.[teamCode] || {};
  let delta = 0;

  // QB status impact (in points)
  switch (teamInjuries.qb_status) {
    case 'out':
      delta -= 4; // 4-point penalty for backup QB
      break;
    case 'doubtful':
      delta -= 2; // 2-point penalty for doubtful QB
      break;
    case 'questionable':
      delta -= 1; // 1-point penalty for questionable QB
      break;
    default:
      break;
  }

  // Positional cluster impacts
  const olOut = teamInjuries.ol_starters_out ?? 0;
  const dbOut = teamInjuries.db_starters_out ?? 0;

  if (olOut >= 2) delta -= 1;
  if (olOut >= 3) delta -= 2;
  if (dbOut >= 2) delta -= 1;

  console.log('Injury adjustment for', teamCode, ':', delta, 'points');
  return pointDiff + delta;
}

// FIXED: Calculate spread prediction with proper modern home field advantage
function calculateSpreadPrediction(homePointDiff, awayPointDiff) {
  console.log('=== FIXED SPREAD PREDICTION ===');
  console.log('Base point differentials:', { homePointDiff, awayPointDiff });
  
  // Modern home field advantage: 1.5 points (applied here, not in team scoring)
  const MODERN_HOME_FIELD_ADVANTAGE = 1.5;
  
  // Calculate predicted home margin
  const predictedHomeMargin = MODERN_HOME_FIELD_ADVANTAGE + homePointDiff - awayPointDiff;
  
  const finalSpread = clamp(predictedHomeMargin, -21, 21);
  
  console.log('Fixed spread calculation:', { 
    homePointDiff, awayPointDiff, MODERN_HOME_FIELD_ADVANTAGE, 
    predictedHomeMargin, finalSpread 
  });
  
  return finalSpread;
}

// ENHANCED: Calculate total prediction with home/away scoring analysis
function calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread = 0) {
  console.log('=== ENHANCED TOTAL PREDICTION ===');
  
  // Base team scoring rates from EPA
  const homeOffEPA = homeMetrics?.core?.off_epa || 0;
  const awayOffEPA = awayMetrics?.core?.off_epa || 0;
  const homeDefEPA = homeMetrics?.core?.def_epa || 0;
  const awayDefEPA = awayMetrics?.core?.def_epa || 0;
  
  // REDUCED: Home/away specific adjustments (smaller impact)
  const homeOffensiveAdv = calculateHomeAwayOffensiveAdvantage(homeMetrics, true, {}) * 0.5; // Reduced impact
  const homeDefensiveAdv = calculateHomeAwayDefensiveAdvantage(homeMetrics, true, {}) * 0.5;
  const awayOffensiveAdv = calculateHomeAwayOffensiveAdvantage(awayMetrics, false, {}) * 0.5;
  const awayDefensiveAdv = calculateHomeAwayDefensiveAdvantage(awayMetrics, false, {}) * 0.5;
  
  // Historical form adjustments
  const homeForm = homeMetrics?.form?.off || 0;
  const awayForm = awayMetrics?.form?.off || 0;
  
  console.log('Total factors:', { 
    homeOffEPA, awayOffEPA, homeDefEPA, awayDefEPA, 
    homeOffensiveAdv, homeDefensiveAdv, awayOffensiveAdv, awayDefensiveAdv,
    homeForm, awayForm 
  });
  
  // Enhanced EPA-to-points conversion with reduced location factors
  const homePointsPerPlay = (homeOffEPA * 5) + 0.45 + (homeForm * 0.15) + (homeOffensiveAdv * 0.01);
  const awayPointsPerPlay = (awayOffEPA * 5) + 0.45 + (awayForm * 0.15) + (awayOffensiveAdv * 0.01);
  
  // Use dynamic expected plays calculation
  const expectedPlays = calculateExpectedPlays(homeMetrics?.tempo, awayMetrics?.tempo, marketSpread);
  console.log('Expected plays (dynamic):', expectedPlays);
  
  // Enhanced defensive adjustments with reduced location factors
  const homeDefAdj = (homeDefEPA * 0.6) + (homeDefensiveAdv * 0.01);
  const awayDefAdj = (awayDefEPA * 0.6) + (awayDefensiveAdv * 0.01);
  
  const homeProjected = Math.max(10, (homePointsPerPlay + awayDefAdj) * (expectedPlays/2));
  const awayProjected = Math.max(10, (awayPointsPerPlay + homeDefAdj) * (expectedPlays/2));
  
  const total = clamp(homeProjected + awayProjected, 30, 75);
  
  console.log('Total calculation:', { 
    homePointsPerPlay, awayPointsPerPlay, expectedPlays,
    homeProjected, awayProjected, total 
  });
  
  return total;
}

// Enhanced confidence calculation
function calculateConfidence(modelProb, marketProb, edge, hasHistoricalData = false, hasMatchupData = false) {
  const modelCertainty = Math.abs(modelProb - 0.5) * 2;
  const edgeComponent = edge ? Math.min(Math.abs(edge), 0.15) / 0.15 : 0;
  
  // Historical data boost to confidence
  const historicalBoost = hasHistoricalData ? 0.05 : 0;
  
  // Matchup data adds small confidence boost
  const matchupBoost = hasMatchupData ? 0.02 : 0;
  
  const rawConfidence = (modelCertainty * 0.7) + (edgeComponent * 0.3) + historicalBoost + matchupBoost;
  return Math.max(50, Math.round(rawConfidence * 50 + 50));
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

// MAIN FIXED PREDICTION FUNCTION
async function generateAdvancedPredictions(games, season) {
  console.log('=== FIXED PREDICTION ENGINE - PROPER HOME FIELD ADVANTAGE ===');
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
        matchupsCalculated: false,
        homeFieldBiasFixed: false,
        notes: ["Enhanced metrics not available - using fallback"]
      }
    }));
  }

  const league = advancedMetrics?.league || { means: {}, stds: {} };
  const currentWeek = getCurrentWeek(advancedMetrics);
  const historicalWeights = getCurrentWeights(advancedMetrics);
  
  console.log(`Current week: ${currentWeek}, Historical weights:`, historicalWeights);
  
  // Load live odds for all games
  const allOdds = await loadLiveOdds();

  return games.map(game => {
    const homeCode = game.home_team;
    const awayCode = game.away_team;

    console.log(`\n=== FIXED PREDICTION: ${awayCode} @ ${homeCode} ===`);

    // Get team enhanced metrics
    const homeMetrics = getTeamMetrics(advancedMetrics, homeCode);
    const awayMetrics = getTeamMetrics(advancedMetrics, awayCode);

    // Calculate opponent-specific matchups
    const matchups = calculateMatchups(homeMetrics, awayMetrics, league);

    const hasHistoricalData = homeMetrics?._metadata?.hasHistoricalData && awayMetrics?._metadata?.hasHistoricalData;
    const hasMatchupData = !!(matchups?.home && matchups?.away);
    const hasHomeAwayData = !!(homeMetrics?.splits && awayMetrics?.splits);
    console.log('Data availability:', { hasHistoricalData, hasMatchupData, hasHomeAwayData });

    // FIXED: Calculate point differentials without compounding home advantages
    let homeMoneylinePoints = scoreTeamFromFeatures(homeMetrics, league, historicalWeights, matchups?.home, true, 'moneyline');
    let awayMoneylinePoints = scoreTeamFromFeatures(awayMetrics, league, historicalWeights, matchups?.away, false, 'moneyline');
    
    let homeSpreadPoints = scoreTeamFromFeatures(homeMetrics, league, historicalWeights, matchups?.home, true, 'spread');
    let awaySpreadPoints = scoreTeamFromFeatures(awayMetrics, league, historicalWeights, matchups?.away, false, 'spread');

    console.log('Initial fixed point differentials:', { 
      homeMoneylinePoints, awayMoneylinePoints, homeSpreadPoints, awaySpreadPoints 
    });

    // Apply injury adjustments to point differentials
    if (injuries) {
      homeMoneylinePoints = applyInjuryAdjustments(homeMoneylinePoints, homeCode, injuries);
      awayMoneylinePoints = applyInjuryAdjustments(awayMoneylinePoints, awayCode, injuries);
      homeSpreadPoints = applyInjuryAdjustments(homeSpreadPoints, homeCode, injuries);
      awaySpreadPoints = applyInjuryAdjustments(awaySpreadPoints, awayCode, injuries);
    }

    console.log('Final point differentials after injuries:', { 
      homeMoneylinePoints, awayMoneylinePoints, homeSpreadPoints, awaySpreadPoints 
    });

    // FIXED: Convert point differentials to win probabilities with PROPER home field advantage
    // Apply the 1.5-point home field advantage here (not in team scoring)
    const expectedHomeMargin = homeMoneylinePoints - awayMoneylinePoints + 1.5; // Apply HFA here
    const homeWinProb = sigmoid(expectedHomeMargin / 14);
    const awayWinProb = 1 - homeWinProb;

    console.log('Fixed win probabilities with proper HFA:', { homeWinProb, awayWinProb, expectedHomeMargin });

    // Get real odds for this game
    const gameOdds = findGameOdds(allOdds, homeCode, awayCode);
    const realOdds = gameOdds ? extractOddsData(gameOdds) : {};
    
    console.log(`Real odds for ${homeCode} vs ${awayCode}:`, realOdds);
    
    // MONEYLINE: Pick who the model thinks will win
    const mlPick = homeWinProb > awayWinProb ? homeCode : awayCode;
    const mlModelProb = Math.max(homeWinProb, awayWinProb);
    
    // Calculate market probabilities and edge for betting analysis
    const homeMarketProb = americanToImplied(realOdds.ml_home) || 0.5;
    const awayMarketProb = americanToImplied(realOdds.ml_away) || 0.5;
    
    const mlMarketProb = mlPick === homeCode ? homeMarketProb : awayMarketProb;
    const mlEdge = mlMarketProb ? mlModelProb - mlMarketProb : 0;
    
    console.log('Fixed moneyline analysis:', {
      homeWinProb, awayWinProb, mlPick,
      mlModelProb, mlMarketProb, mlEdge: mlEdge * 100 + '%'
    });
    
    const mlConfidence = calculateConfidence(mlModelProb, mlMarketProb, mlEdge, hasHistoricalData, hasMatchupData);

    // SPREAD: Pick who model thinks will cover with fixed calculation
    const predictedSpread = calculateSpreadPrediction(homeSpreadPoints, awaySpreadPoints);
    const marketSpread = realOdds.spread_line || 0;
    const marketFavorite = realOdds.spread_favorite;
    
    console.log('=== FIXED SPREAD LOGIC ===');
    console.log('Model predicted spread (home margin):', predictedSpread);
    console.log('Market spread (favorite):', marketSpread);
    console.log('Market favorite:', marketFavorite);
    
    // Determine actual spread pick based on model's predicted margin vs market line
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
    
    // Pick based on model's conviction - who does the data say will cover?
    if (Math.abs(marginDifference) < 1.0) {
      // Very close to market line - low conviction
      spreadPick = modelHomeMargin > marketHomeMargin ? homeCode : awayCode;
    } else if (marginDifference > 0) {
      // Model thinks home team will win by more than market expects
      spreadPick = homeCode;
    } else {
      // Model thinks away team will cover or win by more than market expects
      spreadPick = awayCode;
    }
    
    const spreadEdge = Math.abs(marginDifference);
    const spreadConfidence = calculateConfidence(0.6 + (spreadEdge / 20), 0.52, spreadEdge / 14, hasHistoricalData, hasMatchupData);
    
    console.log('Fixed spread analysis:', { 
      modelHomeMargin, marketHomeMargin, marginDifference, spreadPick, spreadEdge 
    });

    // TOTAL: Pick what the model thinks will happen
    const predictedTotal = calculateTotalPrediction(homeMetrics, awayMetrics, marketSpread);
    const marketTotal = realOdds.total_line || 44;
    const totalDifference = predictedTotal - marketTotal;
    
    // Pick based on model's prediction vs market line
    const totalPick = predictedTotal > marketTotal ? 'over' : 'under';
    const totalEdge = Math.abs(totalDifference);
    
    // Confidence based on how much model disagrees with market
    const totalConfidence = calculateConfidence(0.58 + (totalEdge / 25), 0.52, totalEdge / 10, hasHistoricalData, hasMatchupData);

    console.log('Fixed total analysis:', { 
      predictedTotal, marketTotal, totalDifference, totalPick, totalEdge, totalConfidence 
    });

    // Fixed game object
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
        version: 'fixed_v6_proper_home_field_advantage',
        historicalDataUsed: hasHistoricalData,
        matchupsCalculated: hasMatchupData,
        homeFieldBiasFixed: true,
        currentWeek: currentWeek,
        historicalWeights: historicalWeights,
        homeFieldAdvantage: 1.5, // Modern HFA in points - applied once
        homeMoneylinePoints: Number(homeMoneylinePoints.toFixed(2)),
        awayMoneylinePoints: Number(awayMoneylinePoints.toFixed(2)),
        homeSpreadPoints: Number(homeSpreadPoints.toFixed(2)),
        awaySpreadPoints: Number(awaySpreadPoints.toFixed(2)),
        expectedHomeMargin: Number(expectedHomeMargin.toFixed(2)),
        homeMatchupAdvantage: matchups?.summary?.home_total_advantage || 0,
        awayMatchupAdvantage: matchups?.summary?.away_total_advantage || 0,
        metricsFreshness: advancedMetrics?.asOf || null,
        injuriesAsOf: injuries?.asOf || null,
        featuresUsed: Object.keys(BASE_WEIGHTS),
        advancedFeaturesUsed: Object.keys(ADVANCED_WEIGHTS),
        oddsIntegrated: !!gameOdds,
        notes: [
          hasHistoricalData ? "Historical data integration active" : "Using current season data only",
          hasMatchupData ? "Opponent-specific matchup calculations active" : "Using base team metrics only",
          hasHomeAwayData ? "Reduced home/away location advantages applied" : "Using season averages",
          `Week ${currentWeek} dynamic weighting applied`,
          "FIXED: Single 1.5-point home field advantage applied",
          "FIXED: Reduced offensive/defensive location advantages", 
          "FIXED: Minimal ATS impact on spread only",
          "FIXED: Eliminated compounding home team bias",
          "Model picks based on data-driven team strength analysis",
          "Edge calculations provided for betting analysis overlay",
          gameOdds ? "Live odds integrated" : "Using fallback odds"
        ]
      },
      
      teamStats: {
        home: {
          strength: Number(homeWinProb.toFixed(3)),
          moneylinePoints: Number(homeMoneylinePoints.toFixed(2)),
          spreadPoints: Number(homeSpreadPoints.toFixed(2)),
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
          moneylinePoints: Number(awayMoneylinePoints.toFixed(2)),
          spreadPoints: Number(awaySpreadPoints.toFixed(2)), 
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

    console.log(`Processing ${games.length} games for fixed prediction with season ${season}`);
    
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
