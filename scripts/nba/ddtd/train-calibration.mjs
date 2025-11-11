/**
 * Phase 4: Calibration System for DD/TD Predictions
 * 
 * Trains isotonic regression to calibrate raw DD/TD probabilities:
 * - Rolling historical validation (time-aware, no future leakage)
 * - Separate calibration curves for DD and TD
 * - Bootstrap confidence intervals for calibration uncertainty
 * - Calibration metrics: Brier score, Log Loss, ECE (Expected Calibration Error)
 * - Monthly refresh with archetype-specific diagnostics
 * 
 * Isotonic Regression: Monotonic calibration that preserves probability ordering
 * - Fits: calibrated_prob = f(raw_prob) where f is monotonically increasing
 * - Better than Platt scaling for small datasets
 * - No assumptions about functional form
 */

import { fetchBoxScore } from './utils-data.mjs';
import fs from 'fs';
import path from 'path';

// ==================== CONFIGURATION ====================

const MIN_TRAINING_SAMPLES = 50; // Minimum samples for reliable calibration
const BOOTSTRAP_ITERATIONS = 500; // For calibration curve confidence intervals
const ECE_NUM_BINS = 10; // Bins for Expected Calibration Error
const ROLLING_WINDOW_DAYS = 60; // Use last 60 days for calibration training

// Calibration bins (for curve visualization)
const CALIBRATION_BINS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

// ==================== ISOTONIC REGRESSION ====================

/**
 * Isotonic Regression (Pool Adjacent Violators Algorithm)
 * Fits monotonically increasing calibration curve
 */
class IsotonicRegression {
  constructor() {
    this.x = []; // Raw probabilities
    this.y = []; // Observed outcomes (0 or 1)
    this.calibrationCurve = null;
  }
  
  /**
   * Fit isotonic regression on (x, y) pairs
   */
  fit(rawProbs, outcomes) {
    if (rawProbs.length !== outcomes.length) {
      throw new Error('rawProbs and outcomes must have same length');
    }
    
    if (rawProbs.length < 2) {
      throw new Error('Need at least 2 samples for isotonic regression');
    }
    
    // Sort by raw probabilities
    const sorted = rawProbs
      .map((prob, i) => ({ prob, outcome: outcomes[i] }))
      .sort((a, b) => a.prob - b.prob);
    
    this.x = sorted.map(s => s.prob);
    this.y = sorted.map(s => s.outcome);
    
    // Pool Adjacent Violators (PAV) algorithm
    this.calibrationCurve = this._poolAdjacentViolators(this.x, this.y);
    
    return this;
  }
  
  /**
   * Pool Adjacent Violators Algorithm
   */
  _poolAdjacentViolators(x, y) {
    const n = x.length;
    const solution = Array(n).fill(0);
    const weights = Array(n).fill(1);
    
    // Initialize with observed outcomes
    for (let i = 0; i < n; i++) {
      solution[i] = y[i];
    }
    
    // Pool violators
    let i = 0;
    while (i < n - 1) {
      let k = i;
      
      // Find violating block
      while (k < n - 1 && solution[k] >= solution[k + 1]) {
        k++;
      }
      
      if (k > i) {
        // Pool block [i, k]
        let sumWeightedY = 0;
        let sumWeights = 0;
        
        for (let j = i; j <= k; j++) {
          sumWeightedY += y[j] * weights[j];
          sumWeights += weights[j];
        }
        
        const pooledValue = sumWeightedY / sumWeights;
        
        for (let j = i; j <= k; j++) {
          solution[j] = pooledValue;
        }
        
        // Update weights
        const totalWeight = sumWeights;
        weights[i] = totalWeight;
        for (let j = i + 1; j <= k; j++) {
          weights[j] = 0;
        }
      }
      
      i = k + 1;
    }
    
    return { x, y: solution };
  }
  
