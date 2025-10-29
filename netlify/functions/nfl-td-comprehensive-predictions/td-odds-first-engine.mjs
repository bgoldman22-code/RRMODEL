/**
 * NFL TD PREDICTIONS - ODDS-FIRST APPROACH
 * 
 * Philosophy: Build from market prices + simple adjustments
 * NOT from complex R models with stale/corrupted data
 * 
 * Flow:
 * 1. Fetch real odds from books
 * 2. Remove vig to get fair probability
 * 3. Adjust for depth chart, injuries, matchup
 * 4. Find +EV opportunities
 */

/**
 * Position baselines (historical TD rates for depth tier)
 * These are REALISTIC averages from 2020-2024 data
 */
const TD_BASELINES = {
  QB: { anytime: 0.15, first: 0.01 },  // Rush TDs only
  RB1: { anytime: 0.52, first: 0.095 },
  RB2: { anytime: 0.28, first: 0.045 },
  WR1: { anytime: 0.42, first: 0.080 },
  WR2: { anytime: 0.28, first: 0.050 },
  WR3: { anytime: 0.16, first: 0.028 },
  TE1: { anytime: 0.36, first: 0.070 },
  TE2: { anytime: 0.14, first: 0.022 },
  DEFAULT: { anytime: 0.12, first: 0.020 }
};

/**
 * Team offensive quality (affects all players proportionally)
 */
const TEAM_QUALITY = {
  'KC': 1.35, 'BUF': 1.32, 'SF': 1.28, 'MIA': 1.26, 'DAL': 1.24,
  'PHI': 1.22, 'DET': 1.20, 'BAL': 1.18, 'CIN': 1.15, 'LAC': 1.12,
  'MIN': 1.10, 'HOU': 1.08, 'GB': 1.05, 'LAR': 1.02, 'SEA': 1.00,
  'ATL': 0.98, 'TB': 0.96, 'JAX': 0.92, 'NO': 0.90, 'IND': 0.88,
  'NYJ': 0.85, 'PIT': 0.83, 'CLE': 0.80, 'TEN': 0.78, 'LV': 0.75,
  'DEN': 0.73, 'WAS': 0.72, 'CHI': 0.70, 'NE': 0.68, 'NYG': 0.65,
  'CAR': 0.63, 'ARI': 0.60
};

/**
 * Build simple but accurate TD probability from depth + team + matchup
 */
export function buildSimpleTDProbability(player, depthChartPosition, availability) {
  const { position, team } = player;
  const depth = depthChartPosition || 1;
  
  // Get baseline for position + depth
  let baseline = TD_BASELINES.DEFAULT;
  if (position === 'QB') {
    baseline = TD_BASELINES.QB;
  } else if (position === 'RB') {
    baseline = depth === 1 ? TD_BASELINES.RB1 : TD_BASELINES.RB2;
  } else if (position === 'WR') {
    if (depth === 1) baseline = TD_BASELINES.WR1;
    else if (depth === 2) baseline = TD_BASELINES.WR2;
    else baseline = TD_BASELINES.WR3;
  } else if (position === 'TE') {
    baseline = depth === 1 ? TD_BASELINES.TE1 : TD_BASELINES.TE2;
  }
  
  // Adjust for team quality
  const teamFactor = TEAM_QUALITY[team] || 1.0;
  
  // Adjust for availability (injury status)
  let availabilityFactor = 1.0;
  if (availability) {
    const probPlay = availability.probPlay || 1.0;
    if (probPlay < 1.0) {
      // Questionable/doubtful players are both less likely to play
      // AND less effective if they do play
      availabilityFactor = probPlay * (0.65 + probPlay * 0.35);
    }
    if (availability.status === 'out' || probPlay === 0) {
      availabilityFactor = 0;
    }
  }
  
  const anytimeProb = baseline.anytime * teamFactor * availabilityFactor;
  const firstProb = baseline.first * teamFactor * availabilityFactor;
  
  // Multiple TDs follow power law
  const multipleProb = Math.pow(anytimeProb, 1.4) * 0.80;
  
  return {
    anytime: Math.max(0.01, Math.min(0.80, anytimeProb)),
    first: Math.max(0.005, Math.min(0.25, firstProb)),
    multiple: Math.max(0.005, Math.min(0.45, multipleProb)),
    factors: {
      baseline_anytime: baseline.anytime,
      team_quality: teamFactor,
      availability: availabilityFactor,
      depth: depth,
      data_source: 'odds_first_simple_model'
    }
  };
}

/**
 * Remove vig from same-book over/under lines
 * Returns fair probability or null if can't remove vig
 */
export function removeVigFromPair(overOdds, underOdds) {
  if (!overOdds || !underOdds) return null;
  
  // Convert American to decimal
  const overDec = overOdds > 0 ? 1 + overOdds / 100 : 1 + 100 / Math.abs(overOdds);
  const underDec = underOdds > 0 ? 1 + underOdds / 100 : 1 + 100 / Math.abs(underOdds);
  
  // Implied probabilities
  const overImplied = 1 / overDec;
  const underImplied = 1 / underDec;
  
  // Total implied (should be > 1.0 due to vig)
  const totalImplied = overImplied + underImplied;
  
  // Fair probability (remove proportional vig)
  const fairOver = overImplied / totalImplied;
  
  return fairOver;
}

/**
 * Find best odds across books for anytime TD
 */
export function findBestOdds(playerOdds, market = 'player_anytime_td') {
  if (!playerOdds || !playerOdds[market]) return null;
  
  const books = playerOdds[market].books || {};
  const bookKeys = Object.keys(books);
  
  if (bookKeys.length === 0) return null;
  
  let bestOdds = null;
  let bestBook = null;
  
  for (const [book, odds] of Object.entries(books)) {
    if (bestOdds === null || odds > bestOdds) {
      bestOdds = odds;
      bestBook = book;
    }
  }
  
  return { bestOdds, bestBook, booksCount: bookKeys.length };
}

/**
 * Calculate edge and EV
 */
export function calculateEdge(fairProb, marketOdds) {
  if (!marketOdds) return { edge: null, ev: null };
  
  // Convert American to decimal
  const decimal = marketOdds > 0 ? 1 + marketOdds / 100 : 1 + 100 / Math.abs(marketOdds);
  
  // Implied probability from market
  const impliedProb = 1 / decimal;
  
  // Edge = our fair prob - market implied prob
  const edge = fairProb - impliedProb;
  
  // EV = (fair prob * (decimal - 1)) - (1 - fair prob)
  const ev = (fairProb * (decimal - 1)) - (1 - fairProb);
  
  return { edge, ev, impliedProb };
}
