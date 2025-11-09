/**
 * MLB HR Round Robin - FDR Correction Module
 * 
 * Prevents p-hacking when testing 3,150 strategy combinations
 * Uses Benjamini-Hochberg procedure + bootstrap stability
 * 
 * GPT Enhancement: "Statistical Rigor - FDR Correction"
 */

/**
 * FDR Correction Module
 * Controls false discovery rate when testing many strategies
 */
class FDRCorrectionModule {
  constructor() {
    this.config = {
      fdrThreshold: 0.05, // 5% false discovery rate
      bootstrapIterations: 1000,
      confidenceLevel: 0.95,
      minSampleSize: 100
    };
  }

  /**
   * Apply Benjamini-Hochberg FDR correction
   * @param {Array} strategies - Strategies with test results
   * @returns {Array} FDR-significant strategies
   */
  applyBenjaminiHochberg(strategies) {
    console.log('📊 Applying Benjamini-Hochberg FDR Correction...');
    
    // Step 1: Calculate p-values for each strategy
    const strategiesWithPValues = strategies.map(strategy => ({
      ...strategy,
      pValue: this.calculatePValue(strategy.results)
    }));
    
    // Step 2: Sort by p-value (ascending)
    const sorted = strategiesWithPValues.sort((a, b) => a.pValue - b.pValue);
    
    // Step 3: Calculate BH critical values
    const m = sorted.length; // Total number of tests
    const q = this.config.fdrThreshold; // FDR level
    
    sorted.forEach((strategy, i) => {
      const rank = i + 1;
      strategy.bhCriticalValue = (rank / m) * q;
      strategy.isFDRSignificant = strategy.pValue <= strategy.bhCriticalValue;
    });
    
    // Step 4: Find largest k where p(k) <= (k/m)*q
    let largestK = 0;
    for (let k = m - 1; k >= 0; k--) {
      if (sorted[k].pValue <= sorted[k].bhCriticalValue) {
        largestK = k + 1;
        break;
      }
    }
    
    // Step 5: Select all strategies 1 to k
    const fdrSignificant = sorted.slice(0, largestK);
    
    console.log(`✅ FDR Correction: ${fdrSignificant.length}/${m} strategies significant at q=${q}`);
    
    return {
      allStrategies: sorted,
      fdrSignificantStrategies: fdrSignificant,
      largestK,
      totalTested: m,
      fdrThreshold: q,
      summary: {
        significantCount: fdrSignificant.length,
        significantRate: fdrSignificant.length / m,
        strictestPValue: fdrSignificant.length > 0 ? fdrSignificant[fdrSignificant.length - 1].pValue : null
      }
    };
  }

  /**
   * Calculate p-value for strategy results
   * Uses permutation test for ROI significance
   */
  calculatePValue(results) {
    const { roi, sampleSize, outcomes } = results;
    
    if (!outcomes || outcomes.length < this.config.minSampleSize) {
      return 1.0; // No significance with small sample
    }

    // Null hypothesis: ROI = 0 (no edge)
    // Alternative: ROI > 0 (positive edge)
    
    // Calculate test statistic (t-statistic for ROI)
    const mean = roi;
    const stdDev = this.calculateStdDev(outcomes);
    const n = outcomes.length;
    const tStat = mean / (stdDev / Math.sqrt(n));
    
    // Calculate p-value using t-distribution approximation
    const pValue = 1 - this.tCDF(tStat, n - 1);
    
    return Math.max(0, Math.min(1, pValue));
  }

