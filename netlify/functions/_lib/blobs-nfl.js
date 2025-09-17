// netlify/functions/_lib/blobs-nfl.js
// FIXED: Multi-season historical data integration

// Multi-season data loading with proper historical integration
export async function loadAdvancedMetrics(targetSeason = '2025') {
  console.log(`=== LOADING MULTI-SEASON METRICS (Target: ${targetSeason}) ===`);
  
  const seasons = ['2025', '2024', '2023'];
  let combinedData = {
    teams: {},
    league: { means: {}, stds: {} },
    asOf: new Date().toISOString(),
    seasons: {},
    currentSeason: targetSeason
  };
  
  // Load all available seasons
  for (const season of seasons) {
    try {
      console.log(`Loading season ${season}...`);
      const seasonData = await loadSeasonData(season);
      
      if (seasonData && seasonData.teams) {
        combinedData.seasons[season] = seasonData;
        console.log(`✓ Season ${season} loaded: ${Object.keys(seasonData.teams).length} teams`);
        
        // Use current season for league baseline
        if (season === targetSeason) {
          combinedData.league = seasonData.league || { means: {}, stds: {} };
        }
      } else {
        console.warn(`⚠ Season ${season} data incomplete or missing`);
      }
    } catch (error) {
      console.warn(`⚠ Failed to load season ${season}:`, error.message);
    }
  }
  
  // Combine multi-season data for each team
  const currentWeek = getCurrentWeekFromData(combinedData);
  const historicalWeights = calculateHistoricalWeights(currentWeek);
  
  console.log(`Current week detected: ${currentWeek}`);
  console.log(`Historical weights:`, historicalWeights);
  
  // Blend historical data for each team
  for (const teamCode of getAllTeamCodes()) {
    console.log(`Blending historical data for ${teamCode}...`);
    combinedData.teams[teamCode] = blendTeamHistoricalData(
      teamCode, 
      combinedData.seasons, 
      historicalWeights,
      currentWeek
    );
  }
  
  // Add metadata
  combinedData.currentWeek = currentWeek;
  combinedData.historicalWeights = historicalWeights;
  combinedData.hasHistoricalIntegration = true;
  combinedData.seasonsLoaded = Object.keys(combinedData.seasons);
  
  console.log(`=== MULTI-SEASON INTEGRATION COMPLETE ===`);
  console.log(`Teams processed: ${Object.keys(combinedData.teams).length}`);
  console.log(`Seasons integrated: ${combinedData.seasonsLoaded.join(', ')}`);
  
  return combinedData;
}

