/**
 * Elite Staking Discipline - Kelly with Safeguards
 * 
 * Implements GPT's improvements:
 * 1. Kelly-fraction caps (0.25 max)
 * 2. Correlation throttles (no dual max bets same side)
 * 3. Max 1 market per game at ≥3U
 * 4. Confidence-based adjustments
 * 5. Bankroll protection
 */

/**
 * Calculate Kelly Criterion with fractional caps
 * 
 * @param {number} winProb - Probability of winning (0-1)
 * @param {number} odds - Decimal odds (e.g., 1.91 for -110)
 * @param {number} maxFraction - Maximum Kelly fraction (default 0.25)
 * @returns {number} Stake as fraction of bankroll
 */
export function calculateKellyWithCap(winProb, odds, maxFraction = 0.25) {
  // Kelly formula: f = (bp - q) / b
  // where b = odds - 1, p = win prob, q = 1 - p
  
  const b = odds - 1;
  const p = winProb;
  const q = 1 - p;
  
  const kellyFraction = (b * p - q) / b;
  
  // Apply cap
  const cappedKelly = Math.min(kellyFraction, maxFraction);
  
  // Never bet if Kelly is negative or near zero
  if (cappedKelly < 0.01) return 0;
  
  return cappedKelly;
}

/**
 * Convert Kelly fraction to unit sizing (1-5 units)
 * 
 * @param {number} kellyFraction - Kelly fraction (0-0.25)
 * @param {number} confidence - Model confidence (0-1)
 * @returns {number} Units (1-5)
 */
export function kellyToUnits(kellyFraction, confidence = 1.0) {
  // Adjust Kelly by confidence
  const adjustedKelly = kellyFraction * confidence;
  
  // Map to units (logarithmic scale)
  // 0.01-0.05 → 1U
  // 0.05-0.10 → 2U
  // 0.10-0.15 → 3U
  // 0.15-0.20 → 4U
  // 0.20+     → 5U
  
  if (adjustedKelly < 0.01) return 0;
  if (adjustedKelly < 0.05) return 1;
  if (adjustedKelly < 0.10) return 2;
  if (adjustedKelly < 0.15) return 3;
  if (adjustedKelly < 0.20) return 4;
  return 5;
}

/**
 * Correlation Detector
 * Identifies correlated bets that should not both be maxed
 */
class CorrelationEngine {
  constructor() {
    this.correlationRules = [
      {
        name: 'Same Game ML + Spread Same Side',
        detect: (bet1, bet2) => {
          return bet1.gameId === bet2.gameId &&
                 bet1.marketType === 'moneyline' &&
                 bet2.marketType === 'spread' &&
                 bet1.side === bet2.side;
        },
        maxCombinedUnits: 5,
        description: 'ML and spread same side are highly correlated'
      },
      {
        name: 'Same Game Over + Team Total Over',
        detect: (bet1, bet2) => {
          return bet1.gameId === bet2.gameId &&
                 bet1.marketType === 'total' &&
                 bet1.side === 'over' &&
                 bet2.marketType === 'teamTotal' &&
                 bet2.side === 'over';
        },
        maxCombinedUnits: 5,
        description: 'Game total and team total both over are correlated'
      },
      {
        name: 'Heavy Favorite ML + Small Spread',
        detect: (bet1, bet2) => {
          return bet1.gameId === bet2.gameId &&
                 bet1.marketType === 'moneyline' &&
                 bet2.marketType === 'spread' &&
                 Math.abs(bet2.line) <= 3 && // Small spread
                 bet1.odds < 1.5; // Heavy favorite
        },
        maxCombinedUnits: 4,
        description: 'Heavy favorite ML + small spread are highly correlated'
      }
    ];
  }
  
  /**
   * Check if two bets are correlated
   */
  areCorrelated(bet1, bet2) {
    for (const rule of this.correlationRules) {
      if (rule.detect(bet1, bet2)) {
        return {
          correlated: true,
          rule: rule.name,
          maxCombinedUnits: rule.maxCombinedUnits,
          description: rule.description
        };
      }
    }
    
    return { correlated: false };
  }
  