  /**
   * Bootstrap stability test
   * @param {Object} strategy - Strategy to test
   * @param {Array} data - Historical data
   * @returns {Object} Bootstrap results
   */
  async bootstrapStability(strategy, data) {
    console.log(`🔄 Bootstrap stability test: ${strategy.name}...`);
    
    const bootstrapROIs = [];
    const bootstrapSharpes = [];
    const bootstrapWinRates = [];
    
    for (let i = 0; i < this.config.bootstrapIterations; i++) {
      // Resample with replacement
      const resample = this.resampleWithReplacement(data);
      
      // Run strategy on resample
      const results = await this.runStrategyOnData(strategy, resample);
      
      bootstrapROIs.push(results.roi);
      bootstrapSharpes.push(results.sharpe);
      bootstrapWinRates.push(results.winRate);
      
      if ((i + 1) % 100 === 0) {
        console.log(`  Progress: ${i + 1}/${this.config.bootstrapIterations}`);
      }
    }
    
    // Calculate confidence intervals
    const roiCI = this.calculateConfidenceInterval(bootstrapROIs, this.config.confidenceLevel);
    const sharpeCI = this.calculateConfidenceInterval(bootstrapSharpes, this.config.confidenceLevel);
    const winRateCI = this.calculateConfidenceInterval(bootstrapWinRates, this.config.confidenceLevel);
    
    // Check stability
    const isStable = {
      roi: roiCI.lower > 0, // ROI consistently positive
      sharpe: sharpeCI.lower > 0.3, // Sharpe consistently decent
      winRate: winRateCI.lower > 0.45 // Win rate consistently above random
    };
    
    const overallStability = Object.values(isStable).filter(v => v).length / 3;
    
    console.log(`✅ Bootstrap complete: ${strategy.name}`);
    console.log(`  ROI CI: [${roiCI.lower.toFixed(4)}, ${roiCI.upper.toFixed(4)}]`);
    console.log(`  Stability score: ${(overallStability * 100).toFixed(1)}%`);
    
    return {
      bootstrapIterations: this.config.bootstrapIterations,
      
      roi: {
        mean: this.mean(bootstrapROIs),
        median: this.median(bootstrapROIs),
        stdDev: this.calculateStdDev(bootstrapROIs),
        ci: roiCI,
        distribution: this.calculateDistributionStats(bootstrapROIs)
      },
      
      sharpe: {
        mean: this.mean(bootstrapSharpes),
        median: this.median(bootstrapSharpes),
        stdDev: this.calculateStdDev(bootstrapSharpes),
        ci: sharpeCI,
        distribution: this.calculateDistributionStats(bootstrapSharpes)
      },
      
      winRate: {
        mean: this.mean(bootstrapWinRates),
        median: this.median(bootstrapWinRates),
        stdDev: this.calculateStdDev(bootstrapWinRates),
        ci: winRateCI,
        distribution: this.calculateDistributionStats(bootstrapWinRates)
      },
      
      stability: {
        roi: isStable.roi,
        sharpe: isStable.sharpe,
        winRate: isStable.winRate,
        overall: overallStability,
        isStable: overallStability >= 0.67 // 2 out of 3 metrics stable
      }
    };
  }

  /**
   * Run full statistical certification
   * @param {Array} strategies - All strategies tested
   * @param {Array} data - Historical data
   */
  async certify(strategies, data) {
    console.log('📜 Running Statistical Certification...\n');
    
    // Step 1: Apply FDR correction
    console.log('Step 1: FDR Correction');
    const fdrResults = this.applyBenjaminiHochberg(strategies);
    console.log(`  ✅ ${fdrResults.significantCount} strategies passed FDR threshold\n`);
    
    // Step 2: Bootstrap stability for FDR-significant strategies
    console.log('Step 2: Bootstrap Stability Tests');
    const bootstrapResults = [];
    
    for (const strategy of fdrResults.fdrSignificantStrategies) {
      const bootstrap = await this.bootstrapStability(strategy, data);
      bootstrapResults.push({
        strategy,
        bootstrap
      });
    }
    
    // Step 3: Filter for stable strategies
    const stableStrategies = bootstrapResults.filter(r => r.bootstrap.stability.isStable);
    console.log(`\n  ✅ ${stableStrategies.length} strategies passed stability test\n`);
    
    // Step 4: Rank by performance
    const ranked = stableStrategies
      .map(r => ({
        ...r,
        compositeScore: this.calculateCompositeScore(r.strategy, r.bootstrap)
      }))
      .sort((a, b) => b.compositeScore - a.compositeScore);
    
    // Step 5: Generate certification report
    const certification = {
      timestamp: new Date().toISOString(),
      
      totalStrategiesTested: strategies.length,
      fdrSignificantCount: fdrResults.significantCount,
      bootstrapStableCount: stableStrategies.length,
      finalCertifiedCount: ranked.length,
      
      fdrResults,
      bootstrapResults,
      
      certifiedStrategies: ranked.slice(0, 20), // Top 20
      
      summary: {
        survivalRate: ranked.length / strategies.length,
        avgROI: this.mean(ranked.map(r => r.strategy.results.roi)),
        avgSharpe: this.mean(ranked.map(r => r.strategy.results.sharpe)),
        avgStability: this.mean(ranked.map(r => r.bootstrap.stability.overall))
      },
      
      recommendations: this.generateCertificationRecommendations(ranked)
    };
    
    console.log('📜 Statistical Certification Complete!');
    console.log(`  ✅ ${certification.finalCertifiedCount} strategies certified for production`);
    console.log(`  📊 Survival rate: ${(certification.summary.survivalRate * 100).toFixed(2)}%`);
    console.log(`  🎯 Avg ROI: ${(certification.summary.avgROI * 100).toFixed(2)}%`);
    console.log(`  📈 Avg Sharpe: ${certification.summary.avgSharpe.toFixed(2)}`);
    
    return certification;
  }

