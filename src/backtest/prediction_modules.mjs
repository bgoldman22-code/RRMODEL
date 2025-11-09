/**
 * MLB HR Round Robin - Modular Prediction System
 * 
 * Pluggable prediction modules for testing different approaches
 * Each module MUST respect temporal boundaries (zero data leakage)
 */

import { LeakagePreventionSystem } from './leakage_prevention.mjs';

/**
 * Base Prediction Module Interface
 * All prediction modules must implement this interface
 */
class BasePredictionModule {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.hyperparameters = {};
  }

  /**
   * Generate HR probability for a player
   * @param {Object} context - Simulation context
   * @param {Date} context.date - Game date
   * @param {Object} context.player - Player info
   * @param {Object} context.game - Game info
   * @param {Object} context.historicalData - Historical data UP TO date (enforced by leakage prevention)
   * @param {TemporalBoundary} context.boundary - Temporal boundary enforcer
   * @returns {Object} { playerId, playerName, probability, confidence, features, reasoning }
   */
  async predict(context) {
    throw new Error('predict() must be implemented by subclass');
  }

  /**
   * Train/calibrate module on training data
   * @param {Array} trainingData - Historical games from training split
   */
  async train(trainingData) {
    // Optional - some modules don't need training
    console.log(`${this.name}: No training required`);
  }

  /**
   * Get module metadata
   */
  getMetadata() {
    return {
      name: this.name,
      version: this.version,
      hyperparameters: this.hyperparameters,
      requiresTraining: false
    };
  }
}

/**
 * Module 1: Current Model (Baseline)
 * Uses existing probability model from production
 */
class CurrentModelModule extends BasePredictionModule {
  constructor() {
    super('Current Model (Baseline)', '1.0.0');
    this.hyperparameters = {
      calibrationLambda: 0.25,
      hotColdWindow: 14,
      hotColdCap: 0.06,
      bvpMinAB: 10,
      bvpCap: 0.06,
      protectionCap: 0.05
    };
  }

  async predict(context) {
    const { player, game, historicalData, boundary } = context;
    
    // Ensure we're only using past data
    boundary.isValidDataAccess(context.date, `CurrentModel prediction for ${player.name}`);
    
    // Base probability from pitcher stats
    const baseProb = this.calculateBaseProb(game.pitcher, historicalData.pitcher);
    
    // Apply modifiers (all must use PAST data only)
    const hotCold = this.calculateHotCold(player.id, historicalData.batting, context.date);
    const calibration = this.calculateCalibration(baseProb);
    const pitchType = this.calculatePitchTypeEdge(player.id, game.pitcher.id, historicalData.pitchType);
    const bvp = this.calculateBvP(player.id, game.pitcher.id, historicalData.matchups, context.date);
    const protection = this.calculateProtection(player.id, game.lineup, historicalData.batting);
    
    // Park and weather
    const parkFactor = game.venue.hrFactor || 1.0;
    const weatherMultiplier = this.calculateWeatherMultiplier(game.weather);
    
    // Final probability
    const probability = baseProb
      * (1 + hotCold.modifier)
      * calibration
      * pitchType.multiplier
      * (1 + bvp.modifier)
      * (1 + protection.modifier)
      * parkFactor
      * weatherMultiplier;
    
    return {
      playerId: player.id,
      playerName: player.name,
      probability: Math.max(0.01, Math.min(0.40, probability)), // Cap at 1-40%
      confidence: 0.7, // Baseline confidence
      features: {
        baseProb,
        hotCold: hotCold.modifier,
        calibration,
        pitchType: pitchType.multiplier,
        bvp: bvp.modifier,
        protection: protection.modifier,
        parkFactor,
        weatherMultiplier
      },
      reasoning: `Base: ${(baseProb * 100).toFixed(1)}% × HotCold: ${(1 + hotCold.modifier).toFixed(2)} × BvP: ${(1 + bvp.modifier).toFixed(2)} × Park: ${parkFactor.toFixed(2)}`
    };
  }

  calculateBaseProb(pitcher, pitcherHistorical) {
    // Simplified - actual implementation would be more complex
    const hrPer9 = pitcherHistorical?.hrPer9 || 1.2;
    return 0.08 + (hrPer9 - 1.0) * 0.02; // ~8-12% base
  }

  calculateHotCold(playerId, battingHistorical, asOfDate) {
    // Implementation from leakage_prevention.mjs RollingWindowFeatures
    // MUST only use games from past 14 days BEFORE asOfDate
    return { modifier: 0.0 }; // Placeholder
  }

