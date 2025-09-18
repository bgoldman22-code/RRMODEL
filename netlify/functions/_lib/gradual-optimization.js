// netlify/functions/_lib/gradual-optimization.js
// Conservative ML integration with statistical significance requirements

import { loadBlob, storeBlob } from './blob_io.js';

/**
 * Conservative ML optimization that only makes statistically significant adjustments
 * Gradually increases adjustment magnitude as more data becomes available
 */

export class GradualOptimizer {
  constructor() {
    this.minWeeksRequired = 4;     // Need 4 weeks minimum for any adjustments
    this.maxAdjustmentPercent = {  // Maximum allowed adjustment per parameter
      week_4_6: 5,    // 5% max adjustment early season
      week_7_9: 10,   // 10% max adjustment mid season
      week_10_plus: 15 // 15% max adjustment late season
    };
    this.significanceThreshold = 0.05; // p-value threshold
  }

  /**
   * Load historical performance data for analysis
   */
  async loadPerformanceHistory() {
    try {
      const performanceData = await loadBlob('nfl', 'optimization/performance-history.json');
      return performanceData || { weeks: [], summary: {} };
    } catch (error) {
      console.warn('No performance history found, starting fresh');
      return { weeks: [], summary: {} };
    }
  }

  /**
   * Analyze statistical significance of observed biases
   */
  analyzeStatisticalSignificance(performanceData) {
    const analysis = {
      significantBiases: [],
      suggestedAdjustments: {},
      confidence: 'low',
      sampleSize: 0
    };

    if (!performanceData.weeks || performanceData.weeks.length < this.minWeeksRequired) {
      analysis.confidence = 'insufficient_data';
      return analysis;
    }

    // Aggregate data across all weeks
    const allGames = performanceData.weeks.flatMap(week => week.games || []);
    analysis.sampleSize = allGames.length;

    // Statistical tests for common biases
    const biasTests = this.runBiasTests(allGames);
    
    // Only suggest adjustments for statistically significant biases
    Object.entries(biasTests).forEach(([biasType, testResult]) => {
      if (testResult.pValue < this.significanceThreshold && testResult.effect > 0.1) {
        analysis.significantBiases.push({
          type: biasType,
          pValue: testResult.pValue,
          effectSize: testResult.effect,
          description: testResult.description
        });

        // Calculate conservative adjustment
        const adjustment = this.calculateConservativeAdjustment(
          biasType, 
          testResult.effect, 
          analysis.sampleSize
        );
        
        if (adjustment.parameter && Math.abs(adjustment.change) > 0.001) {
          analysis.suggestedAdjustments[adjustment.parameter] = adjustment;
        }
      }
    });

    // Set confidence based on sample size
    if (analysis.sampleSize >= 64) analysis.confidence = 'high';
    else if (analysis.sampleSize >= 48) analysis.confidence = 'medium';
    else analysis.confidence = 'low';

    return analysis;
  }

  /**
   * Run statistical tests for common prediction biases
   */
  runBiasTests(games) {
    const tests = {};

    // Home bias test (should be ~50% home picks)
    const homePicks = games.filter(g => g.predictions?.ml_pick === g.home_team).length;
    const homePickRate = homePicks / games.length;
    tests.home_bias = {
      pValue: this.binomialTest(homePicks, games.length, 0.5),
      effect: Math.abs(homePickRate - 0.5),
      description: `Home pick rate: ${(homePickRate * 100).toFixed(1)}% (expected: 50%)`
    };

    // Over/under bias test
    const overPicks = games.filter(g => g.predictions?.total_pick === 'over').length;
    const overPickRate = overPicks / games.length;
    tests.over_bias = {
      pValue: this.binomialTest(overPicks, games.length, 0.5),
      effect: Math.abs(overPickRate - 0.5),
      description: `Over pick rate: ${(overPickRate * 100).toFixed(1)}% (expected: 50%)`
    };

    // Spread error bias (should be ~0 average)
    const spreadErrors = games
      .filter(g => g.results?.spread_error !== undefined)
      .map(g => g.results.spread_error);
    
    if (spreadErrors.length > 0) {
      const meanError = spreadErrors.reduce((sum, err) => sum + err, 0) / spreadErrors.length;
      const stdError = Math.sqrt(
        spreadErrors.reduce((sum, err) => sum + Math.pow(err - meanError, 2), 0) / spreadErrors.length
      );
      
      tests.spread_bias = {
        pValue: this.tTest(meanError, stdError, spreadErrors.length, 0),
        effect: Math.abs(meanError),
        description: `Average spread error: ${meanError.toFixed(2)} points (expected: ~0)`
      };
    }

    // Total error bias
    const totalErrors = games
      .filter(g => g.results?.total_error !== undefined)
      .map(g => g.results.total_error);
    
    if (totalErrors.length > 0) {
      const meanTotalError = totalErrors.reduce((sum, err) => sum + err, 0) / totalErrors.length;
      const stdTotalError = Math.sqrt(
        totalErrors.reduce((sum, err) => sum + Math.pow(err - meanTotalError, 2), 0) / totalErrors.length
      );
      
      tests.total_bias = {
        pValue: this.tTest(meanTotalError, stdTotalError, totalErrors.length, 0),
        effect: Math.abs(meanTotalError),
        description: `Average total error: ${meanTotalError.toFixed(2)} points (expected: ~0)`
      };
    }

    return tests;
  }