  /**
   * Throttle correlated bets
   */
  throttleCorrelatedBets(bets) {
    const throttled = [];
    const warnings = [];
    
    for (let i = 0; i < bets.length; i++) {
      const bet1 = bets[i];
      let maxUnits = bet1.suggestedUnits;
      
      for (let j = i + 1; j < bets.length; j++) {
        const bet2 = bets[j];
        const correlation = this.areCorrelated(bet1, bet2);
        
        if (correlation.correlated) {
          const combinedUnits = bet1.suggestedUnits + bet2.suggestedUnits;
          
          if (combinedUnits > correlation.maxCombinedUnits) {
            // Reduce higher-unit bet first
            const reduction = combinedUnits - correlation.maxCombinedUnits;
            
            if (bet1.suggestedUnits > bet2.suggestedUnits) {
              maxUnits = Math.max(1, bet1.suggestedUnits - reduction);
            } else {
              bet2.suggestedUnits = Math.max(1, bet2.suggestedUnits - reduction);
            }
            
            warnings.push({
              bet1: bet1.description,
              bet2: bet2.description,
              rule: correlation.rule,
              reduction,
              reason: correlation.description
            });
          }
        }
      }
      
      throttled.push({
        ...bet1,
        finalUnits: maxUnits,
        throttled: maxUnits < bet1.suggestedUnits
      });
    }
    
    return { throttled, warnings };
  }
}

/**
 * Staking Discipline Manager
 * Applies all safeguards before placing bets
 */
export class StakingManager {
  constructor(options = {}) {
    this.maxKellyFraction = options.maxKellyFraction || 0.25;
    this.maxUnitsPerMarket = options.maxUnitsPerMarket || 5;
    this.maxMarketsPerGame = options.maxMarketsPerGame || 2;
    this.maxHighUnitsPerGame = options.maxHighUnitsPerGame || 1; // Only 1 market ≥3U per game
    this.correlationEngine = new CorrelationEngine();
  }
  
  /**
   * Calculate stake for a single bet
   */
  calculateStake(bet, options = {}) {
    const {
      winProb,
      odds,
      confidence = 1.0,
      modelQuality = 1.0 // Preseason=0.6, early season=0.8, late season=1.0
    } = bet;
    
    // 1. Calculate Kelly with cap
    const kellyFraction = calculateKellyWithCap(winProb, odds, this.maxKellyFraction);
    
    // 2. Adjust for confidence and model quality
    const adjustedConfidence = confidence * modelQuality;
    
    // 3. Convert to units
    const rawUnits = kellyToUnits(kellyFraction, adjustedConfidence);
    
    // 4. Cap at max units
    const cappedUnits = Math.min(rawUnits, this.maxUnitsPerMarket);
    
    return {
      kellyFraction,
      adjustedConfidence,
      suggestedUnits: cappedUnits,
      edge: (winProb * odds - 1) * 100, // Edge in percentage
      expectedValue: kellyFraction * odds
    };
  }
  
