/**
 * MLB HR Round Robin - Modular Selection System
 * 
 * 9 pluggable selection strategies for testing different approaches
 * Each module MUST respect temporal boundaries and constraints
 */

/**
 * Base Selection Module Interface
 */
class BaseSelectionModule {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.config = {};
  }

  /**
   * Select pool from predictions
   * @param {Array} predictions - Player predictions with probabilities
   * @param {Object} constraints - { poolSize, maxPerGame, rrFormat }
   * @param {TemporalBoundary} boundary - Temporal boundary enforcer
   * @returns {Array} Selected player pool
   */
  async select(predictions, constraints, boundary) {
    throw new Error('select() must be implemented by subclass');
  }

  getMetadata() {
    return {
      name: this.name,
      version: this.version,
      config: this.config
    };
  }
}

/**
 * Module 1: Current (EV + Variance Controls)
 * Reproduce production selection logic
 */
class CurrentSelectionModule extends BaseSelectionModule {
  constructor() {
    super('Current (EV + Variance)', '1.0.0');
    this.config = {
      maxPerGame: 2,
      diversityWeight: 0.15,
      protectionBonus: 0.05
    };
  }

  async select(predictions, constraints, boundary) {
    const { poolSize, maxPerGame = 2 } = constraints;
    
    // Sort by EV (probability × implied odds value)
    const sorted = [...predictions].sort((a, b) => b.probability - a.probability);
    
    const pool = [];
    const gamesUsed = new Map();
    
    for (const pred of sorted) {
      if (pool.length >= poolSize) break;
      
      const gameCount = gamesUsed.get(pred.gameId) || 0;
      if (gameCount >= maxPerGame) continue;
      
      // Apply diversity bonus for new games
      const diversityBonus = gameCount === 0 ? this.config.diversityWeight : 0;
      pred.adjustedProb = pred.probability * (1 + diversityBonus);
      
      pool.push(pred);
      gamesUsed.set(pred.gameId, gameCount + 1);
    }
    
    return pool;
  }
}

/**
 * Module 2: Pure EV Ranking
 * Simplest approach - top N by probability
 */
class PureEVSelectionModule extends BaseSelectionModule {
  constructor() {
    super('Pure EV Ranking', '1.0.0');
  }

  async select(predictions, constraints, boundary) {
    const { poolSize } = constraints;
    
    // Simply take top N by probability
    return [...predictions]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, poolSize);
  }
}

/**
 * Module 3: Game-First Diversity
 * Prioritize spreading across different games
 */
class GameFirstDiversityModule extends BaseSelectionModule {
  constructor() {
    super('Game-First Diversity', '1.0.0');
  }

  async select(predictions, constraints, boundary) {
    const { poolSize } = constraints;
    
    // Group by game, take best player from each game first
    const byGame = new Map();
    for (const pred of predictions) {
      if (!byGame.has(pred.gameId)) {
        byGame.set(pred.gameId, []);
      }
      byGame.get(pred.gameId).push(pred);
    }
    
    // Sort each game's players by probability
    for (const [gameId, players] of byGame) {
      byGame.set(gameId, players.sort((a, b) => b.probability - a.probability));
    }
    
    const pool = [];
    let roundRobinIndex = 0;
    const games = Array.from(byGame.keys());
    
    while (pool.length < poolSize) {
      let added = false;
      
      for (const gameId of games) {
        const gamePlayers = byGame.get(gameId);
        if (gamePlayers.length > roundRobinIndex) {
          pool.push(gamePlayers[roundRobinIndex]);
          added = true;
          if (pool.length >= poolSize) break;
        }
      }
      
      if (!added) break; // No more players available
      roundRobinIndex++;
    }
    
    return pool;
  }
}

/**
 * Module 4: Correlation Penalty
 * Penalize same-game stacking in selection
 */
class CorrelationPenaltyModule extends BaseSelectionModule {
  constructor() {
    super('Correlation Penalty', '1.0.0');
    this.config = {
      sameGamePenalty: 0.05 // 5% penalty per same-game player
    };
  }

