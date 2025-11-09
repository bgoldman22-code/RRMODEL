/**
 * MLB Home Run Round Robin Generator
 * 
 * CRITICAL FANDUEL CONSTRAINT (corrected understanding):
 * 
 * ✅ You CAN include multiple players from the same game in your Round Robin pool
 * ❌ You CANNOT combine them in the same parlay combo
 * 💰 Invalid combos are NOT charged (don't cost money) but also DON'T PAY
 * 
 * Example: 6-leg RR by 4s = 15 total combos
 * - If 2 legs are from same game: only 9 combos are valid
 * - You're charged for 9, not 15
 * - Need MORE winners since invalid combos don't contribute
 * 
 * IMPLICATIONS:
 * 1. Pool selection can include same-game players (spreading risk is fine)
 * 2. Must filter OUT same-game combos when generating parlays
 * 3. Stake calculation must use VALID combo count (not total generated)
 * 4. ROI calculation requires knowing true parlay count
 * 5. Hit rate math changes (fewer combos = need higher win % on remaining)
 * 
 * This module:
 * 1. Generates all possible combos from pool (including invalid)
 * 2. Filters to only VALID combos (different games per combo)
 * 3. Calculates TRUE stake per combo based on valid count
 * 4. Scores by: joint probability × payout × game diversity
 * 5. Provides accurate ROI projections
 */

/**
 * Validate that a combo has no duplicate games (FanDuel rule)
 * @param {Array} combo - Array of picks with { gameId, ... }
 * @returns {boolean} true if valid (all different games)
 */
function isValidCombo(combo) {
  const games = new Set();
  for (const pick of combo) {
    const gameId = pick.gameId || pick.game || pick.matchup;
    if (!gameId) return false; // Must have game identifier
    if (games.has(gameId)) return false; // Duplicate game = INVALID (won't be charged/paid)
    games.add(gameId);
  }
  return true;
}

/**
 * Convert American odds to decimal
 */
