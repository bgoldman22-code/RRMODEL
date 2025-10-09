import { 
  applyAdvancedCalibration, 
  computeAdvancedMarginSigma,
  probCover 
} from './advanced-calibration.mjs';

import { 
  calculateEnhancedTrueEdge,
  shouldTakeBet
} from './market-edge.mjs';

// Clean EPA-based game prediction core - eliminates double counting and fake multipliers

export function calculateCleanGameProbability(homeTeam, awayTeam, gameContext = {}) {
  // Extract core EPA components (no double counting)
  const homeOffEPA = homeTeam?.core?.off_epa || 0;
  const homeDefEPA = homeTeam?.core?.def_epa || 0; 
  const awayOffEPA = awayTeam?.core?.off_epa || 0;
  const awayDefEPA = awayTeam?.core?.def_epa || 0;

  // Core EPA advantage: (home_off - away_def) - (away_off - home_def)
  const homeOffAdvantage = homeOffEPA - awayDefEPA;
  const awayOffAdvantage = awayOffEPA - homeDefEPA;
  const netEPAAdvantage = homeOffAdvantage - awayOffAdvantage;

  // Add only orthogonal factors (not captured in EPA)
  const homeFieldAdvantage = gameContext.isHome ? 0.025 : 0; // ~1.75 point HFA
  const injuryImpact = calculateRealInjuryImpact(homeTeam, awayTeam, gameContext);
  const weatherImpact = calculateWeatherImpact(gameContext.weather);
  
  // Calculate variance for tail modeling
  const gameVariance = calculateGameVariance(homeTeam, awayTeam);
  
  // Logistic regression with clean coefficients
  const logit = (netEPAAdvantage * 1.8) + homeFieldAdvantage + injuryImpact + weatherImpact;
  const baseProb = sigmoid(logit);
  
  // Adjust for variance in close games (reduces overconfidence)
  const isCloseGame = Math.abs(netEPAAdvantage) < 0.02;
  const varianceAdjustment = isCloseGame ? 0.7 : 1.0;
  let finalProb = 0.5 + (baseProb - 0.5) * varianceAdjustment;
  
  // Apply enhanced calibration layer (GPT's mathematical precision + our game context)
  finalProb = applyAdvancedCalibration(finalProb, gameContext.recentGames);
  
  // Calculate enhanced variance (GPT's factors + our weather/division context)
  const enhancedVariance = computeAdvancedMarginSigma(homeTeam, awayTeam, gameContext);
  
  return {
    homeWinProb: clamp(finalProb, 0.15, 0.85),
    netEPAAdvantage,
    gameVariance: enhancedVariance,
    isCloseGame,
    components: {
      epaAdvantage: netEPAAdvantage,
      hfa: homeFieldAdvantage,
      injuries: injuryImpact,
      weather: weatherImpact
    }
  };
}

export function calculateCleanSpread(gameProb) {
  const { homeWinProb, netEPAAdvantage, gameVariance, isCloseGame } = gameProb;
  
  // Convert win probability to point spread
  const logOdds = Math.log(homeWinProb / (1 - homeWinProb));
  const baseSpread = logOdds * 14; // ~14 points per logit unit
  
  // Add variance component for blowout modeling
  const varianceMultiplier = gameVariance > 0.12 ? 1.2 : 1.0;
  const adjustedSpread = baseSpread * varianceMultiplier;
  
  return {
    predictedSpread: clamp(adjustedSpread, -28, 28),
    confidence: isCloseGame ? 0.52 : Math.min(0.75, 0.55 + Math.abs(netEPAAdvantage) * 2),
    blowoutRisk: gameVariance > 0.12 ? 'high' : 'normal',
    varianceComponent: varianceMultiplier - 1
  };
}

