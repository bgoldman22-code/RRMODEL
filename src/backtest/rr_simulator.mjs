/**
 * MLB HR Round Robin - RR Simulator
 * 
 * Core simulation engine that:
 * - Enforces FanDuel constraint (same-game allowed in pool, not in combos)
 * - Generates all valid RR combinations
 * - Calculates P&L with real odds
 * - Integrates leakage prevention, exposure tracking
 * - Simulates full slate from prediction → selection → execution → results
 */

import { TemporalBoundary, LeakagePreventionSystem } from './leakage_prevention.mjs';
import { ExposureTracker } from './exposure_tracker.mjs';
import { CLVTracker } from './clv_tracker.mjs';

/**
 * RR Simulator
 * Simulates round robin betting with all constraints
 */
class RRSimulator {
  constructor(config = {}) {
    this.config = {
      maxPerGameInPool: config.maxPerGameInPool || 999, // Pool can have unlimited
      maxPerGameInCombo: config.maxPerGameInCombo || 1, // FanDuel constraint: 1 per combo
      minOdds: config.minOdds || -200,
      maxOdds: config.maxOdds || 800,
      vigorish: config.vigorish || 0.05, // 5% vig
      ...config
    };
    
    this.leakageSystem = new LeakagePreventionSystem();
    this.exposureTracker = new ExposureTracker();
    this.clvTracker = new CLVTracker();
  }

  /**
   * Simulate entire slate
   * @param {Object} slate - Date, games, predictions
   * @param {Object} predictionModule - Prediction module to use
   * @param {Object} selectionModule - Selection module to use
   * @param {Object} rrConfig - RR format config { poolSize, rrFormat, stakes }
   * @param {TemporalBoundary} boundary - Temporal enforcer
   */
  async simulateSlate(slate, predictionModule, selectionModule, rrConfig, boundary) {
    const { date, games, players } = slate;
    const { poolSize, rrFormat, stakes } = rrConfig;
    
    // Step 1: Generate predictions for all players
    const predictions = await this.generatePredictions(
      players,
      predictionModule,
      boundary,
      date
    );
    
    // Step 2: Select pool
    const pool = await selectionModule.select(
      predictions,
      { poolSize, maxPerGame: this.config.maxPerGameInPool, rrFormat },
      boundary
    );
    
    // Step 3: Generate valid RR combinations (respects FanDuel constraint)
    const combos = this.generateValidCombos(pool, rrFormat.size);
    
    // Step 4: Allocate stakes
    const allocatedStakes = this.allocateStakes(combos, stakes);
    
    // Step 5: Track exposure
    const exposure = this.exposureTracker.analyzeExposure(pool, combos, allocatedStakes);
    
    // Step 6: Record CLV snapshot
    this.clvTracker.recordSnapshot(date, pool);
    
    // Step 7: Simulate execution (with odds)
    const execution = await this.executeRR(
      pool,
      combos,
      allocatedStakes,
      games,
      boundary
    );
    
    // Step 8: Resolve outcomes
    const results = await this.resolveOutcomes(
      execution,
      games,
      boundary
    );
    
    return {
      date,
      pool,
      combos,
      stakes: allocatedStakes,
      exposure,
      execution,
      results,
      
      summary: {
        totalInvested: results.totalInvested,
        totalPayout: results.totalPayout,
        netProfit: results.netProfit,
        roi: results.roi,
        hitRate: results.hitRate
      }
    };
  }

  /**
   * Generate predictions for all players
   */
  async generatePredictions(players, predictionModule, boundary, date) {
    const predictions = [];
    
    for (const player of players) {
      const context = {
        date,
        player,
        game: player.game,
        historicalData: {}, // Would load from database
        boundary
      };
      
      const prediction = await predictionModule.predict(context, boundary);
      
      predictions.push({
        playerId: player.id,
        name: player.name,
        team: player.team,
        gameId: player.gameId,
        matchup: player.matchup,
        probability: prediction.probability,
        confidence: prediction.confidence,
        features: prediction.features,
        reasoning: prediction.reasoning
      });
    }
    
    return predictions.sort((a, b) => b.probability - a.probability);
  }

  /**
   * Generate valid RR combos (FanDuel constraint)
   */
  generateValidCombos(pool, comboSize) {
    const allCombos = this.generateCombinations(pool, comboSize);
    
    // Filter for FanDuel constraint: max 1 per game per combo
    const validCombos = allCombos.filter(combo => {
      const games = combo.map(p => p.gameId);
      const uniqueGames = new Set(games);
      return games.length === uniqueGames.size; // All different games
    });
    
    return validCombos;
  }

  /**
   * Generate all combinations
   */
  generateCombinations(arr, k) {
    if (k === 1) return arr.map(item => [item]);
    if (k === arr.length) return [arr];
    
    const combos = [];
    for (let i = 0; i <= arr.length - k; i++) {
      const head = arr[i];
      const tailCombos = this.generateCombinations(arr.slice(i + 1), k - 1);
      for (const tail of tailCombos) {
        combos.push([head, ...tail]);
      }
    }
    return combos;
  }