function americanToDecimal(american) {
  const odds = Number(american);
  if (!isFinite(odds)) return 2.0; // fallback
  return odds >= 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

/**
 * Calculate combo expected value
 * @param {Array} combo - Array of picks with { prob, american }
 * @returns {Object} { hitProb, payout, ev, evPerDollar }
 */
function calculateComboEV(combo) {
  if (!combo || combo.length === 0) {
    return { hitProb: 0, payout: 1, ev: -1, evPerDollar: -1 };
  }

  // Joint probability (assuming independence for now - correlation adjustment later)
  let hitProb = 1;
  for (const pick of combo) {
    const p = Number(pick.prob || pick.p_model || 0);
    if (p <= 0 || p > 1) return { hitProb: 0, payout: 1, ev: -1, evPerDollar: -1 };
    hitProb *= p;
  }

  // Payout multiplier (decimal odds combined)
  let payout = 1;
  for (const pick of combo) {
    const decimal = americanToDecimal(pick.american || pick.odds);
    payout *= decimal;
  }

  // EV = (hitProb × payout) - 1
  const ev = hitProb * payout - 1;
  const evPerDollar = ev; // per $1 wagered

  return { hitProb, payout, ev: evPerDollar };
}

/**
 * Score combo for ranking: considers EV, game spread, and probability balance
 * Higher score = better combo
 */
function scoreCombo(combo, opts = {}) {
  const { hitProb, payout, ev } = calculateComboEV(combo);
  
  // Game coverage bonus: spreading across games is good
  const uniqueGames = new Set(combo.map(p => p.gameId || p.game)).size;
  const coverageBonus = uniqueGames === combo.length ? 1.1 : 1.0; // 10% bonus for full spread

  // Probability balance: penalize combos with one super-longshot
  const probs = combo.map(p => Number(p.prob || p.p_model || 0));
  const minProb = Math.min(...probs);
  const maxProb = Math.max(...probs);
  const balancePenalty = minProb < 0.10 ? 0.85 : 1.0; // penalize if any leg < 10%

  // Final score: EV weighted by coverage and balance
  const score = ev * coverageBonus * balancePenalty;

  return {
    combo,
    hitProb,
    payout,
    ev,
    score,
    uniqueGames,
    legs: combo.length
  };
}

/**
 * Generate all k-combinations from array
 */
function* combinations(arr, k) {
  if (k === 0) {
    yield [];
    return;
  }
  if (arr.length < k) return;
  
  for (let i = 0; i <= arr.length - k; i++) {
    const head = arr[i];
    const tail = arr.slice(i + 1);
    for (const subCombo of combinations(tail, k - 1)) {
      yield [head, ...subCombo];
    }
  }
}

/**
 * Generate round robin suggestions with FanDuel constraint enforcement
 * 
 * @param {Array} picks - Array of HR picks with { name, gameId, prob, american, ... }
 * @param {Object} opts - Options { sizes: [2,3,4], maxCombosPerSize: 10, minProb: 0.15, minEV: 0.00 }
 * @returns {Object} { suggestions: { 2: [], 3: [], 4: [] }, validation: {...}, stats: {...} }
 */
export function generateMLBHrRoundRobin(picks, opts = {}) {
  const {
    sizes = [2, 3, 4],
    maxCombosPerSize = 10,
    minProb = 0.15, // Min individual leg probability
    minEV = 0.00,   // Min combo EV to include
    maxPoolSize = 15 // Max picks to consider (top by prob or EV)
  } = opts;

  // Validation
  const validation = {
    totalPicks: picks.length,
    picksWithGameId: 0,
    picksWithoutGameId: [],
    picksUnderMinProb: 0,
    uniqueGames: 0
  };

  // Filter picks
  const validPicks = picks.filter(p => {
    const hasGameId = !!(p.gameId || p.game);
    const prob = Number(p.prob || p.p_model || 0);
    const hasProb = prob >= minProb;
    const hasOdds = !!(p.american || p.odds);

    if (!hasGameId) {
      validation.picksWithoutGameId.push(p.name || 'Unknown');
    } else {
      validation.picksWithGameId++;
    }

    if (prob < minProb) {
      validation.picksUnderMinProb++;
    }

    return hasGameId && hasProb && hasOdds;
  });

  // Count unique games
  validation.uniqueGames = new Set(validPicks.map(p => p.gameId || p.game)).size;

  // Limit pool size (take top by probability)
  const pool = validPicks
    .sort((a, b) => {
      const probA = Number(a.prob || a.p_model || 0);
      const probB = Number(b.prob || b.p_model || 0);
      return probB - probA;
    })
    .slice(0, maxPoolSize);

  const suggestions = {};
  const stats = {
    totalCombosGenerated: 0,
    totalCombosValidated: 0,
    totalCombosFiltered: 0,
    invalidSameGame: 0
  };

  // Generate combos for each size
  for (const size of sizes) {
    if (pool.length < size) {
      suggestions[size] = [];
      continue;
    }

    const validCombos = [];
    
    for (const combo of combinations(pool, size)) {
      stats.totalCombosGenerated++;
      
      // CRITICAL: Enforce FanDuel constraint
      if (!isValidCombo(combo)) {
        stats.invalidSameGame++;
        continue;
      }
      
      stats.totalCombosValidated++;
      
      const scored = scoreCombo(combo);
      
      // Filter by minimum EV
      if (scored.ev >= minEV) {
        validCombos.push(scored);
      } else {
        stats.totalCombosFiltered++;
      }
    }

    // Sort by score and take top N
    validCombos.sort((a, b) => b.score - a.score);
    suggestions[size] = validCombos.slice(0, maxCombosPerSize);
  }

  return {
    suggestions,
    validation,
    stats,
    constraintEnforced: true,
    constraintDescription: "FanDuel rule: Max 1 player per game per combo"
  };
}

/**
 * Format round robin for display
 */
export function formatRoundRobinDisplay(rrResult) {
  const { suggestions, validation, stats } = rrResult;
  
  const display = {
    summary: {
      totalPicks: validation.totalPicks,
      validPicks: validation.picksWithGameId,
      uniqueGames: validation.uniqueGames,
      combosGenerated: stats.totalCombosGenerated,
      combosValid: stats.totalCombosValidated,
      combosSameGameRejected: stats.invalidSameGame
    },
    combos: []
  };

  // Format each size
  for (const [size, combos] of Object.entries(suggestions)) {
    for (const scored of combos) {
      display.combos.push({
        size: parseInt(size),
        legs: scored.combo.map(p => ({
          name: p.name,
          game: p.gameId || p.game,
          prob: Number(p.prob || p.p_model || 0),
          odds: p.american || p.odds
        })),
        hitProb: scored.hitProb,
        payout: scored.payout,
        ev: scored.ev,
        score: scored.score
      });
    }
  }

  // Sort by score
  display.combos.sort((a, b) => b.score - a.score);

  return display;
}

/**
 * Calculate stake distribution for round robin
 * @param {Object} rrResult - Result from generateMLBHrRoundRobin
 * @param {number} totalBankroll - Total $ to allocate
 * @returns {Object} Stake recommendations per combo
 */
export function calculateRoundRobinStakes(rrResult, totalBankroll = 100) {
  const { suggestions } = rrResult;
  
  // Count total combos
  let totalCombos = 0;
  let totalEV = 0;
  
  for (const combos of Object.values(suggestions)) {
    for (const scored of combos) {
      totalCombos++;
      totalEV += Math.max(0, scored.ev); // Only count positive EV
    }
  }

  if (totalCombos === 0 || totalEV <= 0) {
    return {
      totalCombos: 0,
      totalBankroll,
      stakes: [],
      message: "No positive EV combos found"
    };
  }

  // Allocate proportional to EV
  const stakes = [];
  
  for (const [size, combos] of Object.entries(suggestions)) {
    for (const scored of combos) {
      const evWeight = Math.max(0, scored.ev) / totalEV;
      const stake = totalBankroll * evWeight;
      
      stakes.push({
        size: parseInt(size),
        combo: scored.combo.map(p => p.name).join(' + '),
        legs: scored.combo,
        hitProb: scored.hitProb,
        payout: scored.payout,
        ev: scored.ev,
        stake: stake,
        expectedProfit: stake * scored.ev
      });
    }
  }

  return {
    totalCombos,
    totalBankroll,
    stakes: stakes.sort((a, b) => b.stake - a.stake),
    message: `${totalCombos} combos with total +EV of ${(totalEV * 100).toFixed(1)}%`
  };
}

/**
 * Analyze constraint impact (for backtesting/reporting)
 * Compare WITH vs WITHOUT same-game constraint
 */
export function analyzeConstraintImpact(picks, opts = {}) {
  // Generate WITH constraint (valid)
  const withConstraint = generateMLBHrRoundRobin(picks, opts);
  
  // Generate WITHOUT constraint (simulate naive approach)
  const withoutConstraintPicks = [];
  const size = opts.sizes ? opts.sizes[0] : 3;
  const maxCombos = opts.maxCombosPerSize || 10;
  
  // Sort by prob and take top, allowing duplicates
  const pool = [...picks]
    .filter(p => Number(p.prob || p.p_model || 0) >= (opts.minProb || 0.15))
    .sort((a, b) => {
      const probA = Number(a.prob || a.p_model || 0);
      const probB = Number(b.prob || b.p_model || 0);
      return probB - probA;
    })
    .slice(0, opts.maxPoolSize || 15);

  let naiveCombos = 0;
  let naiveInvalid = 0;

  for (const combo of combinations(pool, size)) {
    naiveCombos++;
    if (!isValidCombo(combo)) {
      naiveInvalid++;
    }
    if (naiveCombos >= maxCombos * 5) break; // Sample size
  }

  return {
    withConstraint: {
      totalCombos: withConstraint.stats.totalCombosValidated,
      avgEV: calculateAvgEV(withConstraint.suggestions)
    },
    withoutConstraint: {
      totalCombosGenerated: naiveCombos,
      invalidCombos: naiveInvalid,
      invalidRate: naiveInvalid / naiveCombos,
      message: `${((naiveInvalid / naiveCombos) * 100).toFixed(1)}% of naive combos would be INVALID on FanDuel`
    },
    impact: {
      comboReduction: 1 - (withConstraint.stats.totalCombosValidated / naiveCombos),
      message: `Enforcing constraint reduces available combos by ${((1 - withConstraint.stats.totalCombosValidated / naiveCombos) * 100).toFixed(1)}%`
    }
  };
}

function calculateAvgEV(suggestions) {
  let total = 0;
  let count = 0;
  for (const combos of Object.values(suggestions)) {
    for (const scored of combos) {
      total += scored.ev;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

export default {
  generateMLBHrRoundRobin,
  formatRoundRobinDisplay,
  calculateRoundRobinStakes,
  analyzeConstraintImpact,
  isValidCombo
};
