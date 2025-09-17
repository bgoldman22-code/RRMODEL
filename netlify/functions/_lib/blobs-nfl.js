// netlify/functions/_lib/blobs-nfl.js
// Enhanced version with historical data support

import { getStore } from '@netlify/blobs';

// Constants that some functions expect
export const HELPER_MODE = 'production';
export const HELPER_VERSION = '2.0.0'; // Updated for historical support

// Get the appropriate blob store
function getBlobStore() {
  const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-data';
  const token = process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.NETLIFY_SITE_ID;
  
  // Use explicit configuration if we have both token and siteID (same as ETL)
  if (token && siteID) {
    return getStore({
      name: storeName,
      siteID: siteID,
      token: token
    });
  } else {
    // Fallback to simple store name
    return getStore(storeName);
  }
}

// Legacy function names that your existing code expects
export async function nflBlobsGetJSON(path) {
  try {
    const store = getBlobStore();
    const blob = await store.get(path);
    if (!blob) return null;
    
    // Fix: Handle different blob response types
    let text;
    if (typeof blob === 'string') {
      text = blob;
    } else if (blob.text && typeof blob.text === 'function') {
      text = await blob.text();
    } else if (blob.body) {
      text = blob.body;
    } else {
      console.warn('Unknown blob type:', typeof blob);
      return null;
    }
    
    return JSON.parse(text);
  } catch (error) {
    console.warn(`Failed to read blob at ${path}:`, error);
    return null;
  }
}

export async function nflBlobsPutJSON(path, data) {
  try {
    const store = getBlobStore();
    const json = JSON.stringify(data);
    await store.set(path, json, { contentType: 'application/json' });
    return true;
  } catch (error) {
    console.error(`Failed to write blob at ${path}:`, error);
    throw error;
  }
}

export async function nflBlobsDelete(path) {
  try {
    const store = getBlobStore();
    await store.delete(path);
    return true;
  } catch (error) {
    console.warn(`Failed to delete blob at ${path}:`, error);
    return false;
  }
}

// New function names for the advanced metrics system
export async function readBlobJSON(path) {
  return await nflBlobsGetJSON(path);
}

// ENHANCED: Load advanced metrics with historical context awareness
export async function loadAdvancedMetrics(season) {
  const data = await readBlobJSON(`nfl/epa/latest.json`);
  
  if (!data) {
    console.warn('No advanced metrics found');
    return null;
  }
  
  // Validate that this data includes historical context
  if (data.version === 'adv_v2_historical') {
    console.log(`Loaded historical metrics - Week ${data.currentWeek}, Weights:`, data.weights);
    return data;
  } else {
    console.warn('Loaded legacy metrics without historical integration');
    return data;
  }
}

// ENHANCED: Load historical metrics for specific season (new function)
export async function loadHistoricalMetrics(season) {
  try {
    const data = await readBlobJSON(`nfl/epa/historical_${season}.json`);
    return data;
  } catch (error) {
    console.warn(`No historical metrics found for ${season}:`, error);
    return null;
  }
}

// ENHANCED: Store historical metrics by season (new function)
export async function storeHistoricalMetrics(season, data) {
  try {
    await nflBlobsPutJSON(`nfl/epa/historical_${season}.json`, {
      ...data,
      season: season,
      archived_at: new Date().toISOString()
    });
    console.log(`Archived ${season} metrics for historical reference`);
    return true;
  } catch (error) {
    console.error(`Failed to archive ${season} metrics:`, error);
    return false;
  }
}

export async function loadInjuries() {
  return (await readBlobJSON(`nfl/injuries/latest.json`)) || { teams: {}, asOf: null };
}

