// netlify/functions/_lib/blobs-nfl.js
// Complete version with fixed week detection and historical data integration
// FIXED: Added missing storeBlob export for nfl-results-store compatibility
// ENHANCED: R Pipeline integration for fresh NFLverse data

import { getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';

// Constants
export const HELPER_MODE = 'production';
export const HELPER_VERSION = '2.1.0'; // Updated for R pipeline integration

// Helper function to read local files (for R pipeline data)
async function readFileAsJSON(filePath) {
  try {
    // Try different path resolutions for Netlify functions
    const possiblePaths = [
      filePath,
      path.join(process.cwd(), filePath),
      path.join(process.cwd(), '..', '..', '..', filePath), // Netlify functions are nested
      path.join(__dirname, '..', '..', '..', filePath)
    ];
    
    for (const tryPath of possiblePaths) {
      if (fs.existsSync(tryPath)) {
        const content = fs.readFileSync(tryPath, 'utf8');
        return JSON.parse(content);
      }
    }
    throw new Error(`File not found at any of: ${possiblePaths.join(', ')}`);
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }
}

// Convert R pipeline player predictions to team-level EPA metrics
function aggregatePlayerDataToTeams(rPipelineData) {
  console.log('🔄 Converting R pipeline player data to team EPA metrics...');
  
  const { predictions } = rPipelineData;
  const teams = {};
  const league = { means: {}, stds: {} };
  
  // Group players by team
  const teamGroups = {};
  predictions.forEach(player => {
    if (!teamGroups[player.team]) {
      teamGroups[player.team] = [];
    }
    teamGroups[player.team].push(player);
  });
  
  // Convert team player data to EPA-style metrics
  Object.entries(teamGroups).forEach(([teamCode, players]) => {
    // Aggregate offensive EPA from skill position players
    const skillPlayers = players.filter(p => ['RB', 'WR', 'TE', 'QB'].includes(p.position));
    const avgTDProb = skillPlayers.reduce((sum, p) => sum + (p.anytime_td?.probability || 0), 0) / skillPlayers.length;
    
    // Convert TD probability to EPA-style offensive rating
    // Higher TD probability = better offensive EPA
    const offensiveEPA = (avgTDProb - 0.15) * 2; // Scale around league average of 15% TD rate
    
    // Estimate defensive EPA (inverse relationship - teams that allow fewer TDs have better defense)
    // This is approximate since we don't have opponent TD data directly
    const estimatedDefEPA = -offensiveEPA * 0.3; // Rough estimate
    
    teams[teamCode] = {
      core: {
        off_epa: Math.max(-0.2, Math.min(0.2, offensiveEPA)), // Bound to reasonable EPA range
        def_epa: Math.max(-0.2, Math.min(0.2, estimatedDefEPA)),
        pass_epa: offensiveEPA * 0.7, // Passing typically 70% of offensive EPA
        rush_epa: offensiveEPA * 0.3,
        plays: 65 * players.filter(p => p.position !== 'QB').length // Estimate plays based on skill players
      },
      variance: {
        off_epa: Math.abs(offensiveEPA) * 0.5, // Variance scales with performance
        def_epa: Math.abs(estimatedDefEPA) * 0.5,
        pass_epa: Math.abs(offensiveEPA) * 0.6,
        rush_epa: Math.abs(offensiveEPA) * 0.4
      },
      playerCount: players.length,
      avgTDProb: avgTDProb
    };
  });
  
  // Calculate league averages for normalization
  const teamValues = Object.values(teams);
  league.means = {
    off_epa: teamValues.reduce((sum, t) => sum + t.core.off_epa, 0) / teamValues.length,
    def_epa: teamValues.reduce((sum, t) => sum + t.core.def_epa, 0) / teamValues.length,
    pass_epa: teamValues.reduce((sum, t) => sum + t.core.pass_epa, 0) / teamValues.length,
    rush_epa: teamValues.reduce((sum, t) => sum + t.core.rush_epa, 0) / teamValues.length
  };
  
  league.stds = {
    off_epa: Math.sqrt(teamValues.reduce((sum, t) => sum + Math.pow(t.core.off_epa - league.means.off_epa, 2), 0) / teamValues.length),
    def_epa: Math.sqrt(teamValues.reduce((sum, t) => sum + Math.pow(t.core.def_epa - league.means.def_epa, 2), 0) / teamValues.length),
    pass_epa: Math.sqrt(teamValues.reduce((sum, t) => sum + Math.pow(t.core.pass_epa - league.means.pass_epa, 2), 0) / teamValues.length),
    rush_epa: Math.sqrt(teamValues.reduce((sum, t) => sum + Math.pow(t.core.rush_epa - league.means.rush_epa, 2), 0) / teamValues.length)
  };
  
  console.log(`✅ Converted ${Object.keys(teams).length} teams from R pipeline data`);
  console.log('Sample team metrics:', Object.keys(teams).slice(0, 3).map(t => `${t}: ${teams[t].core.off_epa.toFixed(3)} EPA`));
  
  return { teams, league };
}

// Get the appropriate blob store
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

// Core blob operations
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


// ADDED: Missing storeBlob function for nfl-results-store compatibility
export async function storeBlob(path, data) {
  try {
    const store = getBlobStore();
    const json = JSON.stringify(data);
    await store.set(path, json, { contentType: 'application/json' });
    console.log(`[storeBlob] Successfully stored blob at: ${path}`);
    return true;
  } catch (error) {
    console.error(`[storeBlob] Failed to store blob at ${path}:`, error);
    throw error;
  }
}

// ADDED: loadBlob export for compatibility with TD and predictions systems
export async function loadBlob(path) {
  return await nflBlobsGetJSON(path);
}

export async function readBlobJSON(path) {
  return await nflBlobsGetJSON(path);
}

// FIXED: Multi-season data loading with corrected week detection + R PIPELINE INTEGRATION
export async function loadAdvancedMetrics(season = '2025') {
  console.log(`=== LOADING MULTI-SEASON METRICS (Target: ${season}) + R PIPELINE DATA ===`);
  
  // PRIORITY 1: Try to load fresh R pipeline team data
  try {
    console.log('🔄 Attempting to load R pipeline team aggregations...');
    const rPipelineData = await readFileAsJSON('netlify/functions/_data/nfl-td-comprehensive-latest.json');
    
    if (rPipelineData?.metadata?.generated_at) {
      const generatedTime = new Date(rPipelineData.metadata.generated_at);
      const hoursOld = (Date.now() - generatedTime.getTime()) / (1000 * 60 * 60);
      
      if (hoursOld < 12) { // Use R pipeline data if less than 12 hours old
        console.log(`✅ Using fresh R pipeline data (${hoursOld.toFixed(1)} hours old)`);
        
        // Convert R pipeline player data to team aggregates for EPA model
        const teamMetrics = aggregatePlayerDataToTeams(rPipelineData);
        
        return {
          version: 'r_pipeline_integrated',
          generated_at: rPipelineData.metadata.generated_at,
          currentWeek: rPipelineData.metadata.week,
          ...teamMetrics
        };
      } else {
        console.log(`⚠️  R pipeline data is stale (${hoursOld.toFixed(1)} hours old), falling back to blobs`);
      }
    }
  } catch (error) {
    console.log('⚠️  R pipeline data not available, falling back to blob storage:', error.message);
  }
  
  // FALLBACK: Try to load the enhanced data from blobs
  const enhancedData = await readBlobJSON(`nfl/epa/latest.json`);
  
  // If we already have historical integration, return it
  if (enhancedData?.version === 'adv_v2_historical') {
    console.log('Found existing historical integration data from blobs');
    return enhancedData;
  }
  
  // Otherwise, build multi-season integration on the fly
  console.log('Building multi-season integration from blobs...');
  
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
  
  // FIXED: Detect current week properly
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

// FIXED: Proper week detection for 2025 NFL season with Tuesday-Monday weeks
function detectCurrentWeek() {
  const now = new Date();
  
  // 2025 NFL Season started September 4, 2025 (Thursday Night Football)
  const seasonStart = new Date('2025-09-04');
  
  // NFL weeks run Tuesday to Monday, not Sunday to Saturday
  // Week 1: Sept 2-8 (includes TNF Sept 4, games through MNF Sept 8)
  // Week 2: Sept 9-15, Week 3: Sept 16-22, etc.
  
  const nowDay = now.getDay(); // 0=Sunday, 1=Monday, 2=Tuesday...
  let adjustedDate = new Date(now);
  
  // If it's Monday, it's still the current week (final day)
  // If it's Tuesday, it's the start of the new week
  if (nowDay === 1) {
    // Monday: still current week, subtract 1 day for calculation
    adjustedDate.setDate(adjustedDate.getDate() - 1);
  }
  
  // Calculate days since season start with adjustment
  const daysSinceStart = Math.floor((adjustedDate - seasonStart) / (24 * 60 * 60 * 1000));
  
  // Convert to weeks with proper NFL week boundaries
  const weeksSinceStart = Math.floor(daysSinceStart / 7) + 1;
  
  console.log(`=== NFL WEEK DETECTION (FIXED) ===`);
  console.log(`Current date: ${now.toDateString()} (${nowDay === 0 ? 'Sunday' : nowDay === 1 ? 'Monday' : nowDay === 2 ? 'Tuesday' : nowDay === 3 ? 'Wednesday' : nowDay === 4 ? 'Thursday' : nowDay === 5 ? 'Friday' : 'Saturday'})`);
  console.log(`Season start: ${seasonStart.toDateString()}`);
  console.log(`Days since start (adjusted): ${daysSinceStart}`);
  console.log(`Calculated week: ${weeksSinceStart}`);
  console.log(`Calculated week: ${weeksSinceStart}`);
  
  // Clamp to reasonable range (Weeks 1-22 to include playoffs)
  const currentWeek = Math.max(1, Math.min(22, weeksSinceStart));
  
  console.log(`Final week (after clamp): ${currentWeek}`);
  
  return currentWeek;
}

// FIXED: Dynamic weights based on actual current week
function calculateDynamicWeights(currentWeek) {
  console.log(`Calculating weights for week ${currentWeek}`);
  
  if (currentWeek <= 4) {
    // Early season (Weeks 1-4) - Heavy historical reliance
    console.log('Using early season weights - heavy historical reliance');
    return {
      season_2025: 0.4,  // Current season data limited
      season_2024: 0.4,  // Last season very relevant
      season_2023: 0.2,  // 2-year data still useful
      recent_4_weeks: 0.1
    };
  } else if (currentWeek <= 12) {
    // Mid season (Weeks 5-12) - Balanced approach
    console.log('Using mid season weights - balanced approach');
    return {
      season_2025: 0.6,
      season_2024: 0.3,
      season_2023: 0.1,
      recent_4_weeks: 0.15
    };
  } else {
    // Late season (Weeks 13+) - Current season emphasis
    console.log('Using late season weights - current season emphasis');
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

// Enhanced team metrics with historical context
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

// Get current week from integrated data
export function getCurrentWeek(data) {
  return data?.currentWeek || detectCurrentWeek();
}

// Get current weights from integrated data
export function getCurrentWeights(data) {
  return data?.weights || {
    season_2025: 1.0,
    season_2024: 0.0,
    season_2023: 0.0,
    recent_4_weeks: 0.0
  };
}

// Historical data functions
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
  try {
    // Try comprehensive injury system first (Elite v4.0)
    const comprehensiveData = await readBlobJSON(`nfl/injuries/comprehensive.json`);
    if (comprehensiveData && comprehensiveData.teams && Object.keys(comprehensiveData.teams).length > 0) {
      console.log('✅ Loaded injury data from Elite Injury System v4.0 (comprehensive)');
      return comprehensiveData;
    }
  } catch (error) {
    console.warn('⚠️ Elite comprehensive injury data failed:', error.message);
  }

  try {
    // Fallback to legacy blob storage
    const blobData = await readBlobJSON(`nfl/injuries/latest.json`);
    if (blobData && blobData.teams && Object.keys(blobData.teams).length > 0) {
      console.log('✅ Loaded injury data from blob storage (legacy)');
      return blobData;
    }
  } catch (error) {
    console.warn('⚠️ Blob storage injury data failed:', error.message);
  }
  
  try {
    // Fallback to public URL  
    console.log('🔄 Trying public URL fallback for injury data...');
    const response = await fetch('https://bgroundrobin.com/data/nfl/injuries/latest.json');
    if (response.ok) {
      const publicData = await response.json();
      if (publicData && publicData.teams && Object.keys(publicData.teams).length > 0) {
        console.log('✅ Loaded injury data from public URL');
        return publicData;
      }
    }
  } catch (error) {
    console.warn('⚠️ Public URL injury data failed:', error.message);
  }

  try {
    // Final fallback: Try to generate fresh injury data from comprehensive system
    console.log('🔄 Attempting to generate fresh injury data...');
    const response = await fetch('https://bgroundrobin.com/.netlify/functions/nfl-injuries-comprehensive');
    if (response.ok) {
      const freshData = await response.json();
      if (freshData.success && freshData.teams && Object.keys(freshData.teams).length > 0) {
        console.log('✅ Generated fresh injury data from comprehensive system');
        return { teams: freshData.teams, asOf: freshData.asOf, version: freshData.version };
      }
    }
  } catch (error) {
    console.warn('⚠️ Fresh injury data generation failed:', error.message);
  }
  
  console.error('❌ No injury data available from any source');
  return { teams: {}, asOf: null };
}

// Validation functions
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