  calculateCalibration(prob) {
    const lambda = this.hyperparameters.calibrationLambda;
    return 1 - lambda * (1 - prob);
  }

  calculatePitchTypeEdge(batterId, pitcherId, pitchTypeData) {
    // Placeholder
    return { multiplier: 1.0 };
  }

  calculateBvP(batterId, pitcherId, matchupHistory, asOfDate) {
    // Implementation from leakage_prevention.mjs RollingWindowFeatures
    // MUST only use matchups BEFORE asOfDate
    return { modifier: 0.0 }; // Placeholder
  }

  calculateProtection(batterId, lineup, battingHistorical) {
    // Placeholder
    return { modifier: 0.0 };
  }

  calculateWeatherMultiplier(weather) {
    // Placeholder
    return 1.0;
  }
}

/**
 * Module 2: Statcast Enhanced
 * Adds barrel rate, exit velo, launch angle features
 */
class StatcastEnhancedModule extends BasePredictionModule {
  constructor() {
    super('Statcast Enhanced', '1.0.0');
    this.hyperparameters = {
      barrelRateWeight: 0.3,
      exitVeloWeight: 0.2,
      launchAngleConsistencyWeight: 0.15
    };
  }

  async predict(context) {
    const { player, game, historicalData, boundary } = context;
    
    boundary.isValidDataAccess(context.date, `StatcastEnhanced prediction for ${player.name}`);
    
    // Start with current model baseline
    const currentModel = new CurrentModelModule();
    const baseline = await currentModel.predict(context);
    
    // Add Statcast features
    const barrelRate = this.calculateBarrelRate(player.id, historicalData.statcast, context.date);
    const exitVelo = this.calculateExitVeloTrend(player.id, historicalData.statcast, context.date);
    const launchAngle = this.calculateLaunchAngleConsistency(player.id, historicalData.statcast, context.date);
    const sprayChart = this.calculateSprayChartMatch(player.id, game.venue.id, historicalData.statcast);
    
    // Composite Statcast adjustment
    const statcastMultiplier = 
      (1 + barrelRate.adjustment * this.hyperparameters.barrelRateWeight) *
      (1 + exitVelo.adjustment * this.hyperparameters.exitVeloWeight) *
      (1 + launchAngle.adjustment * this.hyperparameters.launchAngleConsistencyWeight) *
      sprayChart.multiplier;
    
    const adjustedProbability = baseline.probability * statcastMultiplier;
    
    return {
      ...baseline,
      probability: Math.max(0.01, Math.min(0.40, adjustedProbability)),
      confidence: 0.75, // Higher confidence with Statcast
      features: {
        ...baseline.features,
        barrelRate: barrelRate.value,
        exitVelo: exitVelo.avg,
        launchAngleConsistency: launchAngle.consistency,
        sprayChartMatch: sprayChart.matchScore,
        statcastMultiplier
      },
      reasoning: `${baseline.reasoning} × Statcast: ${statcastMultiplier.toFixed(2)}`
    };
  }

  calculateBarrelRate(playerId, statcastData, asOfDate) {
    // MUST only use past data
    return { value: 0.08, adjustment: 0.0 };
  }

  calculateExitVeloTrend(playerId, statcastData, asOfDate) {
    return { avg: 90, adjustment: 0.0 };
  }

  calculateLaunchAngleConsistency(playerId, statcastData, asOfDate) {
    return { consistency: 0.5, adjustment: 0.0 };
  }

  calculateSprayChartMatch(playerId, venueId, statcastData) {
    return { matchScore: 0.5, multiplier: 1.0 };
  }
}

/**
 * Module 3: Pure EV (No Variance Engineering)
 * Simplest approach - just rank by probability
 */
class PureEVModule extends BasePredictionModule {
  constructor() {
    super('Pure EV (No Variance Controls)', '1.0.0');
  }

  async predict(context) {
    // Use current model but remove variance controls
    const currentModel = new CurrentModelModule();
    const result = await currentModel.predict(context);
    
    return {
      ...result,
      reasoning: `Pure EV: ${(result.probability * 100).toFixed(1)}% (no variance engineering)`
    };
  }
}

/**
 * Module 4: Correlation-Aware
 * Penalizes same-game stacking in probability
 */
class CorrelationAwareModule extends BasePredictionModule {
  constructor() {
    super('Correlation-Aware', '1.0.0');
    this.hyperparameters = {
      sameGamePenalty: 0.05, // 5% penalty for each same-game player already selected
      samePitcherBonus: 0.03 // 3% bonus for facing same (bad) pitcher
    };
  }

