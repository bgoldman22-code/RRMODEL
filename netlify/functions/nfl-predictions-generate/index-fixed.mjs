// netlify/functions/nfl-predictions-generate/index.mjs
// HYBRID v13 + ENHANCED EPA: Working version with enhanced features

import { loadAdvancedMetrics, loadInjuries, validateAdvancedMetrics, getTeamMetrics, getCurrentWeek, getCurrentWeights, diagnoseMetricsData } from '../_lib/blobs-nfl.js';
import { calculateMatchups, calculateExpectedPlays, calculateMatchupScore } from '../_lib/matchups.js';

// Enhanced EPA utilities - inline to avoid import issues
function calculateCleanGameProbability(homeTeam, awayTeam, gameContext = {}) {
  const homeOffEPA = homeTeam?.core?.off_epa || 0;
  const homeDefEPA = homeTeam?.core?.def_epa || 0; 
  const awayOffEPA = awayTeam?.core?.off_epa || 0;
  const awayDefEPA = awayTeam?.core?.def_epa || 0;

  const homeOffAdvantage = homeOffEPA - awayDefEPA;
  const awayOffAdvantage = awayOffEPA - homeDefEPA;
  const netEPAAdvantage = homeOffAdvantage - awayOffAdvantage;

  const homeFieldAdvantage = gameContext.isHome ? 0.025 : 0;
  const injuryImpact = calculateRealInjuryImpact(homeTeam, awayTeam, gameContext);
  const weatherImpact = calculateWeatherImpact(gameContext.weather);
  
  const logit = (netEPAAdvantage * 1.8) + homeFieldAdvantage + injuryImpact + weatherImpact;
  const baseProb = 1 / (1 + Math.exp(-logit)); // sigmoid
  
  const isCloseGame = Math.abs(netEPAAdvantage) < 0.02;
  const varianceAdjustment = isCloseGame ? 0.85 : 1.0; // Less aggressive than 0.7
  const finalProb = 0.5 + (baseProb - 0.5) * varianceAdjustment;

  // Apply calibration adjustment for 55-65% band
  const calibratedProb = applyCalibrationFix(finalProb);
  
  return {
    homeWinProb: Math.max(0.15, Math.min(0.85, calibratedProb)),
    netEPAAdvantage,
    gameVariance: calculateSimpleVariance(homeTeam, awayTeam),
    isCloseGame,
    components: {
      epaAdvantage: netEPAAdvantage,
      hfa: homeFieldAdvantage,
      injuries: injuryImpact,
      weather: weatherImpact
    }
  };
}

function applyCalibrationFix(prob) {
  // Fix the 55-65% overconfidence band identified in Week 3 analysis
  if (prob >= 0.55 && prob <= 0.65) {
    return prob * 0.92; // Pull back by 8%
  }
  return prob;
}

function calculateSimpleVariance(homeTeam, awayTeam) {
  const homeExplosive = homeTeam?.situational?.explosive_diff || 0;
  const awayExplosive = awayTeam?.situational?.explosive_diff || 0;
  const explosiveDiff = Math.abs(homeExplosive - awayExplosive);
  
  const homePressure = homeTeam?.pressure?.pressure_diff || 0;
  const awayPressure = awayTeam?.pressure?.pressure_diff || 0;  
  const pressureDiff = Math.abs(homePressure - awayPressure);
  
  return 0.08 + (explosiveDiff * 0.15) + (pressureDiff * 0.10);
}

function calculateRealInjuryImpact(homeTeam, awayTeam, gameContext) {
  const injuries = gameContext.injuries || {};
  let impact = 0;
  
  if (injuries.home_qb_out) impact -= 0.08;
  if (injuries.away_qb_out) impact += 0.08;
  if (injuries.home_key_players_out) impact -= injuries.home_key_players_out * 0.02;
  if (injuries.away_key_players_out) impact += injuries.away_key_players_out * 0.02;
  
  return Math.max(-0.15, Math.min(0.15, impact));
}

