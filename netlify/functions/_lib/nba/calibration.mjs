/**
 * NBA Model Calibration
 * 
 * Isotonic regression for win probability calibration
 * Ensures predicted probabilities match observed frequencies
 * 
 * Critical for:
 * - Accurate Kelly criterion sizing
 * - Confidence intervals
 * - Expected value calculations
 * - Bankroll management
 */

/**
 * Isotonic Regression Calibrator
 * 
 * Fits a monotonic function that maps raw model probabilities
 * to calibrated probabilities that match observed frequencies
 */
export class IsotonicCalibrator {
  constructor() {
    this.xValues = [];
    this.yValues = [];
    this.fitted = false;
  }

  /**
   * Fit the calibrator on validation data
   * 
   * @param {Array<number>} predictions - Raw model probabilities [0, 1]
   * @param {Array<number>} outcomes - Actual outcomes (0 or 1)
   */
  fit(predictions, outcomes) {
    if (predictions.length !== outcomes.length) {
      throw new Error('Predictions and outcomes must have same length');
    }

    if (predictions.length < 10) {
      console.warn('[Calibration] Too few samples for isotonic regression, using identity');
      this.xValues = [0, 1];
      this.yValues = [0, 1];
      this.fitted = true;
      return;
    }

    // Sort by predictions
    const pairs = predictions.map((pred, i) => ({
      x: pred,
      y: outcomes[i]
    })).sort((a, b) => a.x - b.x);

    // Isotonic regression using Pool Adjacent Violators (PAV) algorithm
    const n = pairs.length;
    const x = pairs.map(p => p.x);
    const y = pairs.map(p => p.y);
    const weights = new Array(n).fill(1);

    // PAV algorithm
    let i = 0;
    while (i < n - 1) {
      let k = i;
      
      // Find violators (where y[k] > y[k+1])
      while (k < n - 1 && y[k] >= y[k + 1]) {
        k++;
      }

      if (k > i) {
        // Pool adjacent violators
        let sumWeightedY = 0;
        let sumWeight = 0;
        
        for (let j = i; j <= k; j++) {
          sumWeightedY += weights[j] * y[j];
          sumWeight += weights[j];
        }
        
        const pooledY = sumWeightedY / sumWeight;
        
        // Update pooled values
        for (let j = i; j <= k; j++) {
          y[j] = pooledY;
        }
        
        // Merge weights
        weights[i] = sumWeight;
        for (let j = i + 1; j <= k; j++) {
          weights[j] = 0;
        }
      }
      
      i = k + 1;
    }

    // Remove duplicates and store calibration curve
    this.xValues = [0]; // Start at 0
    this.yValues = [0];
    
    let lastX = 0;
    let lastY = 0;
    
    for (let i = 0; i < n; i++) {
      if (weights[i] > 0 && (x[i] > lastX || y[i] !== lastY)) {
        this.xValues.push(x[i]);
        this.yValues.push(y[i]);
        lastX = x[i];
        lastY = y[i];
      }
    }
    
    // End at 1
    if (this.xValues[this.xValues.length - 1] < 1) {
      this.xValues.push(1);
      this.yValues.push(1);
    }

    this.fitted = true;
  }

  /**
   * Transform raw probabilities to calibrated probabilities
   * 
   * @param {number|Array<number>} predictions - Raw model probability(ies)
   * @returns {number|Array<number>} Calibrated probability(ies)
   */
  transform(predictions) {
    if (!this.fitted) {
      throw new Error('Calibrator must be fitted before transform');
    }

    const isArray = Array.isArray(predictions);
    const preds = isArray ? predictions : [predictions];
    
    const calibrated = preds.map(pred => {
      // Clip to [0, 1]
      pred = Math.max(0, Math.min(1, pred));
      
      // Linear interpolation
      for (let i = 0; i < this.xValues.length - 1; i++) {
        if (pred >= this.xValues[i] && pred <= this.xValues[i + 1]) {
          const x0 = this.xValues[i];
          const x1 = this.xValues[i + 1];
          const y0 = this.yValues[i];
          const y1 = this.yValues[i + 1];
          
          if (x1 === x0) return y0;
          
          const slope = (y1 - y0) / (x1 - x0);
          return y0 + slope * (pred - x0);
        }
      }
      
      // Should not reach here if pred is in [0, 1]
      return pred;
    });

    return isArray ? calibrated : calibrated[0];
  }

  /**
   * Serialize calibrator to JSON
   */
  toJSON() {
    return {
      xValues: this.xValues,
      yValues: this.yValues,
      fitted: this.fitted
    };
  }

  /**
   * Deserialize calibrator from JSON
   */
  static fromJSON(json) {
    const calibrator = new IsotonicCalibrator();
    calibrator.xValues = json.xValues || [];
    calibrator.yValues = json.yValues || [];
    calibrator.fitted = json.fitted || false;
    return calibrator;
  }
}

/**
 * Calculate reliability curve (calibration plot data)
 * 
 * @param {Array<number>} predictions - Model probabilities
 * @param {Array<number>} outcomes - Actual outcomes (0 or 1)
 * @param {number} nBins - Number of bins for grouping
 * @returns {object} Reliability curve data
 */