// Load individual season data
async function loadSeasonData(season) {
  try {
    const blobName = `nfl-advanced-${season}`;
    console.log(`Fetching blob: ${blobName}`);
    
    const response = await fetch(`${process.env.URL}/.netlify/blobs/${blobName}`, {
      headers: {
        'authorization': `Bearer ${process.env.NETLIFY_BLOBS_TOKEN}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Blob fetch failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Season ${season} data structure:`, {
      hasTeams: !!data?.teams,
      teamCount: Object.keys(data?.teams || {}).length,
      hasLeague: !!data?.league,
      asOf: data?.asOf
    });
    
    return data;
  } catch (error) {
    console.warn(`Failed to load season ${season}:`, error);
    return null;
  }
}

// FIXED: Get current week from actual game data
function getCurrentWeekFromData(combinedData) {
  // Try to detect current week from 2025 season data
  const currentSeasonData = combinedData.seasons?.['2025'];
  
  if (currentSeasonData?.currentWeek) {
    return currentSeasonData.currentWeek;
  }
  
  // Fallback: estimate based on date
  const now = new Date();
  const seasonStart = new Date('2024-09-05'); // NFL season start
  const weeksSinceStart = Math.floor((now - seasonStart) / (7 * 24 * 60 * 60 * 1000));
  
  // Clamp to reasonable range
  return Math.max(1, Math.min(18, weeksSinceStart + 1));
}

// FIXED: Calculate proper historical weights based on current week
function calculateHistoricalWeights(currentWeek) {
  console.log(`Calculating historical weights for week ${currentWeek}`);
  
  // Early season (Weeks 1-4): Heavy historical reliance
  if (currentWeek <= 4) {
    return {
      season_2025: 0.4,
      season_2024: 0.4,
      season_2023: 0.2,
      recent_4_weeks: 0.1,
      early_season_boost: true
    };
  }
  
  // Mid season (Weeks 5-12): Balanced approach
  if (currentWeek <= 12) {
    return {
      season_2025: 0.6,
      season_2024: 0.3,
      season_2023: 0.1,
      recent_4_weeks: 0.15,
      mid_season: true
    };
  }
  
  // Late season (Weeks 13+): Current season emphasis
  return {
    season_2025: 0.8,
    season_2024: 0.15,
    season_2023: 0.05,
    recent_4_weeks: 0.2,
    late_season: true
  };
}

// FIXED: Blend multi-season team data with proper weighting
function blendTeamHistoricalData(teamCode, seasons, weights, currentWeek) {
  console.log(`Blending data for ${teamCode} with weights:`, weights);
  
  const blendedTeam = {
    _metadata: {
      teamCode,
      currentWeek,
      hasHistoricalData: false,
      seasonsUsed: [],
      blendingWeights: weights
    }
  };
  
  // Initialize all metric categories
  const categories = [
    'situational', 'pressure', 'turnovers', 'coaching', 
    'discipline', 'tempo', 'core', 'script', 'formations',
    'consistency', 'form'
  ];
  
  for (const category of categories) {
    blendedTeam[category] = {};
  }
  
  // Blend data from available seasons
  for (const [season, weight] of Object.entries(weights)) {
    if (season.startsWith('season_') && weight > 0) {
      const seasonYear = season.replace('season_', '');
      const seasonData = seasons[seasonYear];
      
      if (seasonData?.teams?.[teamCode]) {
        console.log(`Incorporating ${seasonYear} data for ${teamCode} (weight: ${weight})`);
        
        blendedTeam._metadata.hasHistoricalData = true;
        blendedTeam._metadata.seasonsUsed.push(seasonYear);
        
        const teamData = seasonData.teams[teamCode];
        
        // Blend each category
        for (const category of categories) {
          if (teamData[category]) {
            for (const [metric, value] of Object.entries(teamData[category])) {
              if (typeof value === 'number') {
                if (!blendedTeam[category][metric]) {
                  blendedTeam[category][metric] = 0;
                }
                blendedTeam[category][metric] += value * weight;
              }
            }
          }
        }
      }
    }
  }
  
  // Add recent form boost if applicable
  if (weights.recent_4_weeks > 0 && seasons['2025']?.teams?.[teamCode]?.form) {
    const recentForm = seasons['2025'].teams[teamCode].form;
    for (const [metric, value] of Object.entries(recentForm)) {
      if (typeof value === 'number') {
        if (!blendedTeam.form[metric]) {
          blendedTeam.form[metric] = value;
        } else {
          blendedTeam.form[metric] += value * weights.recent_4_weeks;
        }
      }
    }
  }
  
  console.log(`✓ ${teamCode} blended from ${blendedTeam._metadata.seasonsUsed.length} seasons`);
  return blendedTeam;
}

// Get all NFL team codes
function getAllTeamCodes() {
  return [
    'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
    'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
    'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
    'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS'
  ];
}

// FIXED: Enhanced team metrics retrieval
export function getTeamMetrics(advancedMetrics, teamCode) {
  if (!advancedMetrics?.teams?.[teamCode]) {
    console.warn(`No metrics found for team: ${teamCode}`);
    return null;
  }
  
  const teamData = advancedMetrics.teams[teamCode];
  
  // Ensure metadata is present
  if (!teamData._metadata) {
    teamData._metadata = {
      hasHistoricalData: false,
      seasonsUsed: ['2025']
    };
  }
  
  console.log(`Retrieved metrics for ${teamCode}:`, {
    hasHistoricalData: teamData._metadata.hasHistoricalData,
    seasonsUsed: teamData._metadata.seasonsUsed,
    categories: Object.keys(teamData).filter(k => k !== '_metadata')
  });
  
  return teamData;
}

// FIXED: Get current week from loaded data
export function getCurrentWeek(advancedMetrics) {
  if (advancedMetrics?.currentWeek) {
    return advancedMetrics.currentWeek;
  }
  
  // Fallback calculation
  const now = new Date();
  const seasonStart = new Date('2024-09-05');
  const weeksSinceStart = Math.floor((now - seasonStart) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(18, weeksSinceStart + 1));
}

// FIXED: Get current weights from loaded data
export function getCurrentWeights(advancedMetrics) {
  if (advancedMetrics?.historicalWeights) {
    return advancedMetrics.historicalWeights;
  }
  
  // Fallback to mid-season weights
  return {
    season_2025: 0.6,
    season_2024: 0.3,
    season_2023: 0.1,
    recent_4_weeks: 0.15
  };
}

// Enhanced metrics validation
export function validateAdvancedMetrics(advancedMetrics) {
  if (!advancedMetrics) {
    console.warn('No advanced metrics provided');
    return false;
  }
  
  const hasTeams = advancedMetrics.teams && Object.keys(advancedMetrics.teams).length > 0;
  const hasLeague = advancedMetrics.league && advancedMetrics.league.means;
  const hasHistoricalIntegration = advancedMetrics.hasHistoricalIntegration;
  
  console.log('Metrics validation:', {
    hasTeams,
    hasLeague,
    hasHistoricalIntegration,
    teamCount: Object.keys(advancedMetrics.teams || {}).length,
    seasonsLoaded: advancedMetrics.seasonsLoaded || []
  });
  
  return hasTeams && hasLeague;
}

// Enhanced diagnostics
export function diagnoseMetricsData(advancedMetrics) {
  if (!advancedMetrics) {
    return { status: 'missing', details: 'No metrics data provided' };
  }
  
  const diagnosis = {
    status: 'loaded',
    totalTeams: Object.keys(advancedMetrics.teams || {}).length,
    hasLeagueData: !!advancedMetrics.league?.means,
    hasHistoricalIntegration: !!advancedMetrics.hasHistoricalIntegration,
    currentWeek: advancedMetrics.currentWeek,
    seasonsLoaded: advancedMetrics.seasonsLoaded || [],
    historicalWeights: advancedMetrics.historicalWeights || null,
    sampleTeamData: null
  };
  
  // Sample team analysis
  const sampleTeam = Object.keys(advancedMetrics.teams || {})[0];
  if (sampleTeam) {
    const teamData = advancedMetrics.teams[sampleTeam];
    diagnosis.sampleTeamData = {
      teamCode: sampleTeam,
      hasMetadata: !!teamData._metadata,
      hasHistoricalData: teamData._metadata?.hasHistoricalData || false,
      seasonsUsed: teamData._metadata?.seasonsUsed || [],
      categories: Object.keys(teamData).filter(k => k !== '_metadata')
    };
  }
  
  return diagnosis;
}

// Load injuries (unchanged)
export async function loadInjuries() {
  try {
    const response = await fetch(`${process.env.URL}/.netlify/blobs/nfl-injuries`, {
      headers: {
        'authorization': `Bearer ${process.env.NETLIFY_BLOBS_TOKEN}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Injuries fetch failed: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.warn('Failed to load injuries:', error);
    return null;
  }
}