  async predict(context) {
    const { player, game, historicalData, boundary, currentPool } = context;
    
    const currentModel = new CurrentModelModule();
    const baseline = await currentModel.predict(context);
    
    // Check for same-game correlations in current pool
    const sameGamePlayers = (currentPool || []).filter(p => p.gameId === game.id);
    const sameGamePenalty = sameGamePlayers.length * this.hyperparameters.sameGamePenalty;
    
    const adjustedProb = baseline.probability * (1 - sameGamePenalty);
    
    return {
      ...baseline,
      probability: Math.max(0.01, Math.min(0.40, adjustedProb)),
      features: {
        ...baseline.features,
        sameGamePlayers: sameGamePlayers.length,
        correlationPenalty: sameGamePenalty
      },
      reasoning: `${baseline.reasoning} - ${(sameGamePenalty * 100).toFixed(1)}% same-game penalty`
    };
  }
}

/**
 * Module 5: Kelly Criterion
 * Optimal stake sizing based on edge
 */
class KellyCriterionModule extends BasePredictionModule {
  constructor() {
    super('Kelly Criterion', '1.0.0');
    this.hyperparameters = {
      kellyFraction: 0.25 // Use 1/4 Kelly for safety
    };
  }

  async predict(context) {
    const { player, game, historicalData, boundary, marketOdds } = context;
    
    const currentModel = new CurrentModelModule();
    const baseline = await currentModel.predict(context);
    
    // Calculate Kelly fraction
    const modelProb = baseline.probability;
    const marketProb = this.impliedProbability(marketOdds[player.id]);
    const edge = modelProb - marketProb;
    const kellyFraction = edge > 0 ? (modelProb * marketOdds[player.id] - 1) / marketOdds[player.id] : 0;
    
    return {
      ...baseline,
      features: {
        ...baseline.features,
        marketProb,
        edge,
        kellyFraction: kellyFraction * this.hyperparameters.kellyFraction
      },
      confidence: edge > 0.02 ? 0.85 : 0.5, // High confidence if big edge
      reasoning: `${baseline.reasoning} | Edge: ${(edge * 100).toFixed(1)}% | Kelly: ${(kellyFraction * 100).toFixed(1)}%`
    };
  }

  impliedProbability(americanOdds) {
    if (americanOdds > 0) {
      return 100 / (americanOdds + 100);
    } else {
      return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    }
  }
}

/**
 * Module 6: ML-Based (Placeholder for XGBoost/LightGBM)
 * Would train on historical features
 */
class MLBasedModule extends BasePredictionModule {
  constructor() {
    super('ML-Based (XGBoost)', '1.0.0');
    this.model = null;
    this.hyperparameters = {
      maxDepth: 6,
      learningRate: 0.1,
      nEstimators: 100
    };
  }

  async train(trainingData) {
    console.log(`${this.name}: Training on ${trainingData.length} samples...`);
    // TODO: Implement XGBoost training
    // this.model = trainXGBoost(trainingData, this.hyperparameters);
    console.log(`${this.name}: Training complete`);
  }

  async predict(context) {
    // Placeholder - would use trained model
    const currentModel = new CurrentModelModule();
    return await currentModel.predict(context);
  }

  getMetadata() {
    return {
      ...super.getMetadata(),
      requiresTraining: true
    };
  }
}

/**
 * Prediction Module Registry
 */
class PredictionModuleRegistry {
  constructor() {
    this.modules = new Map();
    this.registerDefaultModules();
  }

  registerDefaultModules() {
    this.register(new CurrentModelModule());
    this.register(new StatcastEnhancedModule());
    this.register(new PureEVModule());
    this.register(new CorrelationAwareModule());
    this.register(new KellyCriterionModule());
    this.register(new MLBasedModule());
  }

  register(module) {
    this.modules.set(module.name, module);
    console.log(`✅ Registered prediction module: ${module.name} v${module.version}`);
  }

  get(moduleName) {
    if (!this.modules.has(moduleName)) {
      throw new Error(`Prediction module not found: ${moduleName}`);
    }
    return this.modules.get(moduleName);
  }

  listModules() {
    return Array.from(this.modules.values()).map(m => m.getMetadata());
  }
}

export {
  BasePredictionModule,
  CurrentModelModule,
  StatcastEnhancedModule,
  PureEVModule,
  CorrelationAwareModule,
  KellyCriterionModule,
  MLBasedModule,
  PredictionModuleRegistry
};