function calculateWeatherImpact(weather) {
  if (!weather) return 0;
  
  let impact = 0;
  if (weather.wind_speed > 15) impact -= 0.02;
  if (weather.precipitation > 0.5) impact -= 0.015;
  if (weather.temperature < 32) impact -= 0.01;
  
  return Math.max(-0.05, Math.min(0, impact));
}

function shouldSkipBet(prediction, gameContext = {}, marketOdds = null) {
  if (!marketOdds || !prediction) return { skip: false, reason: null };
  
  // Calculate true edge against vig-free market
  const homeMarketProb = americanToImplied(marketOdds.ml_home) || 0.5;
  const awayMarketProb = americanToImplied(marketOdds.ml_away) || 0.5;
  const vigTotal = homeMarketProb + awayMarketProb;
  const vigFreeHome = homeMarketProb / vigTotal;
  
  const modelProb = prediction.homeWinProb;
  const trueEdge = Math.abs(modelProb - vigFreeHome);
  
  // Enhanced no-bet logic
  if (trueEdge < 0.025) { // Minimum 2.5% edge
    return { skip: true, reason: "edge<2.5%" };
  }
  
  if (Math.abs(prediction.netEPAAdvantage) < 0.015 && prediction.isCloseGame) {
    return { skip: true, reason: "margin<2pts" };
  }
  
  if (prediction.gameVariance > 0.15 && trueEdge < 0.04) {
    return { skip: true, reason: "high_variance" };
  }
  
  return { skip: false, reason: null };
}

function detectPublicBias(teamCode, marketLine, modelLine) {
  // Popular teams that often get inflated lines
  const publicTeams = ['DAL', 'GB', 'PIT', 'NE', 'KC', 'SF'];
  
  if (publicTeams.includes(teamCode)) {
    const lineInflation = Math.abs(marketLine) - Math.abs(modelLine);
    if (lineInflation > 1.5) {
      return 0.95; // Reduce confidence by 5%
    }
  }
  
  return 1.0; // No adjustment
}

// v13 LOGIC: Fixed weights and multipliers (same as backup)
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