  /**
   * Simple binomial test approximation
   */
  binomialTest(successes, trials, expectedRate) {
    const observed = successes / trials;
    const expected = expectedRate;
    const variance = expected * (1 - expected) / trials;
    const zScore = Math.abs(observed - expected) / Math.sqrt(variance);
    
    // Rough p-value approximation (2-tailed)
    return 2 * (1 - this.normalCDF(zScore));
  }

  /**
   * Simple t-test approximation
   */
  tTest(mean, std, n, expectedMean) {
    const tStat = Math.abs(mean - expectedMean) / (std / Math.sqrt(n));
    
    // Rough p-value approximation for t-distribution
    if (tStat < 1.96) return 0.05 + (0.45 * (1.96 - tStat) / 1.96);
    return Math.max(0.001, 0.05 * Math.exp(-0.5 * tStat));
  }

  /**
   * Normal CDF approximation
   */
  normalCDF(z) {
    return 0.5 * (1 + Math.sign(z) * Math.sqrt(1 - Math.exp(-2 * z * z / Math.PI)));
  }

  /**
   * Calculate conservative parameter adjustment
   */
  calculateConservativeAdjustment(biasType, effectSize, sampleSize) {
    const currentWeek = this.getCurrentWeek();
    let maxAdjustment;
    
    if (currentWeek <= 6) maxAdjustment = this.maxAdjustmentPercent.week_4_6;
    else if (currentWeek <= 9) maxAdjustment = this.maxAdjustmentPercent.week_7_9;
    else maxAdjustment = this.maxAdjustmentPercent.week_10_plus;

    // Scale adjustment by effect size and sample size confidence
    const sampleSizeConfidence = Math.min(1.0, sampleSize / 64); // Full confidence at 64+ games
    const adjustmentMagnitude = (effectSize * maxAdjustment * sampleSizeConfidence) / 100;

    switch (biasType) {
      case 'home_bias':
        if (effectSize > 0.1) { // Only adjust if >10% bias
          return {
            parameter: 'home_field_advantage',
            change: effectSize > 0 ? -adjustmentMagnitude * 2.2 : adjustmentMagnitude * 2.2,
            reason: `Reduce HFA due to ${(effectSize * 100).toFixed(1)}% home pick bias`
          };
        }
        break;

      case 'over_bias':
        if (effectSize > 0.1) {
          return {
            parameter: 'base_points_per_team',
            change: effectSize > 0 ? -adjustmentMagnitude * 24.0 : adjustmentMagnitude * 24.0,
            reason: `Adjust base scoring due to ${(effectSize * 100).toFixed(1)}% over bias`
          };
        }
        break;

      case 'spread_bias':
        if (effectSize > 1.0) { // Only adjust if >1 point average error
          return {
            parameter: 'core_epa_multiplier',
            change: -adjustmentMagnitude * 25.0, // Reduce if overconfident
            reason: `Reduce EPA multiplier due to ${effectSize.toFixed(2)} point spread bias`
          };
        }
        break;

      case 'total_bias':
        if (effectSize > 2.0) { // Only adjust if >2 point average error
          return {
            parameter: 'defensive_drag_multiplier',
            change: adjustmentMagnitude * 25.0, // Increase defensive impact
            reason: `Adjust defensive impact due to ${effectSize.toFixed(2)} point total bias`
          };
        }
        break;
    }

    return { parameter: null, change: 0, reason: 'No significant adjustment needed' };
  }

