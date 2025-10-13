/**
 * NBA Artifact Manager
 * 
 * Model versioning, persistence, and loading system
 * Prevents stale vs fresh confusion with explicit timestamps
 * 
 * Features:
 * - Versioned model storage
 * - Ensemble + calibrator bundling
 * - Training metadata tracking
 * - Automatic rollback on failures
 */

import { getStore } from '@netlify/blobs';

/**
 * Artifact metadata structure
 */
const ARTIFACT_SCHEMA = {
  version: '1.0.0',           // Semantic versioning
  modelType: 'ensemble',      // ensemble, xgboost, nn, bayesian
  season: '2024-25',          // NBA season
  trainedAt: '',              // ISO timestamp
  dataVersion: '1.0',         // Data collection version
  trainingConfig: {},         // Hyperparameters, CV settings
  performance: {},            // Spread MAE, Total MAE, Brier, etc.
  models: {},                 // Serialized model weights
  calibrators: {},            // Isotonic calibrators per market
  metadata: {}                // Additional info
};

/**
 * Generate version key for storage
 * Format: nba/models/{version}/{season}/{YYYYMMDD_HHMMSS}.json
 * 
 * @param {string} season - NBA season (e.g., '2024-25')
 * @param {string} modelType - Model type (e.g., 'ensemble')
 * @returns {string} Blob storage key
 */
export function generateVersionKey(season, modelType = 'ensemble') {
  const now = new Date();
  const dateStr = now.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .split('.')[0]; // YYYYMMDD_HHMMSS
  
  return `nba/models/v1/${season}/${modelType}_${dateStr}.json`;
}

/**
 * Save artifact to blob storage with versioning
 * 
 * @param {object} artifact - Artifact object matching ARTIFACT_SCHEMA
 * @param {object} options - Save options
 * @returns {Promise<object>} Saved artifact metadata
 */
export async function saveArtifact(artifact, options = {}) {
  const {
    siteID = process.env.SITE_ID,
    token = process.env.NETLIFY_BLOB_TOKEN,
    updateLatest = true  // Also update "latest" pointer
  } = options;
  
  // Validate artifact structure
  validateArtifact(artifact);
  
  // Add save metadata
  const enrichedArtifact = {
    ...artifact,
    trainedAt: artifact.trainedAt || new Date().toISOString(),
    savedAt: new Date().toISOString(),
    version: artifact.version || '1.0.0'
  };
  
  // Generate versioned key
  const versionKey = generateVersionKey(
    artifact.season || '2024-25',
    artifact.modelType || 'ensemble'
  );
  
  // Save versioned artifact
  const store = getStore({ name: 'models', siteID, token });
  await store.setJSON(versionKey, enrichedArtifact);
  
  console.log(`[ArtifactManager] Saved artifact: ${versionKey}`);
  console.log(`  Performance: Spread MAE ${artifact.performance?.spreadMAE?.toFixed(2) || 'N/A'}, Total MAE ${artifact.performance?.totalMAE?.toFixed(2) || 'N/A'}`);
  
  // Update "latest" pointer
  if (updateLatest) {
    const latestKey = `nba/models/v1/${artifact.season || '2024-25'}/latest.json`;
    await store.setJSON(latestKey, {
      ...enrichedArtifact,
      versionKey,  // Reference to full artifact
      updatedAt: new Date().toISOString()
    });
    
    console.log(`[ArtifactManager] Updated latest pointer: ${latestKey}`);
  }
  
  // Save metadata index
  await updateArtifactIndex({
    versionKey,
    season: enrichedArtifact.season,
    modelType: enrichedArtifact.modelType,
    trainedAt: enrichedArtifact.trainedAt,
    performance: enrichedArtifact.performance
  }, { siteID, token });
  
  return {
    versionKey,
    artifact: enrichedArtifact,
    success: true
  };
}

/**
 * Load artifact from blob storage
 * 
 * @param {object} options - Load options
 * @returns {Promise<object>} Loaded artifact
 */