const SCORING_MULTIPLIERS = {
  CORE_EPA: 24, TIER_BASE: 8, ADVANCED_BASE: 6, MATCHUP_BASE: 3.2, SPECIAL_TEAMS_BASE: 3
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

function z(val, mean = 0, std = 1) { 
  if (isNaN(val) || isNaN(mean) || isNaN(std) || std <= 0) return 0;
  return (val - mean) / std; 
}

function clippedZ(val, mean = 0, std = 1) {
  const rawZ = z(val, mean, std);
  return Math.max(-2.5, Math.min(2.5, rawZ));
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function americanToImplied(american) {
  const odds = Number(american);
  if (!odds || isNaN(odds)) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

// Load live odds (v8 working method)
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

function extractOddsData(gameOdds) {
  if (!gameOdds) return {};
  
  let markets = {};
  
  if (gameOdds.markets) {
    markets = gameOdds.markets;
    console.log('Using direct markets structure');
  } else if (gameOdds.bookmakers?.[0]?.markets) {
    const primaryBook = gameOdds.bookmakers[0];
    primaryBook.markets.forEach(market => {
      markets[market.key] = market.outcomes || [];
    });
    console.log('Using bookmaker structure fallback');
  } else {
    console.warn('No markets found in odds data');
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

// MAIN PREDICTION FUNCTION - Enhanced but simplified
async function generateAdvancedPredictions(games, season) {
  console.log('=== HYBRID v13 + ENHANCED EPA INTEGRATION ===');
  
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
        modelEnhancements: { version: 'hybrid_v13_enhanced_epa', notes: ["Metrics unavailable"] }
      })),
      parlaySuggestions: []
    };
  }

  const league = advancedMetrics?.league || { means: {}, stds: {} };
  const currentWeek = getCurrentWeek(advancedMetrics);
  
  const allOdds = await loadLiveOdds();

  console.log(`Hybrid EPA: Processing ${games.length} games with enhanced logic`);

  const predictions = games.map(game => {
    const homeCode = game.home_team;
    const awayCode = game.away_team;

    console.log(`\n=== HYBRID EPA PREDICTION: ${awayCode} @ ${homeCode} ===`);

    const homeMetrics = getTeamMetrics(advancedMetrics, homeCode);
    const awayMetrics = getTeamMetrics(advancedMetrics, awayCode);

    const gameContext = {
      isHome: true,
      injuries: {
        home_qb_out: injuries?.teams?.[homeCode]?.qb_status === 'out',
        away_qb_out: injuries?.teams?.[awayCode]?.qb_status === 'out',
        home_key_players_out: injuries?.teams?.[homeCode]?.key_injuries || 0,
        away_key_players_out: injuries?.teams?.[awayCode]?.key_injuries || 0
      },
      weather: game.weather || null,
      week: currentWeek,
      divisional: isDivisionalGame(homeCode, awayCode)
    };

    // Use enhanced EPA calculation
    const gameProb = calculateCleanGameProbability(homeMetrics, awayMetrics, gameContext);
    
    const homeWinProb = gameProb.homeWinProb;
    const awayWinProb = 1 - homeWinProb;

    // Calculate spreads using enhanced logic
    const logOdds = Math.log(homeWinProb / (1 - homeWinProb));
    const baseSpread = logOdds * 14;
    const varianceMultiplier = gameProb.gameVariance > 0.12 ? 1.2 : 1.0;
    const predictedSpread = clamp(baseSpread * varianceMultiplier, -28, 28);

    // Calculate totals
    const homeExpected = Math.max(14, 21 + (gameProb.components.epaAdvantage * 25));
    const awayExpected = Math.max(14, 21 - (gameProb.components.epaAdvantage * 25));
    const predictedTotal = clamp(homeExpected + awayExpected, 38, 65);

    // Load market odds
    const gameOdds = findGameOdds(allOdds, homeCode, awayCode);
    const realOdds = gameOdds ? extractOddsData(gameOdds) : {};
    const hasLiveOdds = gameOdds && realOdds.ml_home && realOdds.ml_away;
    
    // Check for no-bet scenarios with proper variable ordering
    const skipCheck = shouldSkipBet(gameProb, gameContext, realOdds);
    
    console.log(`Live odds found: ${hasLiveOdds}, Skip: ${skipCheck.skip}`);
    
    // Moneyline predictions
    const mlPick = homeWinProb > awayWinProb ? homeCode : awayCode;
    const mlModelProb = Math.max(homeWinProb, awayWinProb);
    
    const homeMarketProb = americanToImplied(realOdds.ml_home) || 0.5;
    const awayMarketProb = americanToImplied(realOdds.ml_away) || 0.5;
    const mlMarketProb = mlPick === homeCode ? homeMarketProb : awayMarketProb;
    const mlEdge = mlMarketProb && hasLiveOdds ? Math.abs(mlModelProb - mlMarketProb) : 0;
    
    const publicBiasAdj = detectPublicBias(mlPick, realOdds.spread_line || 0, predictedSpread);
    const adjustedMLConfidence = Math.round((mlModelProb * 100 * publicBiasAdj));
    const mlConfidence = skipCheck.skip ? "—" : adjustedMLConfidence;

    // Spread predictions with enhanced logic
    const marketSpread = hasLiveOdds ? (realOdds.spread_line || 0) : 0;
    const marketFavorite = realOdds.spread_favorite;
    
    let marketHomeMargin = 0;
    if (hasLiveOdds && marketSpread !== 0) {
      marketHomeMargin = marketFavorite === 'home' ? Math.abs(marketSpread) : -Math.abs(marketSpread);
    }
    
    const marginDifference = predictedSpread - marketHomeMargin;
    const spreadThreshold = 2.5;
    
    let spreadPick;
    let displayedSpread;
    
    if (skipCheck.skip || Math.abs(marginDifference) < spreadThreshold) {
      spreadPick = "—";
      displayedSpread = Math.abs(predictedSpread);
    } else if (marginDifference > spreadThreshold) {
      spreadPick = homeCode;
      displayedSpread = Math.abs(predictedSpread);
    } else {
      spreadPick = awayCode;
      displayedSpread = Math.abs(predictedSpread);
    }
    
    const spreadEdge = Math.abs(marginDifference);
    const spreadConfidence = skipCheck.skip ? "—" : Math.round((gameProb.isCloseGame ? 52 : 65));

    // Totals
    const marketTotal = hasLiveOdds ? (realOdds.total_line || 44) : 44;
    const totalDifference = predictedTotal - marketTotal;
    const totalPick = predictedTotal > marketTotal ? 'over' : 'under';
    const totalEdge = Math.abs(totalDifference);
    const totalConfidence = Math.round(58); // Totals inherently harder

    return {
      ...game,
      predictions: {
        home_win_prob: Number(homeWinProb.toFixed(3)),
        away_win_prob: Number(awayWinProb.toFixed(3)),
        moneyline: { 
          pick: skipCheck.skip ? "—" : mlPick, 
          confidence: mlConfidence, 
          edge: skipCheck.skip ? "—" : Number((mlEdge * 100).toFixed(1)),
          noBet: skipCheck.skip,
          skipReason: skipCheck.reason
        },
        spread: { 
          pick: spreadPick, 
          confidence: spreadConfidence, 
          line: hasLiveOdds ? marketSpread : Number(displayedSpread.toFixed(1)),
          predicted: Number(Math.abs(predictedSpread).toFixed(1)),
          edge: skipCheck.skip ? "—" : Number(spreadEdge.toFixed(1)),
          model_home_margin: Number(predictedSpread.toFixed(1)),
          noBet: skipCheck.skip
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
          favorite: realOdds.spread_favorite
        },
        total: { line: realOdds.total_line },
        live_odds_available: hasLiveOdds
      },
      
      modelEnhancements: {
        version: 'hybrid_v13_enhanced_epa',
        fixesApplied: [
          "Enhanced EPA: Clean logic eliminates double counting",
          "Enhanced EPA: 55-65% confidence band calibration fix", 
          "Enhanced EPA: True edge calculation with vig removal",
          "Enhanced EPA: No-bet zones for insufficient edges",
          "Enhanced EPA: Public team bias adjustment",
          "Enhanced EPA: Variance modeling for blowouts",
          "v13: Proven scoring weights and multipliers",
          "v8: Working odds data extraction"
        ],
        skipReason: skipCheck.skip ? skipCheck.reason : null,
        epaComponents: gameProb.components,
        varianceMetrics: {
          gameVariance: gameProb.gameVariance,
          isCloseGame: gameProb.isCloseGame
        }
      },
      
      teamStats: {
        home: {
          strength: Number(homeWinProb.toFixed(3)),
          epa_advantage: Number(gameProb.netEPAAdvantage.toFixed(3))
        },
        away: {
          strength: Number(awayWinProb.toFixed(3)),
          epa_advantage: Number((-gameProb.netEPAAdvantage).toFixed(3))
        }
      }
    };
  });

  // Generate simplified parlay suggestions
  const validPicks = predictions.filter(p => {
    const ml = p.predictions.moneyline;
    const spread = p.predictions.spread;
    return ((ml.confidence !== "—" && ml.confidence > 65 && ml.edge > 8) || 
            (spread.confidence !== "—" && spread.confidence > 62 && spread.edge > 2));
  });

  const parlays = validPicks.length >= 2 ? [{
    type: "conservative_2leg",
    legs: validPicks.slice(0, 2).map(p => `${p.away_team} @ ${p.home_team}: ${p.predictions.moneyline.pick} ML`),
    description: `2-leg ML parlay`,
    risk_level: "Medium",
    recommended_unit: 0.25
  }] : [{
    type: "insufficient_data",
    legs: [],
    description: "Not enough high-confidence picks for parlays",
    risk_level: "N/A",
    recommended_unit: 0
  }];

  return { predictions, parlaySuggestions: parlays };
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
    console.error('Hybrid prediction error:', error);
    
    return new Response(JSON.stringify({
      error: 'Hybrid prediction generation failed',
      message: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

export { generateAdvancedPredictions };