// netlify/functions/_lib/advanced-calibration.mjs
// Enhanced calibration combining our approach with GPT's mathematical precision

// GPT's precise erf function for normal distribution calculations
function erf(x) {
  // Abramowitz-Stegun approximation
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429;
  const p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1/(1+p*x);
  const y = 1-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return sign*y;
}

// GPT's precise normal probability calculation
export function probCover(mu, sigma, k) {
  // P(Margin > k) with normal approximation
  const z = (mu - k) / (sigma || 1e-9);
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Enhanced Platt calibration with GPT's precision
export function plattCalibrate(p, params = { a: 1, b: 0 }) {
  const { a = 1, b = 0 } = params;
  if (p <= 0 || p >= 1) return p;
  const logit = (x) => Math.log(x / (1 - x));
  const inv = (y) => 1 / (1 + Math.exp(-y));
  return inv(a * logit(p) + b);
}

// GPT's band pinch - more sophisticated than our fixed adjustment
export function bandPinch(p, pinch = 0.03) {
  if (p >= 0.55 && p <= 0.65) {
    const logit = (x) => Math.log(x / (1 - x));
    const inv = (y) => 1 / (1 + Math.exp(-y));
    return inv(logit(p) - Math.sign(p - 0.5) * pinch);
  }
  return p;
}

// Enhanced variance calculation combining our game context with GPT's mathematical approach
export function computeAdvancedMarginSigma(homeTeam, awayTeam, gameContext = {}) {
  // Base EPA variance (our existing approach)
  const homeOffVar = homeTeam?.variance?.off_epa || 0.08;
  const homeDefVar = homeTeam?.variance?.def_epa || 0.08;
  const awayOffVar = awayTeam?.variance?.off_epa || 0.08;
  const awayDefVar = awayTeam?.variance?.def_epa || 0.08;
  const baseVariance = Math.sqrt(homeOffVar + homeDefVar + awayOffVar + awayDefVar);
  
  // GPT's sophisticated variance factors
  const hexpl = homeTeam?.situational?.explosive_rate || homeTeam?.advanced?.explosive_rate || 0.10;
  const aexpl = awayTeam?.situational?.explosive_rate || awayTeam?.advanced?.explosive_rate || 0.10;
  const explDiff = Math.abs(hexpl - aexpl);
  
  const hpress = homeTeam?.pressure?.pressure_diff || homeTeam?.advanced?.pressure_diff || 0;
  const apress = awayTeam?.pressure?.pressure_diff || awayTeam?.advanced?.pressure_diff || 0;
  const pressDiff = Math.abs(hpress - apress);
  
  const qbUnc = Math.max(
    (homeTeam?.injuries?.qb_uncertainty || 0),
    (awayTeam?.injuries?.qb_uncertainty || 0)
  );
  
  const runRateBoth = Math.max(0, Math.min(1, 
    0.5 * ((homeTeam?.tempo?.run_rate || 0.45) + (awayTeam?.tempo?.run_rate || 0.45))
  ));
  
  // Our weather/game context (GPT doesn't have this)
  const weatherFactor = gameContext.weather?.wind_mph > 20 ? 1.2 : 1.0;
  const divisionFactor = gameContext.isDivisional ? 0.9 : 1.0; // Division games more predictable
  
  // GPT's sigma calculation enhanced with our game context
  let sigma = 6.0
    + 8.0 * Math.max(0, Math.min(1, explDiff * 4))
    + 4.0 * Math.max(0, Math.min(1, Math.abs(pressDiff) / 3))
    + 3.0 * Math.max(0, Math.min(1, qbUnc))
    - 1.5 * runRateBoth;
  
  // Apply our game context factors
  sigma *= weatherFactor * divisionFactor;
  
  return Math.max(4.5, Math.min(sigma, 12)); // GPT's reasonable bounds
}

// Enhanced probability calibration combining both approaches
export function applyAdvancedCalibration(rawProb, recentGames = [], calibrationType = 'platt') {
  // Our existing check for sufficient data
  if (!recentGames || recentGames.length < 15) {
    return rawProb;
  }
  
  // GPT's Platt scaling (more sophisticated than our simple adjustment)
  let calibrated = rawProb;
  
  if (calibrationType === 'platt' && recentGames.length >= 20) {
    // Could fit parameters from recent games here
    // For now, use our empirical adjustment for the 55-65% band
    calibrated = plattCalibrate(rawProb, { a: 0.97, b: -0.02 }); // Slight shrinkage
  }
  
  // Apply GPT's band pinch for the problematic 55-65% range
  calibrated = bandPinch(calibrated, 0.03);
  
  // Our additional extreme probability handling
  if (calibrated > 0.75 || calibrated < 0.25) {
    const shrinkageFactor = 0.95;
    calibrated = 0.5 + (calibrated - 0.5) * shrinkageFactor;
  }
  
  return calibrated;
}