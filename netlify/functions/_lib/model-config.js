// netlify/functions/_lib/model-config.js
// Dynamic weight configuration system for ML optimization integration

import { loadBlob, storeBlob } from './blob_io.js';

/**
 * Model configuration system that supports both manual and ML-optimized weights
 * Allows A/B testing between weight configurations
 */

// Default manual weights (current system)
const DEFAULT_WEIGHTS = {
  // Base feature weights (90% of model)
  base_weights: {
    pressure_diff: 0.22,
    explosive_diff: 0.18, 
    turnover_diff: 0.12,
    rz_td: 0.15,
    third_down: 0.10,
    eds: 0.08,
    fourth_down_agg: 0.06,
    penalty_diff: 0.05,
    top_eff: 0.04
  },
  
  // Advanced feature weights (5% of model)
  advanced_weights: {
    form: 0.08,
    consistency: 0.02,
    tempo: 0.02,
    formations: 0.02,
    script_adaptation: 0.01
  },
  
  // Special teams weights (5% of model)
  special_teams_weights: {
    field_goal_net: 0.025,
    punt_net: 0.015,
    return_advantage: 0.008,
    coverage_efficiency: 0.002
  },
  
  // Scoring multipliers
  scoring_multipliers: {
    core_epa: 25,
    tier_base: 8,
    advanced_base: 6,
    matchup_base: 3.2,
    special_teams_base: 3
  },
  
  // Bias correction parameters
  bias_corrections: {
    home_field_advantage: 2.2,
    base_points_per_team: 24.0,
    defensive_drag_multiplier: 25,
    explosive_scoring_boost: 8,
    neutral_conditions_boost: 1.5
  }
};

/**
 * Load current model configuration
 */