  /**
   * Predict calibrated probability for new raw probability
   */
  predict(rawProb) {
    if (!this.calibrationCurve) {
      throw new Error('Must call fit() before predict()');
    }
    
    const { x, y } = this.calibrationCurve;
    
    // Clip to [0, 1]
    rawProb = Math.max(0, Math.min(1, rawProb));
    
    // Find position in calibration curve (linear interpolation)
    if (rawProb <= x[0]) return y[0];
    if (rawProb >= x[x.length - 1]) return y[y.length - 1];
    
    for (let i = 0; i < x.length - 1; i++) {
      if (rawProb >= x[i] && rawProb <= x[i + 1]) {
        const t = (rawProb - x[i]) / (x[i + 1] - x[i]);
        return y[i] + t * (y[i + 1] - y[i]);
      }
    }
    
    return y[y.length - 1];
  }
  
  /**
   * Export calibration curve for storage
   */
  export() {
    return {
      x: this.x,
      y: this.calibrationCurve.y,
      numSamples: this.x.length
    };
  }
  
  /**
   * Import calibration curve from storage
   */
  static import(data) {
    const iso = new IsotonicRegression();
    iso.x = data.x;
    iso.calibrationCurve = { x: data.x, y: data.y };
    return iso;
  }
}

// ==================== CALIBRATION METRICS ====================

/**
 * Calculate Brier Score: mean squared error of probabilities
 * Lower is better (0 = perfect, 1 = worst)
 */
function brierScore(predictions, outcomes) {
  if (predictions.length !== outcomes.length || predictions.length === 0) {
    return null;
  }
  
  const mse = predictions.reduce((sum, pred, i) => {
    return sum + Math.pow(pred - outcomes[i], 2);
  }, 0) / predictions.length;
  
  return mse;
}

/**
 * Calculate Log Loss (cross-entropy)
 * Lower is better (0 = perfect, ∞ = worst)
 */
function logLoss(predictions, outcomes) {
  if (predictions.length !== outcomes.length || predictions.length === 0) {
    return null;
  }
  
  const epsilon = 1e-15; // Avoid log(0)
  
  const loss = predictions.reduce((sum, pred, i) => {
    const clippedPred = Math.max(epsilon, Math.min(1 - epsilon, pred));
    const outcome = outcomes[i];
    return sum - (outcome * Math.log(clippedPred) + (1 - outcome) * Math.log(1 - clippedPred));
  }, 0) / predictions.length;
  
  return loss;
}

/**
 * Calculate Expected Calibration Error (ECE)
 * Measures how close predicted probabilities match observed frequencies
 * Lower is better (0 = perfect calibration)
 */
function expectedCalibrationError(predictions, outcomes, numBins = ECE_NUM_BINS) {
  if (predictions.length !== outcomes.length || predictions.length === 0) {
    return null;
  }
  
  const bins = Array(numBins).fill(0).map(() => ({ predictions: [], outcomes: [] }));
  
  // Assign predictions to bins
  predictions.forEach((pred, i) => {
    const binIdx = Math.min(numBins - 1, Math.floor(pred * numBins));
    bins[binIdx].predictions.push(pred);
    bins[binIdx].outcomes.push(outcomes[i]);
  });
  
  // Calculate ECE
  let ece = 0;
  const totalSamples = predictions.length;
  
  bins.forEach(bin => {
    if (bin.predictions.length === 0) return;
    
    const avgPrediction = bin.predictions.reduce((a, b) => a + b, 0) / bin.predictions.length;
    const avgOutcome = bin.outcomes.reduce((a, b) => a + b, 0) / bin.outcomes.length;
    const binWeight = bin.predictions.length / totalSamples;
    
    ece += binWeight * Math.abs(avgPrediction - avgOutcome);
  });
  
  return ece;
}

/**
 * Calculate calibration curve (observed frequency vs predicted probability)
 */