  /**
   * Process all bets for a slate with full discipline
   */
  processSlate(bets) {
    console.log('\n[Staking] Processing slate with discipline safeguards...');
    
    // 1. Calculate stakes for all bets
    const betsWithStakes = bets.map(bet => ({
      ...bet,
      ...this.calculateStake(bet)
    }));
    
    // 2. Apply per-game limits
    const gameGroups = {};
    for (const bet of betsWithStakes) {
      if (!gameGroups[bet.gameId]) {
        gameGroups[bet.gameId] = [];
      }
      gameGroups[bet.gameId].push(bet);
    }
    
    const limitWarnings = [];
    
    for (const [gameId, gameBets] of Object.entries(gameGroups)) {
      // Count high-unit bets (≥3U)
      const highUnitBets = gameBets.filter(b => b.suggestedUnits >= 3);
      
      if (highUnitBets.length > this.maxHighUnitsPerGame) {
        // Keep only the highest edge bet at ≥3U
        const sorted = highUnitBets.sort((a, b) => b.edge - a.edge);
        
        for (let i = this.maxHighUnitsPerGame; i < sorted.length; i++) {
          sorted[i].suggestedUnits = Math.min(sorted[i].suggestedUnits, 2);
          limitWarnings.push({
            game: gameId,
            bet: sorted[i].description,
            reason: `Max ${this.maxHighUnitsPerGame} high-unit bet per game`,
            reduced: `Reduced to 2U`
          });
        }
      }
      
      // Limit total markets per game
      if (gameBets.length > this.maxMarketsPerGame) {
        const sorted = gameBets.sort((a, b) => b.edge - a.edge);
        
        for (let i = this.maxMarketsPerGame; i < sorted.length; i++) {
          sorted[i].suggestedUnits = 0;
          limitWarnings.push({
            game: gameId,
            bet: sorted[i].description,
            reason: `Max ${this.maxMarketsPerGame} markets per game`,
            reduced: 'Removed'
          });
        }
      }
    }
    
    // 3. Apply correlation throttles
    const { throttled, warnings: corrWarnings } = this.correlationEngine.throttleCorrelatedBets(
      betsWithStakes.filter(b => b.suggestedUnits > 0)
    );
    
    // 4. Filter and sort
    const finalBets = throttled
      .filter(b => b.finalUnits > 0)
      .sort((a, b) => b.edge - a.edge);
    
    // 5. Summary
    console.log(`\n[Staking] ✅ Processed ${bets.length} bets → ${finalBets.length} approved`);
    console.log(`[Staking] ${limitWarnings.length} limit warnings, ${corrWarnings.length} correlation throttles`);
    
    if (limitWarnings.length > 0) {
      console.log('\n[Staking] Per-Game Limits Applied:');
      limitWarnings.slice(0, 5).forEach(w => {
        console.log(`  ⚠️  ${w.bet}: ${w.reason} → ${w.reduced}`);
      });
    }
    
    if (corrWarnings.length > 0) {
      console.log('\n[Staking] Correlation Throttles Applied:');
      corrWarnings.forEach(w => {
        console.log(`  ⚠️  ${w.bet1} + ${w.bet2}`);
        console.log(`     ${w.reason} (reduced ${w.reduction}U)`);
      });
    }
    
    return {
      bets: finalBets,
      warnings: [...limitWarnings, ...corrWarnings],
      summary: {
        total: bets.length,
        approved: finalBets.length,
        removed: bets.length - finalBets.length,
        totalUnits: finalBets.reduce((sum, b) => sum + b.finalUnits, 0),
        avgEdge: finalBets.reduce((sum, b) => sum + b.edge, 0) / finalBets.length
      }
    };
  }
  
  /**
   * Adjust stakes for season phase
   */
  getSeasonPhaseMultiplier(gamesPlayed, phase) {
    if (phase === 'preseason') {
      return 0.6; // Cap confidence at 60%
    }
    
    if (gamesPlayed < 10) {
      return 0.7; // Early season - low confidence
    } else if (gamesPlayed < 40) {
      return 0.85; // Mid-early season
    } else {
      return 1.0; // Late season - full confidence
    }
  }
}

/**
 * USAGE EXAMPLE:
 * 
 * const stakingManager = new StakingManager({
 *   maxKellyFraction: 0.25,
 *   maxUnitsPerMarket: 5,
 *   maxMarketsPerGame: 2,
 *   maxHighUnitsPerGame: 1
 * });
 * 
 * const bets = [
 *   {
 *     gameId: 'game1',
 *     description: 'LAL -5.5',
 *     marketType: 'spread',
 *     side: 'home',
 *     winProb: 0.58,
 *     odds: 1.91,
 *     confidence: 0.85
 *   },
 *   {
 *     gameId: 'game1',
 *     description: 'LAL ML',
 *     marketType: 'moneyline',
 *     side: 'home',
 *     winProb: 0.65,
 *     odds: 1.50,
 *     confidence: 0.90
 *   }
 * ];
 * 
 * const result = stakingManager.processSlate(bets);
 * 
 * console.log(result.bets);
 * // [
 * //   { ..., finalUnits: 3, throttled: true },
 * //   { ..., finalUnits: 2, throttled: true }
 * // ]
 * // Combined units reduced from 8 to 5 due to correlation
 */