export async function loadArtifact(options = {}) {
  const {
    siteID = process.env.SITE_ID,
    token = process.env.NETLIFY_BLOB_TOKEN,
    season = '2024-25',
    modelType = 'ensemble',
    versionKey = null,       // Load specific version
    useLatest = true         // Load latest if no version specified
  } = options;
  
  const store = getStore({ name: 'models', siteID, token });
  
  let key = versionKey;
  
  // Load latest version if no specific version requested
  if (!key && useLatest) {
    key = `nba/models/v1/${season}/latest.json`;
  }
  
  if (!key) {
    throw new Error('[ArtifactManager] No version key or latest flag provided');
  }
  
  // Load artifact
  const artifact = await store.get(key, { type: 'json' });
  
  if (!artifact) {
    console.warn(`[ArtifactManager] Artifact not found: ${key}`);
    return null;
  }
  
  console.log(`[ArtifactManager] Loaded artifact: ${key}`);
  console.log(`  Trained: ${artifact.trainedAt}`);
  console.log(`  Performance: Spread MAE ${artifact.performance?.spreadMAE?.toFixed(2) || 'N/A'}, Total MAE ${artifact.performance?.totalMAE?.toFixed(2) || 'N/A'}`);
  
  return {
    artifact,
    versionKey: key,
    loadedAt: new Date().toISOString()
  };
}

/**
 * List all artifacts for a season
 * 
 * @param {string} season - NBA season
 * @param {object} options - List options
 * @returns {Promise<Array>} List of artifact metadata
 */
export async function listArtifacts(season = '2024-25', options = {}) {
  const {
    siteID = process.env.SITE_ID,
    token = process.env.NETLIFY_BLOB_TOKEN
  } = options;
  
  const store = getStore({ name: 'models', siteID, token });
  const indexKey = `nba/models/v1/${season}/index.json`;
  
  const index = await store.get(indexKey, { type: 'json' });
  
  if (!index) {
    console.warn(`[ArtifactManager] No index found for season ${season}`);
    return [];
  }
  
  return index.artifacts || [];
}

/**
 * Delete artifact (with safety checks)
 * 
 * @param {string} versionKey - Version key to delete
 * @param {object} options - Delete options
 * @returns {Promise<boolean>} Success status
 */
export async function deleteArtifact(versionKey, options = {}) {
  const {
    siteID = process.env.SITE_ID,
    token = process.env.NETLIFY_BLOB_TOKEN,
    force = false  // Require explicit force flag
  } = options;
  
  if (!force) {
    throw new Error('[ArtifactManager] Deletion requires force=true flag');
  }
  
  const store = getStore({ name: 'models', siteID, token });
  
  // Load artifact to check if it's the latest
  const artifact = await store.get(versionKey, { type: 'json' });
  
  if (!artifact) {
    console.warn(`[ArtifactManager] Artifact not found: ${versionKey}`);
    return false;
  }
  
  // Prevent deletion of latest without confirmation
  const latestKey = `nba/models/v1/${artifact.season}/latest.json`;
  const latest = await store.get(latestKey, { type: 'json' });
  
  if (latest && latest.versionKey === versionKey) {
    throw new Error('[ArtifactManager] Cannot delete latest artifact. Update latest pointer first.');
  }
  
  // Delete artifact
  await store.delete(versionKey);
  
  console.log(`[ArtifactManager] Deleted artifact: ${versionKey}`);
  
  return true;
}

/**
 * Update artifact index
 * 
 * @param {object} metadata - Artifact metadata
 * @param {object} options - Index options
 */
async function updateArtifactIndex(metadata, options = {}) {
  const {
    siteID = process.env.SITE_ID,
    token = process.env.NETLIFY_BLOB_TOKEN
  } = options;
  
  const store = getStore({ name: 'models', siteID, token });
  const indexKey = `nba/models/v1/${metadata.season}/index.json`;
  
  // Load existing index
  let index = await store.get(indexKey, { type: 'json' });
  
  if (!index) {
    index = {
      season: metadata.season,
      artifacts: [],
      createdAt: new Date().toISOString()
    };
  }
  
  // Add new artifact metadata
  index.artifacts.push({
    versionKey: metadata.versionKey,
    modelType: metadata.modelType,
    trainedAt: metadata.trainedAt,
    performance: metadata.performance
  });
  
  // Keep only last 50 artifacts in index
  if (index.artifacts.length > 50) {
    index.artifacts = index.artifacts.slice(-50);
  }
  
  index.updatedAt = new Date().toISOString();
  
  // Save updated index
  await store.setJSON(indexKey, index);
}

