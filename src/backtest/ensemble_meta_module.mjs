/**
 * MLB HR Round Robin - Ensemble Meta-Module
 * 
 * Stacking model that learns optimal blend of prediction modules 1-6
 * Uses XGBoost meta-learner trained on validation predictions
 * 
 * GPT Enhancement: "Ensemble Meta-Module (Module 7)"
 */

import * as tf from '@tensorflow/tfjs-node';

/**
 * Ensemble Meta-Module
 * Learns how to blend predictions from multiple modules
 */
class EnsembleMetaModule {
  constructor() {
    this.name = 'Ensemble Meta-Module';
    this.version = '1.0.0';
    this.model = null;
    this.moduleWeights = null;
    this.trainingHistory = [];
  }

  /**
   * Train ensemble on validation set
   * @param {Array} modules - Array of prediction modules to ensemble
   * @param {Array} historicalData - Training data with outcomes
   * @param {TemporalBoundary} boundary - Temporal enforcer
   */
  async train(modules, historicalData, boundary) {
    console.log('🧠 Training Ensemble Meta-Module...');
    
    // Step 1: Generate predictions from all modules
    const modulesPredictions = [];
    for (const module of modules) {
      console.log(`  📊 Generating predictions from ${module.name}...`);
      const predictions = [];
      
      for (const dataPoint of historicalData) {
        const pred = await module.predict(dataPoint.context, boundary);
        predictions.push({
          playerId: dataPoint.playerId,
          date: dataPoint.date,
          probability: pred.probability,
          confidence: pred.confidence,
          features: pred.features,
          actualOutcome: dataPoint.actualOutcome
        });
      }
      
      modulesPredictions.push({
        moduleName: module.name,
        predictions
      });
    }

    // Step 2: Build meta-features
    const trainingData = this.buildMetaFeatures(modulesPredictions);
    
    // Step 3: Train gradient boosting meta-learner
    this.model = await this.trainGradientBooster(trainingData);
    
    // Step 4: Calculate module importance weights
    this.moduleWeights = this.calculateModuleWeights(trainingData);
    
    console.log('✅ Ensemble Meta-Module trained');
    console.log('📊 Module Weights:', this.moduleWeights);
    
    return this.moduleWeights;
  }

  /**
   * Generate ensemble prediction
   * @param {Array} modulePredictions - Predictions from each module
   * @param {TemporalBoundary} boundary - Temporal enforcer
   */
  async predict(modulePredictions, boundary) {
    if (!this.model) {
      throw new Error('Ensemble model not trained. Call train() first.');
    }

    // Build meta-features from module predictions
    const metaFeatures = this.buildMetaFeaturesFromPredictions(modulePredictions);
    
    // Generate ensemble prediction using trained model
    const ensembleProbability = await this.modelPredict(metaFeatures);
    
    // Calculate confidence based on module agreement
    const moduleProbs = modulePredictions.map(p => p.probability);
    const avgProb = moduleProbs.reduce((a, b) => a + b, 0) / moduleProbs.length;
    const variance = moduleProbs.reduce((sum, p) => sum + Math.pow(p - avgProb, 2), 0) / moduleProbs.length;
    const agreement = 1 - Math.sqrt(variance);
    
    return {
      probability: ensembleProbability,
      confidence: agreement,
      features: {
        moduleProbs,
        agreement,
        variance,
        weights: this.moduleWeights
      },
      reasoning: `Ensemble of ${modulePredictions.length} modules (agreement: ${(agreement * 100).toFixed(1)}%)`
    };
  }

  /**
   * Build meta-features from module predictions (training)
   */
  buildMetaFeatures(modulesPredictions) {
    const allPlayerIds = [...new Set(modulesPredictions[0].predictions.map(p => p.playerId))];
    
    const metaFeatures = [];
    
    for (const playerId of allPlayerIds) {
      // Get this player's predictions from each module
      const playerPreds = modulesPredictions.map(mp => {
        return mp.predictions.find(p => p.playerId === playerId);
      }).filter(p => p !== undefined);
      
      if (playerPreds.length === 0) continue;
      
      const probs = playerPreds.map(p => p.probability);
      const confidences = playerPreds.map(p => p.confidence || 0.5);
      
      // Meta-features
      const features = {
        playerId,
        date: playerPreds[0].date,
        
        // Individual module predictions
        modulePredictions: probs,
        
        // Statistical features
        mean: probs.reduce((a, b) => a + b, 0) / probs.length,
        median: this.median(probs),
        min: Math.min(...probs),
        max: Math.max(...probs),
        range: Math.max(...probs) - Math.min(...probs),
        std: Math.sqrt(probs.reduce((sum, p) => sum + Math.pow(p - probs.reduce((a, b) => a + b, 0) / probs.length, 2), 0) / probs.length),
        
        // Agreement metrics
        agreement: 1 - Math.sqrt(probs.reduce((sum, p) => sum + Math.pow(p - probs.reduce((a, b) => a + b, 0) / probs.length, 2), 0) / probs.length),
        
        // Confidence weighted average
        confidenceWeightedAvg: probs.reduce((sum, p, i) => sum + p * confidences[i], 0) / confidences.reduce((a, b) => a + b, 0),
        
        // Target
        actualOutcome: playerPreds[0].actualOutcome
      };
      
      metaFeatures.push(features);
    }
    
    return metaFeatures;
  }

