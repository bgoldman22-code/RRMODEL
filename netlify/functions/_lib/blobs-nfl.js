// netlify/functions/_lib/blobs-nfl.js

export async function readBlobJSON(path) {
  // Replace with your existing blob get wrapper
  try {
    const res = await nflBlobsGetJSON(path); // Your existing function
    return res || null;
  } catch (error) {
    console.warn(`Failed to read blob at ${path}:`, error);
    return null;
  }
}

export async function loadAdvancedMetrics(season) {
  return (await readBlobJSON(`nfl/epa/latest.json`)) || null;
}

export async function loadInjuries() {
  return (await readBlobJSON(`nfl/injuries/latest.json`)) || { teams: {}, asOf: null };
}

// Helper function to validate blob data structure
export function validateAdvancedMetrics(data) {
  if (!data || !data.teams || !data.league) {
    return false;
  }
  
  // Check if we have required league normalization data
  const hasLeagueMeans = data.league.means && Object.keys(data.league.means).length > 0;
  const hasLeagueStds = data.league.stds && Object.keys(data.league.stds).length > 0;
  
  return hasLeagueMeans && hasLeagueStds;
}

// Helper to get team data with fallbacks
export function getTeamMetrics(data, teamCode) {
  if (!data || !data.teams || !data.teams[teamCode]) {
    return null;
  }
  
  return data.teams[teamCode];
}