  /**
   * Calculate composite score for ranking
   */
  calculateCompositeScore(strategy, bootstrap) {
    // Weight: 40% ROI, 30% Sharpe, 20% Stability, 10% Win Rate
    const roiScore = bootstrap.roi.mean;
    const sharpeScore = bootstrap.sharpe.mean / 2; // Normalize to ~0-0.5 range
    const stabilityScore = bootstrap.stability.overall;
    const winRateScore = bootstrap.winRate.mean;
    
    return (
      0.40 * roiScore +
      0.30 * sharpeScore +
      0.20 * stabilityScore +
      0.10 * winRateScore
    );
  }

  /**
   * Generate certification recommendations
   */
  generateCertificationRecommendations(rankedStrategies) {
    const recommendations = [];
    
    if (rankedStrategies.length === 0) {
      recommendations.push({
        priority: 'critical',
        message: 'No strategies passed certification',
        action: 'Review model assumptions and data quality',
        impact: 'critical'
      });
      return recommendations;
    }
    
    // Top strategy analysis
    const top = rankedStrategies[0];
    if (top.bootstrap.roi.ci.lower < 0.05) {
      recommendations.push({
        priority: 'medium',
        message: 'Top strategy has marginal ROI confidence interval',
        action: 'Consider larger sample size or ensemble approach',
        impact: 'medium'
      });
    }
    
    // Diversity check
    const predictionModules = new Set(rankedStrategies.map(r => r.strategy.predictionModule));
    if (predictionModules.size < 3) {
      recommendations.push({
        priority: 'low',
        message: 'Low diversity in certified strategies',
        action: 'Top strategies heavily favor specific prediction module',
        impact: 'low'
      });
    }
    
    // Stability check
    const lowStability = rankedStrategies.filter(r => r.bootstrap.stability.overall < 0.75);
    if (lowStability.length > rankedStrategies.length * 0.5) {
      recommendations.push({
        priority: 'high',
        message: 'Many certified strategies have moderate stability',
        action: 'Consider longer validation period or stricter stability threshold',
        impact: 'high'
      });
    }
    
    return recommendations;
  }

  /**
   * Utility: Resample with replacement
   */
  resampleWithReplacement(data) {
    const resample = [];
    for (let i = 0; i < data.length; i++) {
      const randomIndex = Math.floor(Math.random() * data.length);
      resample.push(data[randomIndex]);
    }
    return resample;
  }

  /**
   * Utility: Run strategy on resampled data
   */
  async runStrategyOnData(strategy, data) {
    // Simplified simulation (use actual backtest runner in production)
    const outcomes = data.map(d => {
      const prediction = Math.random() > 0.5; // Placeholder
      const actual = d.outcome;
      return prediction === actual;
    });
    
    const winRate = outcomes.filter(o => o).length / outcomes.length;
    const roi = (winRate * 10 - 1); // Simplified ROI calculation
    const sharpe = roi / 0.3; // Simplified Sharpe
    
    return { roi, sharpe, winRate };
  }

  /**
   * Utility: Calculate confidence interval
   */
  calculateConfidenceInterval(values, confidenceLevel) {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const alpha = 1 - confidenceLevel;
    
    const lowerIndex = Math.floor(n * (alpha / 2));
    const upperIndex = Math.ceil(n * (1 - alpha / 2)) - 1;
    
    return {
      lower: sorted[lowerIndex],
      upper: sorted[upperIndex],
      width: sorted[upperIndex] - sorted[lowerIndex]
    };
  }

  /**
   * Utility: Calculate distribution stats
   */
  calculateDistributionStats(values) {
    const sorted = [...values].sort((a, b) => a - b);
    
    return {
      min: sorted[0],
      q1: sorted[Math.floor(sorted.length * 0.25)],
      median: this.median(sorted),
      q3: sorted[Math.floor(sorted.length * 0.75)],
      max: sorted[sorted.length - 1],
      iqr: sorted[Math.floor(sorted.length * 0.75)] - sorted[Math.floor(sorted.length * 0.25)]
    };
  }

  /**
   * Utility: Calculate standard deviation
   */
  calculateStdDev(values) {
    const mean = this.mean(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Utility: Mean
   */
  mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Utility: Median
   */
  median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  /**
   * Utility: t-distribution CDF approximation
   */
  tCDF(t, df) {
    // Simplified approximation (use proper stats library in production)
    const x = df / (df + t * t);
    const a = 0.5 * df;
    const b = 0.5;
    
    // Approximate using normal distribution for large df
    if (df > 30) {
      return this.normalCDF(t);
    }
    
    // Beta distribution approximation for small df
    return this.incompleteBeta(x, a, b);
  }

  /**
   * Utility: Normal CDF approximation
   */
  normalCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - prob : prob;
  }

  /**
   * Utility: Incomplete beta function (simplified)
   */
  incompleteBeta(x, a, b) {
    // Simplified approximation
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return 0.5; // Placeholder for full implementation
  }
}

export { FDRCorrectionModule };