export function calculateCleanTotal(homeTeam, awayTeam, gameContext = {}) {
  // Base scoring from EPA (no artificial floors)
  const homeOffEPA = homeTeam?.core?.off_epa || 0;
  const homeDefEPA = homeTeam?.core?.def_epa || 0;
  const awayOffEPA = awayTeam?.core?.off_epa || 0;
  const awayDefEPA = awayTeam?.core?.def_epa || 0;
  
  // Expected points per team (allows for real collapses)
  const homeExpected = Math.max(7, 21 + (homeOffEPA - awayDefEPA) * 25); // Remove 14-point floor
  const awayExpected = Math.max(7, 21 + (awayOffEPA - homeDefEPA) * 25);
  
  // Pace adjustment
  const homePace = homeTeam?.tempo?.pace || 67;
  const awayPace = awayTeam?.tempo?.pace || 67;
  const avgPace = (homePace + awayPace) / 2;
  const paceMultiplier = avgPace / 67;
  
  // Game script: blowouts = fewer plays
  const expectedSpread = Math.abs((homeExpected - awayExpected));
  const gameScriptFactor = expectedSpread > 10 ? 0.92 : expectedSpread > 6 ? 0.96 : 1.0;
  
  // Weather impact (orthogonal to EPA)
  const weatherPenalty = calculateWeatherPenalty(gameContext.weather);
  
  const baseTotal = (homeExpected + awayExpected) * paceMultiplier * gameScriptFactor;
  const finalTotal = baseTotal - weatherPenalty;
  
  return {
    predictedTotal: clamp(finalTotal, 30, 65),
    confidence: 0.58, // Totals inherently harder than sides
    components: {
      homeExpected: Math.round(homeExpected),
      awayExpected: Math.round(awayExpected),
      paceMultiplier: Math.round(paceMultiplier * 100) / 100,
      gameScript: gameScriptFactor,
      weatherPenalty
    }
  };
}

// Utility functions
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculateRealInjuryImpact(homeTeam, awayTeam, gameContext) {
  // Only major injuries (QB, key skill position players)
  const injuries = gameContext.injuries || {};
  let impact = 0;
  
  // QB injuries have major impact
  if (injuries.home_qb_out) impact -= 0.08; // ~5.6 points
  if (injuries.away_qb_out) impact += 0.08;
  
  // Major skill position injuries
  if (injuries.home_key_players_out) impact -= injuries.home_key_players_out * 0.02;
  if (injuries.away_key_players_out) impact += injuries.away_key_players_out * 0.02;
  
  return clamp(impact, -0.15, 0.15);
}

function calculateWeatherImpact(weather) {
  if (!weather) return 0;
  
  let impact = 0;
  
  // Wind significantly impacts passing
  if (weather.wind_mph > 15) impact -= 0.03;
  if (weather.wind_mph > 20) impact -= 0.05;
  
  // Precipitation affects all phases
  if (weather.precipitation === 'heavy') impact -= 0.04;
  if (weather.precipitation === 'moderate') impact -= 0.02;
  
  // Extreme cold
  if (weather.temperature < 20) impact -= 0.03;
  
  return clamp(impact, -0.12, 0);
}

function calculateWeatherPenalty(weather) {
  if (!weather) return 0;
  
  let penalty = 0;
  
  // Wind reduces total scoring
  if (weather.wind_mph > 15) penalty += 2.5;
  if (weather.wind_mph > 20) penalty += 2.0; // Additional
  
  // Precipitation
  if (weather.precipitation === 'heavy') penalty += 3.5;
  if (weather.precipitation === 'moderate') penalty += 1.5;
  
  // Cold weather
  if (weather.temperature < 20) penalty += 2.0;
  
  return Math.min(penalty, 8); // Cap at 8 points
}

function calculateGameVariance(homeTeam, awayTeam) {
  // Base EPA variance (existing)
  const homeOffVar = homeTeam?.variance?.off_epa || 0.08;
  const homeDefVar = homeTeam?.variance?.def_epa || 0.08;
  const awayOffVar = awayTeam?.variance?.off_epa || 0.08;
  const awayDefVar = awayTeam?.variance?.def_epa || 0.08;
  const baseVariance = Math.sqrt(homeOffVar + homeDefVar + awayOffVar + awayDefVar);
  
  // SOPHISTICATED VARIANCE: Explosive play differential creates fat tails
  const homeExplosive = homeTeam?.situational?.explosive_rate || homeTeam?.advanced?.explosive_rate || 0.15;
  const awayExplosive = awayTeam?.situational?.explosive_rate || awayTeam?.advanced?.explosive_rate || 0.15;
  const explosiveDiff = Math.abs(homeExplosive - awayExplosive);
  
  // Pressure differential creates volatility
  const homePressure = homeTeam?.pressure?.pressure_diff || homeTeam?.advanced?.pressure_diff || 0;
  const awayPressure = awayTeam?.pressure?.pressure_diff || awayTeam?.advanced?.pressure_diff || 0;
  const pressureDiff = Math.abs(homePressure - awayPressure);
  
  // Turnover volatility
  const homeTORate = homeTeam?.turnovers?.to_volatility || 0.5;
  const awayTORate = awayTeam?.turnovers?.to_volatility || 0.5;
  const avgTOVolatility = (homeTORate + awayTORate) / 2;
  
  // Fat tails multiplier: high explosive diff = more 10+ and 17+ results  
  const tailFactor = 1 + (explosiveDiff * 2.5) + (pressureDiff * 1.8) + (avgTOVolatility * 0.5);
  
  const finalVariance = Math.min(baseVariance * tailFactor, 0.25);
  
  return finalVariance;
}