// ENHANCED: Helper function to validate blob data structure with historical support
export function validateAdvancedMetrics(data) {
  if (!data || !data.teams || !data.league) {
    return false;
  }
  
  // Check if we have required league normalization data
  const hasLeagueMeans = data.league.means && Object.keys(data.league.means).length > 0;
  const hasLeagueStds = data.league.stds && Object.keys(data.league.stds).length > 0;
  
  // Enhanced validation for historical data
  const hasValidWeights = data.weights && typeof data.weights === 'object';
  const hasCurrentWeek = typeof data.currentWeek === 'number';
  
  // Basic validation passes
  const basicValid = hasLeagueMeans && hasLeagueStds;
  
  // Enhanced validation for v2 (historical) data
  const enhancedValid = basicValid && hasValidWeights && hasCurrentWeek;
  
  if (data.version === 'adv_v2_historical') {
    return enhancedValid;
  } else {
    // Legacy data still valid but log warning
    if (basicValid) {
      console.warn('Using legacy metrics without historical integration');
    }
    return basicValid;
  }
}

// ENHANCED: Helper to get team data with historical context awareness
export function getTeamMetrics(data, teamCode) {
  if (!data || !data.teams || !data.teams[teamCode]) {
    console.warn(`No metrics found for team: ${teamCode}`);
    return null;
  }
  
  const teamData = data.teams[teamCode];
  
  // Add metadata about data quality for debugging
  if (data.version === 'adv_v2_historical') {
    return {
      ...teamData,
      _metadata: {
        hasHistoricalData: true,
        dataVintage: teamData.meta?.data_vintage,
        currentWeek: data.currentWeek,
        weights: data.weights
      }
    };
  }
  
  return teamData;
}

// NEW: Get current week from metrics data
export function getCurrentWeek(data) {
  return data?.currentWeek || 1;
}

// NEW: Get current weights from metrics data  
export function getCurrentWeights(data) {
  return data?.weights || {
    season_2025: 1.0,
    season_2024: 0.0,
    season_2023: 0.0,
    recent_4_weeks: 0.0
  };
}

// NEW: Diagnostic function to check data quality
export function diagnoseMetricsData(data) {
  if (!data) return { status: 'missing', issues: ['No data found'] };
  
  const issues = [];
  const status = [];
  
  // Check version
  if (data.version === 'adv_v2_historical') {
    status.push('historical_integration_enabled');
  } else {
    issues.push('using_legacy_data_without_historical_integration');
  }
  
  // Check teams
  const teamCount = Object.keys(data.teams || {}).length;
  if (teamCount < 32) {
    issues.push(`only_${teamCount}_teams_found_expected_32`);
  } else {
    status.push(`all_${teamCount}_teams_loaded`);
  }
  
  // Check weights
  if (data.weights) {
    const totalWeight = Object.values(data.weights).reduce((sum, w) => sum + w, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      issues.push(`weights_dont_sum_to_1_actual_${totalWeight.toFixed(3)}`);
    } else {
      status.push('weights_properly_normalized');
    }
  }
  
  // Check current week
  if (data.currentWeek && data.currentWeek >= 4 && data.weights?.recent_4_weeks > 0) {
    status.push('recent_form_weighting_active');
  }
  
  return {
    status: issues.length === 0 ? 'healthy' : 'issues_detected',
    version: data.version || 'legacy',
    currentWeek: data.currentWeek || 'unknown',
    weights: data.weights || 'not_available',
    issues: issues,
    positives: status
  };
}

// NEW: Migration helper to upgrade legacy data
export async function migrateLegacyData() {
  console.log('Checking for legacy data migration...');
  
  const currentData = await readBlobJSON('nfl/epa/latest.json');
  
  if (!currentData) {
    console.log('No existing data to migrate');
    return false;
  }
  
  if (currentData.version === 'adv_v2_historical') {
    console.log('Data already using historical integration');
    return false;
  }
  
  // Backup legacy data
  const backupPath = `nfl/epa/legacy_backup_${Date.now()}.json`;
  await nflBlobsPutJSON(backupPath, currentData);
  console.log(`Legacy data backed up to: ${backupPath}`);
  
  return true;
}
