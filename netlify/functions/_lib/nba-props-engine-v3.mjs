/**
 * NBA Player Props Production Inference Engine v3
 * Phase 3.5: Unified Logistic + LightGBM Hybrid System
 * 
 * This is the PRODUCTION inference layer that:
 * 1. Loads models from the registry
 * 2. Routes predictions to the correct engine (Logistic PRA vs LightGBM)
 * 3. Returns probabilities + edges for live betting decisions
 * 
 * CRITICAL: This is inference-only. NO TRAINING CODE.
 * 
 * Usage:
 *   import { createInferenceEngine } from './nba-props-engine-v3.mjs';
 *   const engine = await createInferenceEngine();
 *   const result = await engine.predict(market, features, line, odds, side);
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  predictProbability,
  sigmoid
} from './phase3-inference.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../..');

/**
 * Load the model registry
 */
export async function loadRegistry() {
  const registryPath = join(PROJECT_ROOT, 'data/nba/models/phase3_model_registry.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
  return registry;
}

/**
 * Load a Logistic PRA model (JSON format)
 */
export function loadLogisticModel(modelPath) {
  const fullPath = join(PROJECT_ROOT, modelPath);
  const model = JSON.parse(readFileSync(fullPath, 'utf-8'));
  
  // Validate required fields
  const requiredFields = ['feature_columns', 'coefficients', 'intercept', 'scaler_mean', 'scaler_scale'];
  for (const field of requiredFields) {
    if (!model[field]) {
      throw new Error(`Invalid Logistic model: missing ${field}`);
    }
  }
  
  return model;
}

/**
 * Load a LightGBM model (text format from booster.save_model())
 * 
 * NOTE: LightGBM text format contains the full model tree structure.
 * For production, we need to either:
 * 1. Use a Python subprocess to call lightgbm.Booster() (current approach)
 * 2. Implement a lightweight JS parser for LGBM text format
 * 3. Export models to a format like ONNX
 * 
 * For now, we'll use approach #1 (Python subprocess) since we already have
 * the infrastructure from backtest-lgbm-thresholds.mjs
 */
export function loadLightGBMModelMetadata(metadataPath) {
  const fullPath = join(PROJECT_ROOT, metadataPath);
  const metadata = JSON.parse(readFileSync(fullPath, 'utf-8'));
  
  // Return metadata + model file path for Python subprocess
  return {
    ...metadata,
    modelFilePath: metadataPath.replace('.json', '.txt')
  };
}

/**
 * Predict using Logistic PRA model (native JavaScript)
 */
export function predictLogistic(features, model) {
  return predictProbability(features, model);
}

/**
 * Predict using LightGBM model (Python subprocess)
 * 
 * This function requires a Python environment with lightgbm installed.
 * It writes features to a temp file, calls Python to load the model and predict,
 * then reads the result.
 */
export async function predictLightGBM(features, modelFilePath, featureColumns) {
  const { spawn } = await import('child_process');
  
  return new Promise((resolve, reject) => {
    // Prepare Python script inline
    const pythonCode = `
import sys
import json
import lightgbm as lgb
import numpy as np

# Read input from stdin
input_data = json.load(sys.stdin)
model_path = input_data['model_path']
features = input_data['features']
feature_columns = input_data['feature_columns']

# Load model
booster = lgb.Booster(model_file=model_path)

# Create feature array in correct order
feature_array = np.array([[features.get(col, 0.0) for col in feature_columns]])

# Predict probability
prob = booster.predict(feature_array)[0]

# Output result
print(json.dumps({'probability': float(prob)}))
`;

    const pythonProcess = spawn('python3', ['-c', pythonCode]);
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python process failed: ${stderr}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        resolve(result.probability);
      } catch (err) {
        reject(new Error(`Failed to parse Python output: ${err.message}\nOutput: ${stdout}`));
      }
    });
    
    // Write input to Python process
    const inputData = {
      model_path: join(PROJECT_ROOT, modelFilePath),
      features,
      feature_columns: featureColumns
    };
    
    pythonProcess.stdin.write(JSON.stringify(inputData));
    pythonProcess.stdin.end();
  });
}

/**
 * Calculate edge (probability vs implied probability from odds)
 */
export function calculateEdge(probability, americanOdds) {
  // Convert American odds to implied probability
  const impliedProb = americanOdds < 0
    ? Math.abs(americanOdds) / (Math.abs(americanOdds) + 100)
    : 100 / (americanOdds + 100);
  
  // Edge = our probability - market's implied probability
  const edge = probability - impliedProb;
  
  return {
    edge,
    impliedProb,
    ourProb: probability
  };
}

/**
 * Create the unified inference engine
 * 
 * This loads all production models from the registry and returns
 * an object with a predict() method that routes to the correct engine.
 */