// Public team bias detection (from your Week 3 analysis)
export function detectPublicBias(teamCode, marketLine, modelLine) {
  const publicTeams = ['DAL', 'KC', 'GB', 'SF', 'BUF', 'LAR'];
  
  if (!publicTeams.includes(teamCode)) return 1.0;
  
  // If model barely beats market on public team, be skeptical
  const modelAdvantage = Math.abs(modelLine - marketLine);
  if (modelAdvantage < 1.5) {
    return 0.85; // Reduce confidence by 15%
  }
  
  return 1.0;
}

// Enhanced no-bet logic using GPT's precision + our game context
export function shouldSkipBet(prediction, gameContext = {}, marketOdds = null, marketLines = {}) {
  const { homeWinProb, netEPAAdvantage, gameVariance } = prediction;
  
  // Use enhanced bet decision logic
  const betDecision = shouldTakeBet(
    homeWinProb, 
    prediction.predictedSpread || 0,
    marketOdds,
    marketLines.spread,
    {
      ...gameContext,
      gameVariance,
      isCloseGame: Math.abs(netEPAAdvantage) < 0.02,
      highVariance: gameVariance > 0.12
    }
  );
  
  return {
    skip: !betDecision.takeBet,
    reason: betDecision.skipReason,
    trueEdge: betDecision.edgeInfo?.edgePercent || 0,
    contextFlags: betDecision.contextFlags
  };
}

// CRITICAL FIX: True edge calculation with vig removal
function calculateTrueEdge(modelProb, marketOdds) {
  if (!marketOdds || !marketOdds.home || !marketOdds.away) {
    return { edge: 0, vigRemoved: false, hasMinimumEdge: false };
  }
  
  // Convert American odds to implied probabilities
  const homeImplied = americanToImplied(marketOdds.home);
  const awayImplied = americanToImplied(marketOdds.away);
  
  // Remove vig (overround)
  const totalImplied = homeImplied + awayImplied;
  const homeTrue = homeImplied / totalImplied;  // Vig-removed market probability
  
  // True edge = |model_prob - vig_free_market_prob|
  const trueEdge = Math.abs(modelProb - homeTrue);
  
  return {
    edge: trueEdge,
    modelProb,
    marketProb: homeTrue,
    vigRemoved: true,
    hasMinimumEdge: trueEdge >= 0.02, // 2% minimum edge
    edgePercent: Math.round(trueEdge * 100 * 10) / 10 // Round to 1 decimal
  };
}

function americanToImplied(americanOdds) {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

// CRITICAL FIX: Probability calibration layer to prevent 55-65% band drift
function applyProbabilityCalibration(rawProb, recentGames = []) {
  // Only calibrate if we have enough recent data (last 8 weeks)
  if (!recentGames || recentGames.length < 15) {
    return rawProb;
  }
  
  // Special adjustment for 55-65% band (where drift was identified)
  if (rawProb >= 0.55 && rawProb <= 0.65) {
    // Platt scaling adjustment - reduce overconfidence in this range
    const adjustment = -0.03; // Pull back toward 50%
    const logOdds = Math.log(rawProb / (1 - rawProb));
    const adjustedLogOdds = logOdds + adjustment;
    return sigmoid(adjustedLogOdds);
  }
  
  // Light calibration for extreme probabilities
  if (rawProb > 0.75 || rawProb < 0.25) {
    const shrinkageFactor = 0.95; // Slight shrinkage toward 50%
    return 0.5 + (rawProb - 0.5) * shrinkageFactor;
  }
  
  return rawProb;
}