  /**
   * Build meta-features from predictions (inference)
   */
  buildMetaFeaturesFromPredictions(modulePredictions) {
    const probs = modulePredictions.map(p => p.probability);
    const confidences = modulePredictions.map(p => p.confidence || 0.5);
    
    const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
    
    return {
      modulePredictions: probs,
      mean,
      median: this.median(probs),
      min: Math.min(...probs),
      max: Math.max(...probs),
      range: Math.max(...probs) - Math.min(...probs),
      std: Math.sqrt(probs.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / probs.length),
      agreement: 1 - Math.sqrt(probs.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / probs.length),
      confidenceWeightedAvg: probs.reduce((sum, p, i) => sum + p * confidences[i], 0) / confidences.reduce((a, b) => a + b, 0)
    };
  }

  /**
   * Train gradient boosting model (simplified - use XGBoost in production)
   */
  async trainGradientBooster(trainingData) {
    console.log('  🌲 Training gradient boosting model...');
    
    // Prepare data
    const X = trainingData.map(d => [
      ...d.modulePredictions,
      d.mean,
      d.median,
      d.min,
      d.max,
      d.range,
      d.std,
      d.agreement,
      d.confidenceWeightedAvg
    ]);
    
    const y = trainingData.map(d => d.actualOutcome ? 1 : 0);
    
    // Simple neural network as meta-learner (use XGBoost in production for better performance)
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [X[0].length], units: 32, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 16, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' })
      ]
    });
    
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });
    
    const xTensor = tf.tensor2d(X);
    const yTensor = tf.tensor2d(y, [y.length, 1]);
    
    const history = await model.fit(xTensor, yTensor, {
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
      verbose: 0,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 10 === 0) {
            console.log(`    Epoch ${epoch}: loss=${logs.loss.toFixed(4)}, val_loss=${logs.val_loss.toFixed(4)}`);
          }
        }
      }
    });
    
    this.trainingHistory = history.history;
    
    xTensor.dispose();
    yTensor.dispose();
    
    return model;
  }

  /**
   * Generate prediction using trained model
   */
  async modelPredict(metaFeatures) {
    const input = [
      ...metaFeatures.modulePredictions,
      metaFeatures.mean,
      metaFeatures.median,
      metaFeatures.min,
      metaFeatures.max,
      metaFeatures.range,
      metaFeatures.std,
      metaFeatures.agreement,
      metaFeatures.confidenceWeightedAvg
    ];
    
    const inputTensor = tf.tensor2d([input]);
    const prediction = this.model.predict(inputTensor);
    const probability = (await prediction.data())[0];
    
    inputTensor.dispose();
    prediction.dispose();
    
    return probability;
  }

  /**
   * Calculate module importance weights
   */
  calculateModuleWeights(trainingData) {
    const moduleCount = trainingData[0].modulePredictions.length;
    const weights = new Array(moduleCount).fill(0);
    
    // Calculate correlation between each module and outcome
    for (let i = 0; i < moduleCount; i++) {
      const modulePreds = trainingData.map(d => d.modulePredictions[i]);
      const outcomes = trainingData.map(d => d.actualOutcome ? 1 : 0);
      
      const correlation = this.pearsonCorrelation(modulePreds, outcomes);
      weights[i] = Math.max(0, correlation); // Only positive correlations
    }
    
    // Normalize to sum to 1
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => w / sum);
  }

  /**
   * Simple ensemble (fallback if training fails)
   */
  simpleEnsemble(modulePredictions) {
    const probs = modulePredictions.map(p => p.probability);
    const weights = modulePredictions.map(p => p.confidence || 1);
    
    const weightedSum = probs.reduce((sum, p, i) => sum + p * weights[i], 0);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    
    return weightedSum / weightSum;
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
   * Utility: Pearson correlation
   */
  pearsonCorrelation(x, y) {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Get module metadata
   */
  getMetadata() {
    return {
      name: this.name,
      version: this.version,
      moduleWeights: this.moduleWeights,
      trainingHistory: this.trainingHistory
    };
  }

  /**
   * Evaluate ensemble performance
   */
  evaluate(predictions, actuals) {
    const results = {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1: 0,
      brier: 0,
      logLoss: 0
    };
    
    let tp = 0, fp = 0, tn = 0, fn = 0;
    let brierSum = 0;
    let logLossSum = 0;
    
    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i];
      const actual = actuals[i];
      
      // Binary classification at 0.5 threshold
      const predicted = pred >= 0.5 ? 1 : 0;
      
      if (predicted === 1 && actual === 1) tp++;
      else if (predicted === 1 && actual === 0) fp++;
      else if (predicted === 0 && actual === 0) tn++;
      else if (predicted === 0 && actual === 1) fn++;
      
      // Brier score
      brierSum += Math.pow(pred - actual, 2);
      
      // Log loss
      const epsilon = 1e-15;
      const clippedPred = Math.max(epsilon, Math.min(1 - epsilon, pred));
      logLossSum += actual * Math.log(clippedPred) + (1 - actual) * Math.log(1 - clippedPred);
    }
    
    results.accuracy = (tp + tn) / predictions.length;
    results.precision = tp / (tp + fp) || 0;
    results.recall = tp / (tp + fn) || 0;
    results.f1 = 2 * (results.precision * results.recall) / (results.precision + results.recall) || 0;
    results.brier = brierSum / predictions.length;
    results.logLoss = -logLossSum / predictions.length;
    
    return results;
  }
}

export { EnsembleMetaModule };