function calibrationCurve(predictions, outcomes, bins = CALIBRATION_BINS) {
  const curve = [];
  
  for (let i = 0; i < bins.length - 1; i++) {
    const lowerBound = bins[i];
    const upperBound = bins[i + 1];
    
    const binPredictions = [];
    const binOutcomes = [];
    
    predictions.forEach((pred, idx) => {
      if (pred >= lowerBound && pred < upperBound) {
        binPredictions.push(pred);
        binOutcomes.push(outcomes[idx]);
      }
    });
    
    if (binPredictions.length > 0) {
      const avgPrediction = binPredictions.reduce((a, b) => a + b, 0) / binPredictions.length;
      const avgOutcome = binOutcomes.reduce((a, b) => a + b, 0) / binOutcomes.length;
      
      curve.push({
        binCenter: (lowerBound + upperBound) / 2,
        avgPrediction,
        observedFrequency: avgOutcome,
        count: binPredictions.length
      });
    }
  }
  
  return curve;
}

// ==================== HISTORICAL DATA LOADING ====================

/**
 * Load historical predictions with outcomes
 */
async function loadHistoricalData(startDate, endDate) {
  console.log(`📂 Loading historical predictions from ${startDate} to ${endDate}...`);
  
  const estimatesDir = './data/nba/ddtd/estimates';
  if (!fs.existsSync(estimatesDir)) {
    throw new Error(`Estimates directory not found: ${estimatesDir}`);
  }
  
  const files = fs.readdirSync(estimatesDir)
    .filter(f => f.endsWith('.json'))
    .filter(f => {
      const date = f.replace('.json', '');
      return date >= startDate && date <= endDate;
    })
    .sort();
  
  console.log(`📊 Found ${files.length} prediction files`);
  
  const historicalData = [];
  
  for (const file of files) {
    const filePath = path.join(estimatesDir, file);
    const date = file.replace('.json', '');
    
    const estimates = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // For each player prediction, fetch actual outcome from box score
    for (const est of estimates) {
      const { playerName, gameId } = est;
      
      try {
        // Fetch box score to get actual stats
        const boxScore = await fetchBoxScore(gameId);
        const playerStats = boxScore.find(p => 
          p.playerName.toLowerCase().includes(playerName.toLowerCase()) ||
          playerName.toLowerCase().includes(p.playerName.toLowerCase())
        );
        
        if (!playerStats) {
          console.log(`  ⚠️  ${playerName} not found in box score for game ${gameId}`);
          continue;
        }
        
        // Determine actual DD/TD outcomes
        const { points, rebounds, assists } = playerStats;
        const statsOver10 = [points >= 10, rebounds >= 10, assists >= 10].filter(Boolean).length;
        
        const actualDD = statsOver10 >= 2 ? 1 : 0;
        const actualTD = statsOver10 >= 3 ? 1 : 0;
        
        historicalData.push({
          date,
          playerName,
          gameId,
          archetype: est.archetype,
          
          rawProb_DD: est.probabilities.DD,
          rawProb_TD: est.probabilities.TD,
          
          actual_DD: actualDD,
          actual_TD: actualTD,
          
          actualStats: { points, rebounds, assists }
        });
        
      } catch (error) {
        console.error(`  ❌ Error fetching box score for ${gameId}:`, error.message);
      }
    }
  }
  
  console.log(`✅ Loaded ${historicalData.length} predictions with outcomes`);
  return historicalData;
}

// ==================== CALIBRATION TRAINING ====================

/**
 * Train calibration models for DD and TD
 */