  /**
   * Get current NFL week
   */
  getCurrentWeek() {
    // Simple week calculation - would use actual week detection in production
    const seasonStart = new Date('2025-09-04');
    const now = new Date();
    const diffTime = Math.abs(now - seasonStart);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.min(18, Math.max(1, Math.ceil(diffDays / 7)));
  }

  /**
   * Apply conservative adjustments to model weights
   */
  async applyGradualAdjustments(currentWeights, suggestedAdjustments) {
    const adjustedWeights = { ...currentWeights };
    const appliedChanges = [];

    for (const [parameter, adjustment] of Object.entries(suggestedAdjustments)) {
      if (Math.abs(adjustment.change) > 0.001) {
        const oldValue = adjustedWeights[parameter] || 0;
        const newValue = oldValue + adjustment.change;
        
        // Safety bounds check
        const minValue = oldValue * 0.5; // Never change by more than 50%
        const maxValue = oldValue * 1.5;
        const safeNewValue = Math.max(minValue, Math.min(maxValue, newValue));
        
        adjustedWeights[parameter] = safeNewValue;
        appliedChanges.push({
          parameter: parameter,
          oldValue: oldValue,
          newValue: safeNewValue,
          change: safeNewValue - oldValue,
          reason: adjustment.reason
        });
        
        console.log(`Gradual optimization: ${parameter} ${oldValue.toFixed(4)} → ${safeNewValue.toFixed(4)} (${adjustment.reason})`);
      }
    }

    // Save adjustment log
    await this.logAdjustments(appliedChanges);

    return {
      adjustedWeights: adjustedWeights,
      changesApplied: appliedChanges,
      totalChanges: appliedChanges.length
    };
  }

  /**
   * Log all adjustments for tracking
   */
  async logAdjustments(changes) {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        week: this.getCurrentWeek(),
        changes: changes,
        method: 'gradual_optimization'
      };

      // Load existing log
      let adjustmentLog = await loadBlob('nfl', 'optimization/adjustment-log.json') || { entries: [] };
      adjustmentLog.entries.push(logEntry);

      // Keep only last 50 entries
      adjustmentLog.entries = adjustmentLog.entries.slice(-50);

      await storeBlob('nfl', 'optimization/adjustment-log.json', adjustmentLog);
      console.log(`Logged ${changes.length} parameter adjustments`);
    } catch (error) {
      console.warn('Failed to log adjustments:', error);
    }
  }

  /**
   * Main optimization function - only runs if conditions are met
   */
  async runGradualOptimization(currentWeights) {
    try {
      console.log('Running gradual ML optimization check...');
      
      // Load performance history
      const performanceData = await this.loadPerformanceHistory();
      
      if (!performanceData.weeks || performanceData.weeks.length < this.minWeeksRequired) {
        console.log(`Need ${this.minWeeksRequired} weeks of data, have ${performanceData.weeks?.length || 0}`);
        return {
          optimized: false,
          reason: 'Insufficient data',
          weightsUsed: currentWeights
        };
      }

      // Analyze for statistically significant biases
      const analysis = this.analyzeStatisticalSignificance(performanceData);
      
      if (analysis.significantBiases.length === 0) {
        console.log('No statistically significant biases detected');
        return {
          optimized: false,
          reason: 'No significant biases detected',
          weightsUsed: currentWeights,
          analysis: analysis
        };
      }

      console.log(`Found ${analysis.significantBiases.length} significant biases:`, 
        analysis.significantBiases.map(b => b.description));

      // Apply conservative adjustments
      const result = await this.applyGradualAdjustments(currentWeights, analysis.suggestedAdjustments);

      return {
        optimized: true,
        reason: `Applied ${result.totalChanges} adjustments based on statistical significance`,
        weightsUsed: result.adjustedWeights,
        analysis: analysis,
        changes: result.changesApplied
      };

    } catch (error) {
      console.error('Gradual optimization error:', error);
      return {
        optimized: false,
        reason: `Error: ${error.message}`,
        weightsUsed: currentWeights
      };
    }
  }
}

/**
 * Integration function for prediction engine
 */
export async function loadOptimizedWeights(currentWeights) {
  const optimizer = new GradualOptimizer();
  const result = await optimizer.runGradualOptimization(currentWeights);
  
  return {
    weights: result.weightsUsed,
    optimization: {
      applied: result.optimized,
      reason: result.reason,
      changes: result.changes || [],
      analysis: result.analysis
    }
  };
}
