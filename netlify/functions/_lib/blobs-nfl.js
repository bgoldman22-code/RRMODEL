// netlify/functions/_lib/blobs-nfl.js
// SURGICAL FIX: Only replace the loadAdvancedMetrics and related functions

import { getStore } from '@netlify/blobs';

// Keep all your existing constants and functions unchanged
export const HELPER_MODE = 'production';
export const HELPER_VERSION = '2.0.0';

// Keep your existing getBlobStore, nflBlobsGetJSON, nflBlobsPutJSON, nflBlobsDelete functions unchanged

function getBlobStore() {
  const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-data';
  const token = process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.NETLIFY_SITE_ID;
  
  if (token && siteID) {
    return getStore({
      name: storeName,
      siteID: siteID,
      token: token
    });
  } else {
    return getStore(storeName);
  }
}

export async function nflBlobsGetJSON(path) {
  try {
    const store = getBlobStore();
    const blob = await store.get(path);
    if (!blob) return null;
    
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

export async function readBlobJSON(path) {
  return await nflBlobsGetJSON(path);
}

// FIXED: Multi-season data loading - this is the core fix
export async function loadAdvancedMetrics(season = '2025') {
  console.log(`=== LOADING MULTI-SEASON METRICS (Target: ${season}) ===`);
  
  // Try to load the enhanced data first
  const enhancedData = await readBlobJSON(`nfl/epa/latest.json`);
  
  // If we already have historical integration, return it
  if (enhancedData?.version === 'adv_v2_historical') {
    console.log('Found existing historical integration data');
    return enhancedData;
  }
  
  // Otherwise, build multi-season integration on the fly
  console.log('Building multi-season integration...');
  
  const seasons = ['2025', '2024', '2023'];
  const seasonData = {};
  
  // Load individual season data
  for (const yr of seasons) {
    try {
      const data = await readBlobJSON(`nfl/epa/historical_${yr}.json`) || 
                   (yr === '2025' ? enhancedData : null);
      
      if (data) {
        seasonData[yr] = data;
        console.log(`✓ Loaded ${yr} season data`);
      }
    } catch (error) {
      console.warn(`Failed to load ${yr} data:`, error);
    }
  }
  
  // If we don't have multi-season data, return current season data with warning
  if (Object.keys(seasonData).length === 0) {
    console.warn('No multi-season data available, using current data');
    return enhancedData;
  }
  
  // Detect current week
  const currentWeek = detectCurrentWeek();
  const weights = calculateDynamicWeights(currentWeek);
  
  console.log(`Current week: ${currentWeek}, Weights:`, weights);
  
  // Build integrated dataset
  const integratedData = {
    version: 'adv_v2_historical',
    currentWeek: currentWeek,
    weights: weights,
    teams: {},
    league: seasonData['2025']?.league || enhancedData?.league || { means: {}, stds: {} },
    asOf: new Date().toISOString(),
    seasonsIntegrated: Object.keys(seasonData)
  };
  
  // Integrate team data
  const allTeams = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
                   'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
                   'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
                   'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS'];
  
  for (const teamCode of allTeams) {
    integratedData.teams[teamCode] = integrateTeamData(teamCode, seasonData, weights);
  }
  
  console.log(`✓ Multi-season integration complete for ${Object.keys(integratedData.teams).length} teams`);
  
  return integratedData;
}

// Helper: Detect current week
function detectCurrentWeek() {
  const now = new Date();
  const seasonStart = new Date('2024-09-05'); // 2024 NFL season start
  const daysSinceStart = Math.floor((now - seasonStart) / (24 * 60 * 60 * 1000));
  const weeksSinceStart = Math.floor(daysSinceStart / 7);
  
  return Math.max(1, Math.min(18, weeksSinceStart + 1));
}

// Helper: Calculate dynamic weights based on current week
function calculateDynamicWeights(currentWeek) {
  if (currentWeek <= 4) {
    // Early season - rely heavily on historical data
    return {
      season_2025: 0.4,
      season_2024: 0.4,
      season_2023: 0.2,
      recent_4_weeks: 0.1
    };
  } else if (currentWeek <= 12) {
    // Mid season - balanced approach
    return {
      season_2025: 0.6,
      season_2024: 0.3,
      season_2023: 0.1,
      recent_4_weeks: 0.15
    };
  } else {
    // Late season - emphasize current season
    return {
      season_2025: 0.8,
      season_2024: 0.15,
      season_2023: 0.05,
      recent_4_weeks: 0.2
    };
  }
}

// Helper: Integrate team data across seasons
function integrateTeamData(teamCode, seasonData, weights) {
  const integrated = {
    _metadata: {
      teamCode,
      hasHistoricalData: false,
      seasonsUsed: [],
      weights: weights
    }
  };
  
  const categories = [
    'situational', 'pressure', 'turnovers', 'coaching', 
    'discipline', 'tempo', 'core', 'script', 'formations',
    'consistency', 'form'
  ];
  
  // Initialize categories
  for (const cat of categories) {
    integrated[cat] = {};
  }
  
  // Blend data from available seasons
  for (const [season, weight] of Object.entries(weights)) {
    if (season.startsWith('season_')) {
      const year = season.replace('season_', '');
      const data = seasonData[year];
      
      if (data?.teams?.[teamCode]) {
        integrated._metadata.hasHistoricalData = true;
        integrated._metadata.seasonsUsed.push(year);
        
        const teamData = data.teams[teamCode];
        
        for (const category of categories) {
          if (teamData[category]) {
            for (const [metric, value] of Object.entries(teamData[category])) {
              if (typeof value === 'number') {
                if (!integrated[category][metric]) {
                  integrated[category][metric] = 0;
                }
                integrated[category][metric] += value * weight;
              }
            }
          }
        }
      }
    }
  }
  
  return integrated;
}

// FIXED: Enhanced team metrics with historical context
export function getTeamMetrics(data, teamCode) {
  if (!data || !data.teams || !data.teams[teamCode]) {
    console.warn(`No metrics found for team: ${teamCode}`);
    return null;
  }
  
  const teamData = data.teams[teamCode];
  
  // Enhanced metadata for historical integration
  if (data.version === 'adv_v2_historical') {
    return {
      ...teamData,
      _metadata: {
        ...teamData._metadata,
        hasHistoricalData: true,
        dataVintage: data.version,
        currentWeek: data.currentWeek,
        weights: data.weights
      }
    };
  }
  
  return teamData;
}

// FIXED: Get current week from integrated data
export function getCurrentWeek(data) {
  return data?.currentWeek || detectCurrentWeek();
}

// FIXED: Get current weights from integrated data
export function getCurrentWeights(data) {
  return data?.weights || {
    season_2025: 1.0,
    season_2024: 0.0,
    season_2023: 0.0,
    recent_4_weeks: 0.0
  };
}

// Keep your existing functions unchanged
export async function loadHistoricalMetrics(season) {
  try {
    const data = await readBlobJSON(`nfl/epa/historical_${season}.json`);
    return data;
  } catch (error) {
    console.warn(`No historical metrics found for ${season}:`, error);
    return null;
  }
}

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

export function validateAdvancedMetrics(data) {
  if (!data || !data.teams || !data.league) {
    return false;
  }
  
  const hasLeagueMeans = data.league.means && Object.keys(data.league.means).length > 0;
  const hasLeagueStds = data.league.stds && Object.keys(data.league.stds).length > 0;
  const hasValidWeights = data.weights && typeof data.weights === 'object';
  const hasCurrentWeek = typeof data.currentWeek === 'number';
  
  const basicValid = hasLeagueMeans && hasLeagueStds;
  const enhancedValid = basicValid && hasValidWeights && hasCurrentWeek;
  
  if (data.version === 'adv_v2_historical') {
    return enhancedValid;
  } else {
    if (basicValid) {
      console.warn('Using legacy metrics without historical integration');
    }
    return basicValid;
  }
}

export function diagnoseMetricsData(data) {
  if (!data) return { status: 'missing', issues: ['No data found'] };
  
  const issues = [];
  const status = [];
  
  if (data.version === 'adv_v2_historical') {
    status.push('historical_integration_enabled');
  } else {
    issues.push('using_legacy_data_without_historical_integration');
  }
  
  const teamCount = Object.keys(data.teams || {}).length;
  if (teamCount < 32) {
    issues.push(`only_${teamCount}_teams_found_expected_32`);
  } else {
    status.push(`all_${teamCount}_teams_loaded`);
  }
  
  if (data.weights) {
    const totalWeight = Object.values(data.weights).reduce((sum, w) => sum + w, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      issues.push(`weights_dont_sum_to_1_actual_${totalWeight.toFixed(3)}`);
    } else {
      status.push('weights_properly_normalized');
    }
  }
  
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
  
  const backupPath = `nfl/epa/legacy_backup_${Date.now()}.json`;
  await nflBlobsPutJSON(backupPath, currentData);
  console.log(`Legacy data backed up to: ${backupPath}`);
  
  return true;
}