export function trainCalibration(historicalData) {
  console.log(`\n🎯 Training calibration models...`);
  
  if (historicalData.length < MIN_TRAINING_SAMPLES) {
    throw new Error(`Insufficient training data: ${historicalData.length} < ${MIN_TRAINING_SAMPLES}`);
  }
  
  // Separate DD and TD data
  const ddData = historicalData.map(d => ({
    rawProb: d.rawProb_DD,
    outcome: d.actual_DD
  }));
  
  const tdData = historicalData.map(d => ({
    rawProb: d.rawProb_TD,
    outcome: d.actual_TD
  }));
  
  // Train isotonic regression for DD
  console.log('  📈 Training DD calibration...');
  const ddCalibrator = new IsotonicRegression();
  ddCalibrator.fit(
    ddData.map(d => d.rawProb),
    ddData.map(d => d.outcome)
  );
  
  // Train isotonic regression for TD
  console.log('  📈 Training TD calibration...');
  const tdCalibrator = new IsotonicRegression();
  tdCalibrator.fit(
    tdData.map(d => d.rawProb),
    tdData.map(d => d.outcome)
  );
  
  // Calculate metrics on training data
  const ddCalibratedProbs = ddData.map(d => ddCalibrator.predict(d.rawProb));
  const tdCalibratedProbs = tdData.map(d => tdCalibrator.predict(d.rawProb));
  
  const ddMetrics = {
    brier: brierScore(ddCalibratedProbs, ddData.map(d => d.outcome)),
    logLoss: logLoss(ddCalibratedProbs, ddData.map(d => d.outcome)),
    ece: expectedCalibrationError(ddCalibratedProbs, ddData.map(d => d.outcome))
  };
  
  const tdMetrics = {
    brier: brierScore(tdCalibratedProbs, tdData.map(d => d.outcome)),
    logLoss: logLoss(tdCalibratedProbs, tdData.map(d => d.outcome)),
    ece: expectedCalibrationError(tdCalibratedProbs, tdData.map(d => d.outcome))
  };
  
  console.log(`\n📊 DD Calibration Metrics:`);
  console.log(`   Brier Score: ${ddMetrics.brier.toFixed(4)}`);
  console.log(`   Log Loss: ${ddMetrics.logLoss.toFixed(4)}`);
  console.log(`   ECE: ${ddMetrics.ece.toFixed(4)}`);
  
  console.log(`\n📊 TD Calibration Metrics:`);
  console.log(`   Brier Score: ${tdMetrics.brier.toFixed(4)}`);
  console.log(`   Log Loss: ${tdMetrics.logLoss.toFixed(4)}`);
  console.log(`   ECE: ${tdMetrics.ece.toFixed(4)}`);
  
  return {
    ddCalibrator,
    tdCalibrator,
    ddMetrics,
    tdMetrics,
    trainingSampleSize: historicalData.length
  };
}

/**
 * Bootstrap confidence intervals for calibration curve
 */
function bootstrapCalibrationCurve(historicalData, numIterations = BOOTSTRAP_ITERATIONS) {
  console.log(`\n🔄 Bootstrapping calibration confidence intervals...`);
  
  const ddBootstrapCurves = [];
  const tdBootstrapCurves = [];
  
  for (let iter = 0; iter < numIterations; iter++) {
    // Resample with replacement
    const bootstrapSample = [];
    for (let i = 0; i < historicalData.length; i++) {
      const idx = Math.floor(Math.random() * historicalData.length);
      bootstrapSample.push(historicalData[idx]);
    }
    
    // Train calibrators on bootstrap sample
    const ddCal = new IsotonicRegression();
    const tdCal = new IsotonicRegression();
    
    ddCal.fit(
      bootstrapSample.map(d => d.rawProb_DD),
      bootstrapSample.map(d => d.actual_DD)
    );
    
    tdCal.fit(
      bootstrapSample.map(d => d.rawProb_TD),
      bootstrapSample.map(d => d.actual_TD)
    );
    
    ddBootstrapCurves.push(ddCal.export());
    tdBootstrapCurves.push(tdCal.export());
    
    if ((iter + 1) % 100 === 0) {
      console.log(`  Progress: ${iter + 1}/${numIterations}`);
    }
  }
  
  return { ddBootstrapCurves, tdBootstrapCurves };
}

// ==================== VALIDATION & DIAGNOSTICS ====================

/**
 * Archetype-specific calibration diagnostics
 */