export async function createInferenceEngine() {
  const registry = await loadRegistry();
  
  // Load all enabled models
  const loadedModels = {};
  
  for (const [marketKey, config] of Object.entries(registry.models)) {
    if (!config.enabled) continue;
    
    if (config.engine === 'logistic_pra') {
      // Load Logistic models (OVER and UNDER) from coefficient JSON files
      // NOTE: We use coefficient_files (JSON) not model_files (.pkl) because Node.js can't read pickle
      loadedModels[marketKey] = {
        engine: 'logistic_pra',
        market: config.market,
        threshold: config.threshold,
        overModel: loadLogisticModel(config.coefficient_files.over),
        underModel: loadLogisticModel(config.coefficient_files.under)
      };
    } else if (config.engine === 'lightgbm') {
      // Load LightGBM model metadata (actual prediction uses Python subprocess)
      loadedModels[marketKey] = {
        engine: 'lightgbm',
        market: config.market,
        threshold: config.threshold,
        overMetadata: loadLightGBMModelMetadata(config.metadata_files.over),
        underMetadata: loadLightGBMModelMetadata(config.metadata_files.under),
        overModelPath: config.model_files.over,
        underModelPath: config.model_files.under
      };
    }
  }
  
  /**
   * Predict probability for a given market and side
   * 
   * @param {string} market - 'player_points' | 'player_rebounds' | 'player_assists'
   * @param {Object} features - Feature object with all 60 features
   * @param {number} line - Betting line value
   * @param {number} odds - American odds (e.g., -110)
   * @param {string} side - 'Over' | 'Under'
   * @returns {Promise<Object>} { prob_win, edge, confidence, use_this_model, meetsThreshold }
   */
  async function predict(market, features, line, odds, side) {
    // Map market to model key
    let modelKey;
    if (market === 'player_points') modelKey = 'points';
    else if (market === 'player_rebounds') modelKey = 'rebounds';
    else if (market === 'player_assists') modelKey = 'assists';
    else throw new Error(`Unknown market: ${market}`);
    
    const modelConfig = loadedModels[modelKey];
    if (!modelConfig) {
      throw new Error(`Model not loaded for market: ${market} (key: ${modelKey})`);
    }
    
    let probability;
    
    if (modelConfig.engine === 'logistic_pra') {
      // Use Logistic PRA model
      const model = side === 'Over' ? modelConfig.overModel : modelConfig.underModel;
      probability = predictLogistic(features, model);
      
    } else if (modelConfig.engine === 'lightgbm') {
      // Use LightGBM model (Python subprocess)
      const modelPath = side === 'Over' ? modelConfig.overModelPath : modelConfig.underModelPath;
      const metadata = side === 'Over' ? modelConfig.overMetadata : modelConfig.underMetadata;
      
      // CRITICAL: Use the model's EXACT feature columns (not registry's feature_list)
      const featureColumns = metadata.feature_columns;
      
      // Debug logging for feature mismatch (one-time check)
      const liveKeys = Object.keys(features).length;
      const expectedKeys = featureColumns.length;
      if (liveKeys !== expectedKeys) {
        console.warn('[FEATURE MISMATCH]', {
          model: metadata.model_name || modelKey,
          expected: expectedKeys,
          live: liveKeys,
          missing: featureColumns.filter(c => !(c in features)),
          extra: Object.keys(features).filter(c => !featureColumns.includes(c))
        });
      }
      
      // Normalize features to match EXACT feature columns expected by this model
      const normalizedFeatures = {};
      for (const col of featureColumns) {
        normalizedFeatures[col] = (features[col] !== undefined && features[col] !== null)
          ? features[col]
          : 0;
      }
      
      probability = await predictLightGBM(normalizedFeatures, modelPath, featureColumns);
      
    } else {
      throw new Error(`Unknown engine: ${modelConfig.engine}`);
    }
    
    // Calculate edge
    const edgeCalc = calculateEdge(probability, odds);
    
    // Check if meets threshold
    const meetsThreshold = probability >= modelConfig.threshold;
    
    return {
      prob_win: probability,
      edge: edgeCalc.edge,
      implied_prob: edgeCalc.impliedProb,
      confidence: probability,
      use_this_model: `${modelKey}_${modelConfig.engine}`,
      threshold: modelConfig.threshold,
      meetsThreshold,
      engine: modelConfig.engine,
      market: modelKey,
      side
    };
  }
  
  /**
   * Batch predict for multiple props
   */
  async function batchPredict(props) {
    const results = [];
    
    for (const prop of props) {
      try {
        const result = await predict(
          prop.market,
          prop.features,
          prop.line,
          prop.odds,
          prop.side
        );
        results.push({
          ...prop,
          prediction: result
        });
      } catch (err) {
        results.push({
          ...prop,
          error: err.message
        });
      }
    }
    
    return results;
  }
  
  return {
    predict,
    batchPredict,
    registry,
    loadedModels
  };
}

/**
 * Helper: Normalize features to match model's expected feature set
 * 
 * CRITICAL: Each model has its own feature_columns list.
 * We must return ONLY those features in the EXACT order expected.
 * 
 * @param {Object} featureObject - Raw features from calculateFeatures()
 * @param {Object} model - Model config with feature_columns array
 * @returns {Object} Normalized features with exact columns needed
 */
export function normalizeFeatures(featureObject, model) {
  const normalized = {};
  
  // Use model-specific feature columns if available
  const featureList = model.feature_columns || model.metadata?.feature_list || [];
  
  for (const feature of featureList) {
    normalized[feature] = (featureObject[feature] !== undefined && featureObject[feature] !== null)
      ? featureObject[feature]
      : 0;
  }
  
  return normalized;
}

export default {
  createInferenceEngine,
  loadRegistry,
  loadLogisticModel,
  loadLightGBMModelMetadata,
  predictLogistic,
  predictLightGBM,
  calculateEdge,
  normalizeFeatures
};