export async function loadModelConfig(version = 'current') {
  try {
    console.log(`Loading model config version: ${version}`);
    
    // Try to load from blob storage
    let config = null;
    
    if (version === 'optimized') {
      config = await loadBlob('nfl', `model-config/optimized.json`);
    } else if (version === 'manual') {
      config = await loadBlob('nfl', `model-config/manual.json`);
    } else {
      // Load current active configuration
      config = await loadBlob('nfl', `model-config/current.json`);
    }
    
    if (config) {
      console.log(`Loaded ${version} configuration from blob storage`);
      return {
        ...config,
        version: version,
        loaded_from: 'blob_storage',
        timestamp: config.timestamp || new Date().toISOString()
      };
    }
    
    // Fall back to default weights
    console.log(`No ${version} config found, using default weights`);
    return {
      ...DEFAULT_WEIGHTS,
      version: 'default',
      loaded_from: 'default_fallback',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.warn(`Error loading model config: ${error.message}`);
    return {
      ...DEFAULT_WEIGHTS,
      version: 'default',
      loaded_from: 'error_fallback',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Save model configuration to blob storage
 */
export async function saveModelConfig(config, version = 'current') {
  try {
    const configWithMetadata = {
      ...config,
      version: version,
      saved_at: new Date().toISOString(),
      saved_by: 'model_config_system'
    };
    
    const blobPath = `model-config/${version}.json`;
    await storeBlob('nfl', blobPath, configWithMetadata);
    
    console.log(`Saved model config to ${blobPath}`);
    return true;
    
  } catch (error) {
    console.error(`Error saving model config: ${error.message}`);
    return false;
  }
}

/**
 * Activate a specific configuration version
 */
export async function activateConfig(version) {
  try {
    console.log(`Activating config version: ${version}`);
    
    // Load the specified version
    const config = await loadModelConfig(version);
    
    if (!config || config.loaded_from === 'error_fallback') {
      throw new Error(`Config version ${version} not found`);
    }
    
    // Save as current active configuration
    const success = await saveModelConfig(config, 'current');
    
    if (success) {
      console.log(`Successfully activated config version: ${version}`);
      return config;
    } else {
      throw new Error('Failed to save activated configuration');
    }
    
  } catch (error) {
    console.error(`Error activating config: ${error.message}`);
    throw error;
  }
}

/**
 * Compare two configuration versions
 */
export async function compareConfigs(version1 = 'manual', version2 = 'optimized') {
  try {
    const config1 = await loadModelConfig(version1);
    const config2 = await loadModelConfig(version2);
    
    const comparison = {
      version1: version1,
      version2: version2,
      differences: {},
      summary: {
        total_changes: 0,
        significant_changes: 0,
        max_change_percent: 0
      }
    };
    
    // Compare all weight categories
    const categories = ['base_weights', 'advanced_weights', 'special_teams_weights', 'scoring_multipliers', 'bias_corrections'];
    
    for (const category of categories) {
      const weights1 = config1[category] || {};
      const weights2 = config2[category] || {};
      
      comparison.differences[category] = {};
      
      // Get all unique parameter names
      const allParams = new Set([...Object.keys(weights1), ...Object.keys(weights2)]);
      
      for (const param of allParams) {
        const val1 = weights1[param] || 0;
        const val2 = weights2[param] || 0;
        
        if (val1 !== val2) {
          const changePercent = val1 !== 0 ? ((val2 - val1) / val1) * 100 : 100;
          
          comparison.differences[category][param] = {
            [version1]: val1,
            [version2]: val2,
            change_absolute: val2 - val1,
            change_percent: changePercent
          };
          
          comparison.summary.total_changes++;
          if (Math.abs(changePercent) > 10) {
            comparison.summary.significant_changes++;
          }
          if (Math.abs(changePercent) > comparison.summary.max_change_percent) {
            comparison.summary.max_change_percent = Math.abs(changePercent);
          }
        }
      }
    }
    
    return comparison;
    
  } catch (error) {
    console.error(`Error comparing configs: ${error.message}`);
    throw error;
  }
}

/**
 * A/B test between two configurations
 */
export async function getABTestConfig(userId = null, gameId = null) {
  try {
    // Simple hash-based A/B testing
    // In production, you might use more sophisticated routing
    
    let hashInput = gameId || userId || Math.random().toString();
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // 50/50 split between manual and optimized
    const useOptimized = Math.abs(hash) % 2 === 0;
    const version = useOptimized ? 'optimized' : 'manual';
    
    const config = await loadModelConfig(version);
    
    return {
      ...config,
      ab_test: {
        version_used: version,
        user_id: userId,
        game_id: gameId,
        hash_value: hash
      }
    };
    
  } catch (error) {
    console.warn(`A/B test config error: ${error.message}, falling back to manual`);
    return await loadModelConfig('manual');
  }
}

/**
 * Validate configuration weights
 */
export function validateConfig(config) {
  const errors = [];
  const warnings = [];
  
  try {
    // Check that all required categories exist
    const requiredCategories = ['base_weights', 'advanced_weights', 'special_teams_weights', 'scoring_multipliers', 'bias_corrections'];
    
    for (const category of requiredCategories) {
      if (!config[category]) {
        errors.push(`Missing required category: ${category}`);
        continue;
      }
      
      // Validate individual weights
      for (const [param, value] of Object.entries(config[category])) {
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`Invalid value for ${category}.${param}: ${value}`);
        }
        
        if (value < 0) {
          warnings.push(`Negative value for ${category}.${param}: ${value}`);
        }
        
        if (category.includes('weights') && value > 0.5) {
          warnings.push(`Unusually high weight for ${category}.${param}: ${value}`);
        }
      }
    }
    
    // Check that base weights approximately sum to reasonable range
    const baseWeightsSum = Object.values(config.base_weights || {}).reduce((sum, val) => sum + val, 0);
    if (baseWeightsSum < 0.5 || baseWeightsSum > 2.0) {
      warnings.push(`Base weights sum is unusual: ${baseWeightsSum.toFixed(3)}`);
    }
    
    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
    
  } catch (error) {
    return {
      valid: false,
      errors: [`Validation error: ${error.message}`],
      warnings: []
    };
  }
}

/**
 * Export configuration for use in prediction engine
 */
export function exportConfigForPrediction(config) {
  return {
    BASE_WEIGHTS: config.base_weights || DEFAULT_WEIGHTS.base_weights,
    ADVANCED_WEIGHTS: config.advanced_weights || DEFAULT_WEIGHTS.advanced_weights,
    SPECIAL_TEAMS_WEIGHTS: config.special_teams_weights || DEFAULT_WEIGHTS.special_teams_weights,
    SCORING_MULTIPLIERS: config.scoring_multipliers || DEFAULT_WEIGHTS.scoring_multipliers,
    BIAS_CORRECTIONS: config.bias_corrections || DEFAULT_WEIGHTS.bias_corrections,
    _config_metadata: {
      version: config.version || 'unknown',
      timestamp: config.timestamp || new Date().toISOString(),
      loaded_from: config.loaded_from || 'unknown'
    }
  };
}

/**
 * Integration point for ML optimization results
 */
export async function integrateMlOptimizedWeights(optimizedWeightsFile) {
  try {
    console.log('Integrating ML optimized weights...');
    
    // Load optimized weights from file or data
    let optimizedData;
    if (typeof optimizedWeightsFile === 'string') {
      // Load from file path
      optimizedData = JSON.parse(await fs.readFile(optimizedWeightsFile, 'utf8'));
    } else {
      // Use provided data object
      optimizedData = optimizedWeightsFile;
    }
    
    // Map ML optimization results to our config structure
    const optimizedConfig = {
      base_weights: {},
      advanced_weights: {},
      special_teams_weights: {},
      scoring_multipliers: {},
      bias_corrections: {}
    };
    
    // Map optimized weights to appropriate categories
    const mlWeights = optimizedData.weights || optimizedData;
    
    for (const [param, value] of Object.entries(mlWeights)) {
      if (param.includes('multiplier')) {
        optimizedConfig.scoring_multipliers[param.replace('_multiplier', '')] = value;
      } else if (['field_goal_net', 'punt_net', 'return_advantage', 'coverage_efficiency'].includes(param)) {
        optimizedConfig.special_teams_weights[param] = value;
      } else if (['form', 'consistency', 'tempo', 'formations', 'script_adaptation'].includes(param)) {
        optimizedConfig.advanced_weights[param] = value;
      } else if (['home_field_advantage', 'base_points_per_team', 'defensive_drag_multiplier', 'explosive_scoring_boost', 'neutral_conditions_boost'].includes(param)) {
        optimizedConfig.bias_corrections[param] = value;
      } else {
        // Assume it's a base weight
        optimizedConfig.base_weights[param] = value;
      }
    }
    
    // Add metadata
    optimizedConfig.optimization_metadata = {
      method: optimizedData.optimization_method || 'unknown',
      improvement_percent: optimizedData.improvement_percent || 0,
      original_error: optimizedData.original_error || null,
      optimized_error: optimizedData.optimized_error || null,
      timestamp: optimizedData.timestamp || new Date().toISOString()
    };
    
    // Validate the configuration
    const validation = validateConfig(optimizedConfig);
    if (!validation.valid) {
      throw new Error(`Invalid optimized configuration: ${validation.errors.join(', ')}`);
    }
    
    if (validation.warnings.length > 0) {
      console.warn('Configuration warnings:', validation.warnings);
    }
    
    // Save as optimized configuration
    const success = await saveModelConfig(optimizedConfig, 'optimized');
    
    if (success) {
      console.log('Successfully integrated ML optimized weights');
      return optimizedConfig;
    } else {
      throw new Error('Failed to save optimized configuration');
    }
    
  } catch (error) {
    console.error(`Error integrating ML optimized weights: ${error.message}`);
    throw error;
  }
}