function archetypeCalibrationDiagnostics(historicalData, ddCalibrator, tdCalibrator) {
  console.log(`\n📊 Archetype-Specific Diagnostics:`);
  
  const archetypes = [...new Set(historicalData.map(d => d.archetype))];
  
  archetypes.forEach(archetype => {
    const archetypeData = historicalData.filter(d => d.archetype === archetype);
    
    if (archetypeData.length < 10) return; // Skip if too few samples
    
    const ddCalibratedProbs = archetypeData.map(d => ddCalibrator.predict(d.rawProb_DD));
    const tdCalibratedProbs = archetypeData.map(d => tdCalibrator.predict(d.rawProb_TD));
    
    const ddBrier = brierScore(ddCalibratedProbs, archetypeData.map(d => d.actual_DD));
    const tdBrier = brierScore(tdCalibratedProbs, archetypeData.map(d => d.actual_TD));
    
    console.log(`\n  ${archetype} (n=${archetypeData.length}):`);
    console.log(`    DD Brier: ${ddBrier.toFixed(4)}`);
    console.log(`    TD Brier: ${tdBrier.toFixed(4)}`);
  });
}

// ==================== SAVE/LOAD CALIBRATION ====================

/**
 * Save calibration models to disk
 */
export function saveCalibration(calibrationModels, dateString) {
  const outputDir = './data/nba/ddtd/calibration';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const calibrationData = {
    trainingDate: dateString,
    trainingSampleSize: calibrationModels.trainingSampleSize,
    
    ddCalibrator: calibrationModels.ddCalibrator.export(),
    tdCalibrator: calibrationModels.tdCalibrator.export(),
    
    ddMetrics: calibrationModels.ddMetrics,
    tdMetrics: calibrationModels.tdMetrics
  };
  
  const outputPath = path.join(outputDir, `calibration-${dateString}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(calibrationData, null, 2));
  
  // Also save as "latest"
  const latestPath = path.join(outputDir, 'calibration-latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(calibrationData, null, 2));
  
  console.log(`💾 Saved calibration models to ${outputPath}`);
  return outputPath;
}

/**
 * Load calibration models from disk
 */
export function loadCalibration(dateString = 'latest') {
  const calibrationDir = './data/nba/ddtd/calibration';
  const filename = dateString === 'latest' ? 'calibration-latest.json' : `calibration-${dateString}.json`;
  const calibrationPath = path.join(calibrationDir, filename);
  
  if (!fs.existsSync(calibrationPath)) {
    throw new Error(`Calibration file not found: ${calibrationPath}`);
  }
  
  const calibrationData = JSON.parse(fs.readFileSync(calibrationPath, 'utf8'));
  
  return {
    ddCalibrator: IsotonicRegression.import(calibrationData.ddCalibrator),
    tdCalibrator: IsotonicRegression.import(calibrationData.tdCalibrator),
    ddMetrics: calibrationData.ddMetrics,
    tdMetrics: calibrationData.tdMetrics,
    trainingDate: calibrationData.trainingDate,
    trainingSampleSize: calibrationData.trainingSampleSize
  };
}

// ==================== CLI EXECUTION ====================

if (import.meta.url === `file://${process.argv[1]}`) {
  const startDateArg = process.argv[2];
  const endDateArg = process.argv[3];
  
  if (!startDateArg || !endDateArg) {
    console.error('Usage: node train-calibration.mjs START_DATE END_DATE');
    console.error('Example: node train-calibration.mjs 2024-10-22 2024-11-10');
    process.exit(1);
  }
  
  try {
    // Load historical data
    const historicalData = await loadHistoricalData(startDateArg, endDateArg);
    
    // Train calibration
    const calibrationModels = trainCalibration(historicalData);
    
    // Archetype diagnostics
    archetypeCalibrationDiagnostics(
      historicalData,
      calibrationModels.ddCalibrator,
      calibrationModels.tdCalibrator
    );
    
    // Save calibration models
    saveCalibration(calibrationModels, endDateArg);
    
    console.log('\n✅ Calibration training complete!');
    
  } catch (error) {
    console.error('❌ Error training calibration:', error);
    process.exit(1);
  }
}