/**
 * Validate artifact structure
 * 
 * @param {object} artifact - Artifact to validate
 * @throws {Error} If validation fails
 */
function validateArtifact(artifact) {
  const required = ['modelType', 'season', 'models'];
  
  for (const field of required) {
    if (!artifact[field]) {
      throw new Error(`[ArtifactManager] Missing required field: ${field}`);
    }
  }
  
  // Validate performance metrics if present
  if (artifact.performance) {
    const metrics = ['spreadMAE', 'totalMAE'];
    for (const metric of metrics) {
      if (artifact.performance[metric] !== undefined && !isFinite(artifact.performance[metric])) {
        throw new Error(`[ArtifactManager] Invalid performance metric: ${metric}`);
      }
    }
  }
  
  return true;
}

/**
 * Rollback to previous artifact
 * 
 * @param {string} season - NBA season
 * @param {number} steps - Number of versions to rollback (default: 1)
 * @param {object} options - Rollback options
 * @returns {Promise<object>} Rolled back artifact
 */
export async function rollback(season, steps = 1, options = {}) {
  const artifacts = await listArtifacts(season, options);
  
  if (artifacts.length < steps + 1) {
    throw new Error(`[ArtifactManager] Not enough artifacts for rollback (need ${steps + 1}, have ${artifacts.length})`);
  }
  
  // Get target artifact (sorted by trainedAt descending)
  const sortedArtifacts = artifacts.sort((a, b) => 
    new Date(b.trainedAt) - new Date(a.trainedAt)
  );
  
  const targetKey = sortedArtifacts[steps].versionKey;
  
  console.log(`[ArtifactManager] Rolling back ${steps} version(s) to: ${targetKey}`);
  
  // Load target artifact
  const result = await loadArtifact({
    ...options,
    versionKey: targetKey,
    useLatest: false
  });
  
  // Update latest pointer
  const store = getStore({
    name: 'models',
    siteID: options.siteID || process.env.SITE_ID,
    token: options.token || process.env.NETLIFY_BLOB_TOKEN
  });
  
  const latestKey = `nba/models/v1/${season}/latest.json`;
  await store.setJSON(latestKey, {
    ...result.artifact,
    versionKey: targetKey,
    rolledBackAt: new Date().toISOString(),
    rolledBackFrom: sortedArtifacts[0].versionKey
  });
  
  console.log(`[ArtifactManager] Rollback complete. Latest now points to: ${targetKey}`);
  
  return result;
}

/**
 * USAGE EXAMPLES:
 * 
 * // 1. Save trained models
 * const artifact = {
 *   modelType: 'ensemble',
 *   season: '2024-25',
 *   trainingConfig: { cv_folds: 5, test_size: 0.15 },
 *   performance: { spreadMAE: 4.2, totalMAE: 5.8, brier: 0.18 },
 *   models: {
 *     xgboost: { weights: [...], trees: [...] },
 *     nn: { layers: [...], weights: [...] },
 *     bayesian: { priors: [...], posteriors: [...] }
 *   },
 *   calibrators: {
 *     spread: isotonicCalibrator.toJSON(),
 *     total: isotonicCalibrator2.toJSON()
 *   }
 * };
 * 
 * await saveArtifact(artifact);
 * 
 * // 2. Load latest models
 * const { artifact } = await loadArtifact({ season: '2024-25' });
 * 
 * // 3. List all versions
 * const versions = await listArtifacts('2024-25');
 * 
 * // 4. Rollback to previous version
 * await rollback('2024-25', 1);
 */