  async select(predictions, constraints, boundary) {
    const { poolSize } = constraints;
    
    const pool = [];
    const gamesUsed = new Map();
    
    while (pool.length < poolSize) {
      const remaining = predictions.filter(p => !pool.includes(p));
      if (remaining.length === 0) break;
      
      // Calculate penalized scores
      const scored = remaining.map(pred => {
        const gameCount = gamesUsed.get(pred.gameId) || 0;
        const penalty = gameCount * this.config.sameGamePenalty;
        return {
          player: pred,
          score: pred.probability * (1 - penalty)
        };
      });
      
      // Select best
      const best = scored.sort((a, b) => b.score - a.score)[0];
      pool.push(best.player);
      
      const gameCount = gamesUsed.get(best.player.gameId) || 0;
      gamesUsed.set(best.player.gameId, gameCount + 1);
    }
    
    return pool;
  }
}

/**
 * Module 5: Valid Combo Optimizer
 * Maximize valid parlays count
 */
class ValidComboOptimizerModule extends BaseSelectionModule {
  constructor() {
    super('Valid Combo Optimizer', '1.0.0');
  }

  async select(predictions, constraints, boundary) {
    const { poolSize, rrFormat } = constraints;
    
    const pool = [];
    
    while (pool.length < poolSize) {
      const remaining = predictions.filter(p => !pool.includes(p));
      if (remaining.length === 0) break;
      
      let bestCandidate = null;
      let bestValidComboIncrease = 0;
      
      // Try each remaining candidate
      for (const candidate of remaining) {
        const testPool = [...pool, candidate];
        const validCombos = this.countValidCombos(testPool, rrFormat.size);
        
        const currentValidCombos = this.countValidCombos(pool, rrFormat.size);
        const increase = validCombos - currentValidCombos;
        
        // Weight by probability × valid combo increase
        const score = candidate.probability * increase;
        
        if (score > bestValidComboIncrease) {
          bestValidComboIncrease = score;
          bestCandidate = candidate;
        }
      }
      
      if (bestCandidate) {
        pool.push(bestCandidate);
      } else {
        break;
      }
    }
    
    return pool;
  }

  countValidCombos(pool, comboSize) {
    if (pool.length < comboSize) return 0;
    
    const combos = this.generateCombinations(pool, comboSize);
    let validCount = 0;
    
    for (const combo of combos) {
      const games = combo.map(p => p.gameId);
      const uniqueGames = new Set(games);
      if (games.length === uniqueGames.size) {
        validCount++;
      }
    }
    
    return validCount;
  }

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
}

/**
 * Module 6: Dynamic Pool Size
 * Adjust pool size based on slate quality
 */
class DynamicPoolSizeModule extends BaseSelectionModule {
  constructor() {
    super('Dynamic Pool Size', '1.0.0');
    this.config = {
      minPoolSize: 8,
      maxPoolSize: 25,
      qualityThreshold: 0.10
    };
  }

  async select(predictions, constraints, boundary) {
    // Calculate slate quality
    const highQualityCount = predictions.filter(p => 
      p.probability >= this.config.qualityThreshold
    ).length;
    
    const uniqueGames = new Set(predictions.map(p => p.gameId)).size;
    const avgProb = predictions.reduce((sum, p) => sum + p.probability, 0) / predictions.length;
    
    // Quality score based on: # of good matchups, game diversity, avg prob
    const qualityScore = (highQualityCount / 10) + (uniqueGames / 15) + (avgProb / 0.08);
    
    // Scale pool size
    let dynamicPoolSize = Math.round(
      this.config.minPoolSize + 
      (this.config.maxPoolSize - this.config.minPoolSize) * 
      Math.min(1, qualityScore / 3)
    );
    
    // Use dynamic size
    const adjustedConstraints = { ...constraints, poolSize: dynamicPoolSize };
    
    // Use Pure EV selection with dynamic size
    return [...predictions]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, dynamicPoolSize);
  }
}

/**
 * Module 7: Format-Specific Selection (GPT)
 * Different strategies for different RR formats
 */