  /**
   * Allocate stakes across combos
   */
  allocateStakes(combos, stakes) {
    if (typeof stakes === 'number') {
      // Equal stakes
      const stakePerCombo = stakes / combos.length;
      return new Array(combos.length).fill(stakePerCombo);
    }
    
    if (Array.isArray(stakes)) {
      // Custom allocation
      if (stakes.length !== combos.length) {
        throw new Error(`Stakes array length (${stakes.length}) must match combos (${combos.length})`);
      }
      return stakes;
    }
    
    if (typeof stakes === 'object' && stakes.allocation) {
      // Stake allocation strategy
      return this.applyStakeAllocation(combos, stakes);
    }
    
    throw new Error('Invalid stakes configuration');
  }

  /**
   * Apply stake allocation strategy
   */
  applyStakeAllocation(combos, stakeConfig) {
    const { total, allocation } = stakeConfig;
    const allocatedStakes = [];
    
    switch (allocation) {
      case 'kelly':
        // Kelly criterion sizing
        for (const combo of combos) {
          const comboProbability = combo.reduce((prod, p) => prod * p.probability, 1);
          const avgOdds = this.estimateComboOdds(combo);
          const edge = (comboProbability * avgOdds - 1) / avgOdds;
          const kellyFraction = Math.max(0, edge);
          const stake = total * kellyFraction * 0.25; // Quarter Kelly
          allocatedStakes.push(stake);
        }
        break;
      
      case 'equal':
        const equalStake = total / combos.length;
        allocatedStakes.push(...new Array(combos.length).fill(equalStake));
        break;
      
      case 'probability':
        // Weight by combo probability
        const totalProb = combos.reduce((sum, combo) => {
          return sum + combo.reduce((prod, p) => prod * p.probability, 1);
        }, 0);
        
        for (const combo of combos) {
          const comboProbability = combo.reduce((prod, p) => prod * p.probability, 1);
          const stake = total * (comboProbability / totalProb);
          allocatedStakes.push(stake);
        }
        break;
      
      default:
        throw new Error(`Unknown allocation strategy: ${allocation}`);
    }
    
    // Normalize to total
    const sum = allocatedStakes.reduce((a, b) => a + b, 0);
    return allocatedStakes.map(s => s * (total / sum));
  }

  /**
   * Execute RR (place bets with odds)
   */
  async executeRR(pool, combos, stakes, games, boundary) {
    const executions = [];
    
    for (let i = 0; i < combos.length; i++) {
      const combo = combos[i];
      const stake = stakes[i];
      
      // Get odds for each player in combo
      const comboWithOdds = combo.map(player => ({
        ...player,
        odds: this.getPlayerOdds(player, games),
        impliedProbability: this.getImpliedProbability(player, games)
      }));
      
      // Calculate parlay odds
      const parlayOdds = this.calculateParlayOdds(comboWithOdds);
      const potentialPayout = stake * parlayOdds;
      
      executions.push({
        combo: comboWithOdds,
        stake,
        parlayOdds,
        potentialPayout,
        comboProbability: combo.reduce((prod, p) => prod * p.probability, 1)
      });
    }
    
    // Record execution for CLV
    this.clvTracker.recordExecution(new Date().toISOString(), pool);
    
    return executions;
  }

  /**
   * Resolve outcomes
   */
  async resolveOutcomes(executions, games, boundary) {
    const outcomes = [];
    let totalInvested = 0;
    let totalPayout = 0;
    let hitsCount = 0;
    
    for (const execution of executions) {
      totalInvested += execution.stake;
      
      // Check if all players in combo hit HR
      const comboResults = execution.combo.map(player => ({
        player: player.name,
        actual: this.getActualOutcome(player, games), // Would query from database
        predicted: player.probability
      }));
      
      const allHit = comboResults.every(r => r.actual === true);
      const payout = allHit ? execution.potentialPayout : 0;
      totalPayout += payout;
      
      if (allHit) hitsCount++;
      
      outcomes.push({
        combo: execution.combo.map(p => p.name),
        stake: execution.stake,
        results: comboResults,
        hit: allHit,
        payout,
        profit: payout - execution.stake
      });
    }
    
    const netProfit = totalPayout - totalInvested;
    const roi = netProfit / totalInvested;
    const hitRate = hitsCount / executions.length;
    
    return {
      outcomes,
      totalInvested,
      totalPayout,
      netProfit,
      roi,
      hitRate,
      hitsCount,
      totalCombos: executions.length
    };
  }

  /**
   * Get player odds from market data
   */
  getPlayerOdds(player, games) {
    // Would query from odds database
    // Placeholder: estimate from probability with vig
    const trueOdds = (1 / player.probability) - 1;
    const americanOdds = this.decimalToAmerican(trueOdds + 1);
    return americanOdds;
  }