export function calculateReliabilityCurve(predictions, outcomes, nBins = 10) {
  if (predictions.length !== outcomes.length) {
    throw new Error('Predictions and outcomes must have same length');
  }

  const bins = [];
  const binSize = 1.0 / nBins;

  for (let i = 0; i < nBins; i++) {
    const binStart = i * binSize;
    const binEnd = (i + 1) * binSize;
    
    const binPredictions = [];
    const binOutcomes = [];
    
    for (let j = 0; j < predictions.length; j++) {
      const pred = predictions[j];
      if (pred >= binStart && pred < binEnd) {
        binPredictions.push(pred);
        binOutcomes.push(outcomes[j]);
      }
    }
    
    if (binPredictions.length > 0) {
      const meanPrediction = binPredictions.reduce((a, b) => a + b, 0) / binPredictions.length;
      const observedFrequency = binOutcomes.reduce((a, b) => a + b, 0) / binOutcomes.length;
      
      bins.push({
        binStart,
        binEnd,
        meanPrediction,
        observedFrequency,
        count: binPredictions.length,
        error: Math.abs(meanPrediction - observedFrequency)
      });
    }
  }

  // Calculate Expected Calibration Error (ECE)
  let ece = 0;
  let totalCount = 0;
  
  for (const bin of bins) {
    ece += bin.count * bin.error;
    totalCount += bin.count;
  }
  
  ece = totalCount > 0 ? ece / totalCount : 0;

  return {
    bins,
    ece,
    isPerfectlyCalibrated: ece < 0.05, // Within 5%
    quality: ece < 0.03 ? 'EXCELLENT' :
             ece < 0.05 ? 'GOOD' :
             ece < 0.10 ? 'FAIR' : 'POOR'
  };
}

/**
 * Calculate Brier score (mean squared error of probabilities)
 * 
 * @param {Array<number>} predictions - Model probabilities
 * @param {Array<number>} outcomes - Actual outcomes (0 or 1)
 * @returns {number} Brier score (lower is better, 0 = perfect)
 */
export function calculateBrierScore(predictions, outcomes) {
  if (predictions.length !== outcomes.length || predictions.length === 0) {
    throw new Error('Invalid inputs for Brier score');
  }

  let sumSquaredError = 0;
  
  for (let i = 0; i < predictions.length; i++) {
    const error = predictions[i] - outcomes[i];
    sumSquaredError += error * error;
  }

  return sumSquaredError / predictions.length;
}

/**
 * Calculate log loss (cross-entropy loss)
 * 
 * @param {Array<number>} predictions - Model probabilities
 * @param {Array<number>} outcomes - Actual outcomes (0 or 1)
 * @returns {number} Log loss (lower is better)
 */
export function calculateLogLoss(predictions, outcomes) {
  if (predictions.length !== outcomes.length || predictions.length === 0) {
    throw new Error('Invalid inputs for log loss');
  }

  let sumLogLoss = 0;
  const epsilon = 1e-15; // Prevent log(0)
  
  for (let i = 0; i < predictions.length; i++) {
    const pred = Math.max(epsilon, Math.min(1 - epsilon, predictions[i]));
    const outcome = outcomes[i];
    
    sumLogLoss += outcome * Math.log(pred) + (1 - outcome) * Math.log(1 - pred);
  }

  return -sumLogLoss / predictions.length;
}

/**
 * Conformal prediction intervals for regression
 * 
 * Simple split conformal: hold out calibration set, calculate quantiles of errors
 * 
 * @param {Array<number>} calibrationPredictions - Predictions on calibration set
 * @param {Array<number>} calibrationActuals - Actual values on calibration set
 * @param {number} alpha - Significance level (e.g., 0.1 for 90% intervals)
 * @returns {object} Conformal predictor
 */
export function fitConformalPredictor(calibrationPredictions, calibrationActuals, alpha = 0.1) {
  if (calibrationPredictions.length !== calibrationActuals.length) {
    throw new Error('Predictions and actuals must have same length');
  }

  // Calculate absolute residuals
  const residuals = calibrationPredictions.map((pred, i) => 
    Math.abs(pred - calibrationActuals[i])
  );

  // Sort residuals
  residuals.sort((a, b) => a - b);

  // Calculate quantile
  const n = residuals.length;
  const q = Math.ceil((n + 1) * (1 - alpha)) - 1;
  const quantile = q >= 0 && q < n ? residuals[q] : residuals[n - 1];

  return {
    quantile,
    alpha,
    coverage: 1 - alpha,
    
    /**
     * Predict interval for new prediction
     */
    predictInterval(prediction) {
      return {
        prediction,
        lower: prediction - quantile,
        upper: prediction + quantile,
        width: 2 * quantile
      };
    }
  };
}

/**
 * USAGE EXAMPLES:
 * 
 * // 1. Calibrate win probabilities
 * const calibrator = new IsotonicCalibrator();
 * calibrator.fit(valPredictions, valOutcomes);
 * const calibratedProb = calibrator.transform(0.65);
 * 
 * // 2. Evaluate calibration quality
 * const curve = calculateReliabilityCurve(predictions, outcomes);
 * console.log(`ECE: ${curve.ece.toFixed(3)} (${curve.quality})`);
 * 
 * // 3. Calculate Brier score
 * const brier = calculateBrierScore(predictions, outcomes);
 * console.log(`Brier score: ${brier.toFixed(4)}`);
 * 
 * // 4. Conformal intervals for spreads
 * const conformal = fitConformalPredictor(calPreds, calActuals, 0.1);
 * const interval = conformal.predictInterval(5.5);
 * console.log(`Spread: ${interval.prediction} ± ${interval.width/2}`);
 */