class FormatSpecificSelectionModule extends BaseSelectionModule {
  constructor() {
    super('Format-Specific Selection', '1.0.0');
    this.formatStrategies = {
      2: { minProb: 0.12, maxPerGame: 1, strategy: 'high_probability' },
      3: { minProb: 0.08, maxPerGame: 2, strategy: 'balanced' },
      4: { minProb: 0.06, maxPerGame: 2, strategy: 'kelly_optimized' },
      5: { minProb: 0.05, maxPerGame: 1, strategy: 'longshot_diversity' }
    };
  }

  async select(predictions, constraints, boundary) {
    const { poolSize, rrFormat } = constraints;
    const formatConfig = this.formatStrategies[rrFormat.size] || this.formatStrategies[3];
    
    // Filter by format-specific threshold
    const candidates = predictions.filter(p => p.probability >= formatConfig.minProb);
    
    // Apply format-specific selection
    switch (formatConfig.strategy) {
      case 'high_probability':
        return candidates.sort((a, b) => b.probability - a.probability).slice(0, poolSize);
      
      case 'balanced':
        return this.selectBalanced(candidates, poolSize, formatConfig.maxPerGame);
      
      case 'kelly_optimized':
        return this.selectKellyOptimized(candidates, poolSize);
      
      case 'longshot_diversity':
        return this.selectMaxDiversity(candidates, poolSize);
      
      default:
        return candidates.slice(0, poolSize);
    }
  }

  selectBalanced(candidates, poolSize, maxPerGame) {
    const pool = [];
    const gamesUsed = new Map();
    
    const sorted = candidates.sort((a, b) => b.probability - a.probability);
    
    for (const pred of sorted) {
      if (pool.length >= poolSize) break;
      
      const gameCount = gamesUsed.get(pred.gameId) || 0;
      if (gameCount >= maxPerGame) continue;
      
      pool.push(pred);
      gamesUsed.set(pred.gameId, gameCount + 1);
    }
    
    return pool;
  }

  selectKellyOptimized(candidates, poolSize) {
    // Sort by Kelly fraction (edge / odds)
    return candidates
      .map(p => ({
        ...p,
        kellyFraction: p.features?.edge || 0
      }))
      .sort((a, b) => b.kellyFraction - a.kellyFraction)
      .slice(0, poolSize);
  }

  selectMaxDiversity(candidates, poolSize) {
    // One player per game maximum
    const byGame = new Map();
    for (const pred of candidates) {
      if (!byGame.has(pred.gameId) || pred.probability > byGame.get(pred.gameId).probability) {
        byGame.set(pred.gameId, pred);
      }
    }
    
    return Array.from(byGame.values())
      .sort((a, b) => b.probability - a.probability)
      .slice(0, Math.min(poolSize, byGame.size));
  }
}

/**
 * Module 8: Exposure-Aware Selection (GPT)
 * Cap player exposure to avoid over-concentration
 */
class ExposureAwareSelectionModule extends BaseSelectionModule {
  constructor() {
    super('Exposure-Aware Selection', '1.0.0');
    this.config = {
      exposureLimit: 0.70 // Max 70% of combos for any player
    };
  }

  async select(predictions, constraints, boundary) {
    const { poolSize, rrFormat } = constraints;
    
    const pool = [];
    
    while (pool.length < poolSize) {
      const remaining = predictions.filter(p => !pool.includes(p));
      if (remaining.length === 0) break;
      
      // Calculate exposure for each candidate if added
      const scored = [];
      for (const candidate of remaining) {
        const testPool = [...pool, candidate];
        const validCombos = this.generateValidCombos(testPool, rrFormat.size);
        
        // Calculate candidate's exposure
        const candidateCombos = validCombos.filter(combo =>
          combo.some(p => p.playerId === candidate.playerId)
        );
        const exposure = candidateCombos.length / Math.max(1, validCombos.length);
        
        // Penalty if over limit
        const exposurePenalty = Math.max(0, exposure - this.config.exposureLimit);
        const score = candidate.probability * (1 - exposurePenalty);
        
        scored.push({ player: candidate, score, exposure });
      }
      
      const best = scored.sort((a, b) => b.score - a.score)[0];
      pool.push(best.player);
    }
    
    return pool;
  }