  /**
   * Get implied probability from market
   */
  getImpliedProbability(player, games) {
    const odds = this.getPlayerOdds(player, games);
    return this.americanOddsToImpliedProbability(odds);
  }

  /**
   * Calculate parlay odds
   */
  calculateParlayOdds(combo) {
    // Convert American odds to decimal
    const decimalOdds = combo.map(p => this.americanToDecimal(p.odds));
    
    // Multiply decimal odds
    const parlayDecimal = decimalOdds.reduce((prod, odds) => prod * odds, 1);
    
    return parlayDecimal;
  }

  /**
   * Get actual outcome (from historical data)
   */
  getActualOutcome(player, games) {
    // Would query from database
    // Placeholder: simulate based on probability
    return Math.random() < player.probability;
  }

  /**
   * Estimate combo odds
   */
  estimateComboOdds(combo) {
    const comboProbability = combo.reduce((prod, p) => prod * p.probability, 1);
    return (1 / comboProbability);
  }

  /**
   * Convert decimal to American odds
   */
  decimalToAmerican(decimal) {
    if (decimal >= 2.0) {
      return Math.round((decimal - 1) * 100);
    } else {
      return Math.round(-100 / (decimal - 1));
    }
  }

  /**
   * Convert American to decimal odds
   */
  americanToDecimal(american) {
    if (american > 0) {
      return (american / 100) + 1;
    } else {
      return (100 / Math.abs(american)) + 1;
    }
  }

  /**
   * American odds to implied probability
   */
  americanOddsToImpliedProbability(americanOdds) {
    if (americanOdds > 0) {
      return 100 / (americanOdds + 100);
    } else {
      return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    }
  }

  /**
   * Batch simulate multiple slates
   */
  async batchSimulate(slates, predictionModule, selectionModule, rrConfig, boundary) {
    const results = [];
    
    for (const slate of slates) {
      console.log(`Simulating slate: ${slate.date}`);
      
      try {
        const result = await this.simulateSlate(
          slate,
          predictionModule,
          selectionModule,
          rrConfig,
          boundary
        );
        
        results.push(result);
      } catch (error) {
        console.error(`Error simulating ${slate.date}:`, error.message);
        results.push({
          date: slate.date,
          error: error.message
        });
      }
    }
    
    return this.aggregateResults(results);
  }

  /**
   * Aggregate batch results
   */
  aggregateResults(results) {
    const validResults = results.filter(r => !r.error);
    
    if (validResults.length === 0) {
      return { error: 'No valid simulations' };
    }

    const totalInvested = validResults.reduce((sum, r) => sum + r.results.totalInvested, 0);
    const totalPayout = validResults.reduce((sum, r) => sum + r.results.totalPayout, 0);
    const netProfit = totalPayout - totalInvested;
    const roi = netProfit / totalInvested;
    
    const avgHitRate = validResults.reduce((sum, r) => sum + r.results.hitRate, 0) / validResults.length;
    const avgComboCount = validResults.reduce((sum, r) => sum + r.results.totalCombos, 0) / validResults.length;
    
    // Daily ROIs for volatility
    const dailyROIs = validResults.map(r => r.results.roi);
    const roiStdDev = this.calculateStdDev(dailyROIs);
    const sharpeRatio = roi / roiStdDev;
    
    // Win/loss streaks
    const streaks = this.calculateStreaks(validResults);
    
    return {
      summary: {
        totalSlates: validResults.length,
        totalInvested,
        totalPayout,
        netProfit,
        roi,
        avgHitRate,
        avgComboCount,
        roiStdDev,
        sharpeRatio
      },
      
      daily: validResults.map(r => ({
        date: r.date,
        invested: r.results.totalInvested,
        payout: r.results.totalPayout,
        profit: r.results.netProfit,
        roi: r.results.roi,
        hitRate: r.results.hitRate
      })),
      
      streaks,
      
      best: validResults.sort((a, b) => b.results.roi - a.results.roi)[0],
      worst: validResults.sort((a, b) => a.results.roi - b.results.roi)[0]
    };
  }

  /**
   * Calculate win/loss streaks
   */
  calculateStreaks(results) {
    let currentStreak = 0;
    let currentType = null;
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    
    for (const result of results) {
      const isWin = result.results.roi > 0;
      
      if (isWin) {
        if (currentType === 'win') {
          currentStreak++;
        } else {
          currentStreak = 1;
          currentType = 'win';
        }
        longestWinStreak = Math.max(longestWinStreak, currentStreak);
      } else {
        if (currentType === 'loss') {
          currentStreak++;
        } else {
          currentStreak = 1;
          currentType = 'loss';
        }
        longestLossStreak = Math.max(longestLossStreak, currentStreak);
      }
    }
    
    return {
      longestWinStreak,
      longestLossStreak,
      current: { type: currentType, length: currentStreak }
    };
  }

  /**
   * Calculate standard deviation
   */
  calculateStdDev(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

export { RRSimulator };
