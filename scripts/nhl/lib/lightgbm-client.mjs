/**
 * LightGBM Client Module
 * 
 * Provides HTTP client interface to communicate with Python LightGBM Flask server.
 * Handles CSV serialization, training requests with warm-start, and batch predictions.
 */

import fetch from 'node-fetch';

/**
 * Convert GBM training samples to deterministic CSV format
 * @param {Array} samples - Array of {features: Array, target: Number} objects
 * @returns {String} CSV string with header row
 */
export function samplesToCSV(samples) {
  if (!samples || samples.length === 0) {
    throw new Error('No samples provided for CSV conversion');
  }

  // Determine feature count from first sample
  const featureCount = samples[0].features.length;
  
  // Create header: feature_0, feature_1, ..., target
  const headers = [];
  for (let i = 0; i < featureCount; i++) {
    headers.push(`feature_${i}`);
  }
  headers.push('target');
  
  // Build CSV rows
  const rows = [headers.join(',')];
  
  samples.forEach(sample => {
    if (sample.features.length !== featureCount) {
      throw new Error(`Feature count mismatch: expected ${featureCount}, got ${sample.features.length}`);
    }
    
    const row = [...sample.features, sample.target];
    rows.push(row.join(','));
  });
  
  return rows.join('\n');
}

/**
 * Train LightGBM model via Flask server
 * @param {String} csvData - CSV string with features and target
 * @param {String} boosterState - Optional base64-encoded booster for warm-start
 * @param {String} endpoint - Flask server endpoint URL
 * @returns {Object} {predictions: Array, boosterState: String, metrics: Object}
 */
export async function trainWithLightGBM(csvData, boosterState = null, endpoint = 'http://localhost:8888/train-lgbm') {
  if (!csvData) {
    throw new Error('CSV data is required for training');
  }

  // Encode CSV to base64
  const csvBase64 = Buffer.from(csvData).toString('base64');
  
  const payload = {
    csv: csvBase64
  };
  
  // Include booster state for warm-start if provided
  if (boosterState) {
    payload.boosterState = boosterState;
  }
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      timeout: 60000 // 60 second timeout
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LightGBM training failed (${response.status}): ${errorText}`);
    }
    
    const result = await response.json();
    
    return {
      predictions: result.predictions || [],
      boosterState: result.boosterState,
      metrics: result.metrics || {},
      trainingSize: result.training_size,
      validationSize: result.validation_size
    };
  } catch (error) {
    if (error.name === 'FetchError' && error.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to LightGBM server at ${endpoint}. Is the Flask server running?`);
    }
    throw error;
  }
}

/**
 * Get predictions from existing LightGBM booster
 * @param {String} csvData - CSV string with features (no target column needed)
 * @param {String} boosterState - Base64-encoded booster
 * @param {String} endpoint - Flask server endpoint URL
 * @returns {Array} Predictions array
 */
export async function predictWithLightGBM(csvData, boosterState, endpoint = 'http://localhost:8888/predict-lgbm') {
  if (!csvData || !boosterState) {
    throw new Error('Both CSV data and booster state are required for prediction');
  }
  
  const csvBase64 = Buffer.from(csvData).toString('base64');
  
  const payload = {
    csv: csvBase64,
    boosterState: boosterState
  };
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      timeout: 30000 // 30 second timeout
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LightGBM prediction failed (${response.status}): ${errorText}`);
    }
    
    const result = await response.json();
    return result.predictions || [];
  } catch (error) {
    if (error.name === 'FetchError' && error.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to LightGBM server at ${endpoint}. Is the Flask server running?`);
    }
    throw error;
  }
}

/**
 * Booster State Manager
 * Manages LightGBM booster state persistence across walk-forward cycles
 */
export class BoosterStateManager {
  constructor() {
    this.currentState = null;
    this.cycleHistory = [];
  }
  
  /**
   * Update booster state after training
   * @param {String} newState - Base64-encoded booster state
   * @param {Number} cycleNum - Current cycle number
   */
  updateState(newState, cycleNum) {
    this.currentState = newState;
    this.cycleHistory.push({
      cycle: cycleNum,
      stateSize: newState ? newState.length : 0,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Get current booster state
   * @returns {String|null} Base64-encoded booster state
   */
  getState() {
    return this.currentState;
  }
  
  /**
   * Check if warm-start is available
   * @returns {Boolean}
   */
  hasState() {
    return this.currentState !== null;
  }
  
  /**
   * Get state history summary
   * @returns {Array}
   */
  getHistory() {
    return this.cycleHistory;
  }
  
  /**
   * Reset state (for debugging/testing)
   */
  reset() {
    this.currentState = null;
    this.cycleHistory = [];
  }
}

/**
 * Test LightGBM server health
 * @param {String} baseUrl - Base URL of Flask server (e.g., 'http://localhost:8888')
 * @returns {Object} {status: String, version: String}
 */
export async function testLightGBMHealth(baseUrl = 'http://localhost:8888') {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      timeout: 5000
    });
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    
    const result = await response.json();
    return {
      status: result.status,
      version: result.lightgbm_version
    };
  } catch (error) {
    if (error.name === 'FetchError' && error.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to LightGBM server at ${baseUrl}. Is the Flask server running?`);
    }
    throw error;
  }
}