  generateValidCombos(pool, comboSize) {
    if (pool.length < comboSize) return [];
    
    const combos = this.generateCombinations(pool, comboSize);
    return combos.filter(combo => {
      const games = combo.map(p => p.gameId);
      const uniqueGames = new Set(games);
      return games.length === uniqueGames.size;
    });
  }

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

  generateExposureHeatmap(pool, validCombos, stakes) {
    const heatmap = [];
    
    for (const player of pool) {
      const combosWithPlayer = validCombos.filter(combo =>
        combo.some(p => p.playerId === player.playerId)
      );
      
      const stakeExposure = combosWithPlayer.reduce((sum, combo) => {
        const idx = validCombos.indexOf(combo);
        return sum + (stakes[idx] || 0);
      }, 0);
      
      const totalStake = stakes.reduce((a, b) => a + b, 0);
      
      heatmap.push({
        playerId: player.playerId,
        playerName: player.name,
        comboExposure: combosWithPlayer.length / validCombos.length,
        stakeExposure: stakeExposure / totalStake,
        risk: combosWithPlayer.length * (1 - player.probability)
      });
    }
    
    return heatmap.sort((a, b) => b.comboExposure - a.comboExposure);
  }
}

/**
 * Module 9: Hybrid Optimizer
 * Combines exposure control + format-specific + valid combos
 */
class HybridOptimizerModule extends BaseSelectionModule {
  constructor() {
    super('Hybrid Optimizer', '1.0.0');
    this.exposureModule = new ExposureAwareSelectionModule();
    this.formatModule = new FormatSpecificSelectionModule();
    this.validComboModule = new ValidComboOptimizerModule();
  }

  async select(predictions, constraints, boundary) {
    // Step 1: Format-specific filtering
    const formatFiltered = await this.formatModule.select(
      predictions, 
      { ...constraints, poolSize: constraints.poolSize * 2 }, // Get 2x candidates
      boundary
    );
    
    // Step 2: Valid combo optimization
    const comboOptimized = await this.validComboModule.select(
      formatFiltered,
      { ...constraints, poolSize: Math.ceil(constraints.poolSize * 1.5) }, // Get 1.5x
      boundary
    );
    
    // Step 3: Exposure-aware final selection
    const final = await this.exposureModule.select(
      comboOptimized,
      constraints,
      boundary
    );
    
    return final;
  }
}

/**
 * Selection Module Registry
 */
class SelectionModuleRegistry {
  constructor() {
    this.modules = new Map();
    this.registerDefaultModules();
  }

  registerDefaultModules() {
    this.register(new CurrentSelectionModule());
    this.register(new PureEVSelectionModule());
    this.register(new GameFirstDiversityModule());
    this.register(new CorrelationPenaltyModule());
    this.register(new ValidComboOptimizerModule());
    this.register(new DynamicPoolSizeModule());
    this.register(new FormatSpecificSelectionModule());
    this.register(new ExposureAwareSelectionModule());
    this.register(new HybridOptimizerModule());
  }

  register(module) {
    this.modules.set(module.name, module);
    console.log(`✅ Registered selection module: ${module.name} v${module.version}`);
  }

  get(moduleName) {
    if (!this.modules.has(moduleName)) {
      throw new Error(`Selection module not found: ${moduleName}`);
    }
    return this.modules.get(moduleName);
  }

  listModules() {
    return Array.from(this.modules.values()).map(m => m.getMetadata());
  }
}

export {
  BaseSelectionModule,
  CurrentSelectionModule,
  PureEVSelectionModule,
  GameFirstDiversityModule,
  CorrelationPenaltyModule,
  ValidComboOptimizerModule,
  DynamicPoolSizeModule,
  FormatSpecificSelectionModule,
  ExposureAwareSelectionModule,
  HybridOptimizerModule,
  SelectionModuleRegistry
};
