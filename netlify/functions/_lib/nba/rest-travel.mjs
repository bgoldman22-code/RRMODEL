/**
 * NBA Rest & Travel Calculator
 * 
 * Calculates fatigue factors from schedule:
 * - Days of rest
 * - Back-to-back games
 * - Travel distance
 * - Time zone changes
 * - Schedule density
 */

// Team locations (arena cities) for distance calculations
const TEAM_LOCATIONS = {
  'ATL': { city: 'Atlanta', lat: 33.7573, lon: -84.3963, tz: 'America/New_York' },
  'BOS': { city: 'Boston', lat: 42.3662, lon: -71.0621, tz: 'America/New_York' },
  'BKN': { city: 'Brooklyn', lat: 40.6826, lon: -73.9754, tz: 'America/New_York' },
  'CHA': { city: 'Charlotte', lat: 35.2251, lon: -80.8392, tz: 'America/New_York' },
  'CHI': { city: 'Chicago', lat: 41.8807, lon: -87.6742, tz: 'America/Chicago' },
  'CLE': { city: 'Cleveland', lat: 41.4964, lon: -81.6882, tz: 'America/New_York' },
  'DAL': { city: 'Dallas', lat: 32.7905, lon: -96.8103, tz: 'America/Chicago' },
  'DEN': { city: 'Denver', lat: 39.7487, lon: -104.8769, tz: 'America/Denver' },
  'DET': { city: 'Detroit', lat: 42.3410, lon: -83.0550, tz: 'America/New_York' },
  'GSW': { city: 'San Francisco', lat: 37.7680, lon: -122.3877, tz: 'America/Los_Angeles' },
  'HOU': { city: 'Houston', lat: 29.7507, lon: -95.3621, tz: 'America/Chicago' },
  'IND': { city: 'Indianapolis', lat: 39.7640, lon: -86.1555, tz: 'America/New_York' },
  'LAC': { city: 'Los Angeles', lat: 34.0430, lon: -118.2673, tz: 'America/Los_Angeles' },
  'LAL': { city: 'Los Angeles', lat: 34.0430, lon: -118.2673, tz: 'America/Los_Angeles' },
  'MEM': { city: 'Memphis', lat: 35.1383, lon: -89.9785, tz: 'America/Chicago' },
  'MIA': { city: 'Miami', lat: 25.7814, lon: -80.1870, tz: 'America/New_York' },
  'MIL': { city: 'Milwaukee', lat: 43.0450, lon: -87.9168, tz: 'America/Chicago' },
  'MIN': { city: 'Minneapolis', lat: 44.9795, lon: -93.2760, tz: 'America/Chicago' },
  'NOP': { city: 'New Orleans', lat: 29.9490, lon: -90.0821, tz: 'America/Chicago' },
  'NYK': { city: 'New York', lat: 40.7505, lon: -73.9934, tz: 'America/New_York' },
  'OKC': { city: 'Oklahoma City', lat: 35.4634, lon: -97.5151, tz: 'America/Chicago' },
  'ORL': { city: 'Orlando', lat: 28.5392, lon: -81.3839, tz: 'America/New_York' },
  'PHI': { city: 'Philadelphia', lat: 39.9012, lon: -75.1720, tz: 'America/New_York' },
  'PHX': { city: 'Phoenix', lat: 33.4457, lon: -112.0713, tz: 'America/Phoenix' },
  'POR': { city: 'Portland', lat: 45.5316, lon: -122.6668, tz: 'America/Los_Angeles' },
  'SAC': { city: 'Sacramento', lat: 38.5802, lon: -121.4997, tz: 'America/Los_Angeles' },
  'SAS': { city: 'San Antonio', lat: 29.4271, lon: -98.4375, tz: 'America/Chicago' },
  'TOR': { city: 'Toronto', lat: 43.6435, lon: -79.3791, tz: 'America/Toronto' },
  'UTA': { city: 'Salt Lake City', lat: 40.7683, lon: -111.9011, tz: 'America/Denver' },
  'WAS': { city: 'Washington', lat: 38.8981, lon: -77.0209, tz: 'America/New_York' }
};

// Timezone offsets (hours from UTC)
const TIMEZONE_OFFSETS = {
  'America/New_York': -5,
  'America/Chicago': -6,
  'America/Denver': -7,
  'America/Los_Angeles': -8,
  'America/Phoenix': -7,
  'America/Toronto': -5
};

/**
 * Calculate distance between two points (Haversine formula)
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance);
}

/**
 * Calculate timezone change
 */
export function calculateTimezoneChange(team1, team2) {
  const loc1 = TEAM_LOCATIONS[team1];
  const loc2 = TEAM_LOCATIONS[team2];
  
  if (!loc1 || !loc2) return 0;
  
  const tz1 = TIMEZONE_OFFSETS[loc1.tz] || 0;
  const tz2 = TIMEZONE_OFFSETS[loc2.tz] || 0;
  
  return Math.abs(tz2 - tz1);
}

/**
 * Calculate rest factors for a team
 */
export function calculateRestFactors(games, teamId, currentGameDate) {
  // Find team's recent games (sorted chronologically)
  const teamGames = games
    .filter(g => g.homeTeamId === teamId || g.awayTeamId === teamId)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const currentDate = new Date(currentGameDate);
  
  // Find last game before current
  const lastGame = teamGames
    .filter(g => new Date(g.date) < currentDate)
    .slice(-1)[0];
  
  if (!lastGame) {
    // Season start or no history
    return {
      daysRest: 7,
      isBackToBack: false,
      travel: {
        distance: 0,
        timezoneChange: 0,
        isLongTrip: false
      },
      schedule: {
        gamesLast3Days: 0,
        gamesLast7Days: 0,
        gamesLast14Days: 0
      },
      fatigueFactor: 0
    };
  }
  
  // Calculate days of rest
  const lastGameDate = new Date(lastGame.date);
  const daysRest = Math.floor((currentDate - lastGameDate) / (1000 * 60 * 60 * 24));
  const isBackToBack = daysRest < 1;
  
  // Calculate travel
  const lastGameLocation = lastGame.homeTeamId === teamId ? lastGame.homeTeam : lastGame.awayTeam;
  const currentGameLocation = games.find(g => 
    g.date === currentGameDate && (g.homeTeamId === teamId || g.awayTeamId === teamId)
  );
  const currentLocation = currentGameLocation?.homeTeamId === teamId ? 
    currentGameLocation.homeTeam : currentGameLocation?.awayTeam;
  
  let travelDistance = 0;
  let timezoneChange = 0;
  
  if (lastGameLocation && currentLocation && lastGameLocation !== currentLocation) {
    const lastLoc = TEAM_LOCATIONS[lastGameLocation];
    const currLoc = TEAM_LOCATIONS[currentLocation];
    
    if (lastLoc && currLoc) {
      travelDistance = calculateDistance(
        lastLoc.lat, lastLoc.lon,
        currLoc.lat, currLoc.lon
      );
      timezoneChange = calculateTimezoneChange(lastGameLocation, currentLocation);
    }
  }
  
  // Schedule density
  const threeDaysAgo = new Date(currentDate.getTime() - 3 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(currentDate.getTime() - 14 * 24 * 60 * 60 * 1000);
  
  const gamesLast3Days = teamGames.filter(g => {
    const gd = new Date(g.date);
    return gd >= threeDaysAgo && gd < currentDate;
  }).length;
  
  const gamesLast7Days = teamGames.filter(g => {
    const gd = new Date(g.date);
    return gd >= sevenDaysAgo && gd < currentDate;
  }).length;
  
  const gamesLast14Days = teamGames.filter(g => {
    const gd = new Date(g.date);
    return gd >= fourteenDaysAgo && gd < currentDate;
  }).length;
  
  // Calculate overall fatigue factor (-5 to +5)
  let fatigueFactor = 0;
  
  // Rest penalties/bonuses
  if (isBackToBack) fatigueFactor -= 2;
  else if (daysRest === 1) fatigueFactor -= 1;
  else if (daysRest >= 3) fatigueFactor += 1;
  
  // Travel penalties
  if (travelDistance > 2000) fatigueFactor -= 1.5;
  else if (travelDistance > 1000) fatigueFactor -= 0.5;
  
  if (timezoneChange >= 3) fatigueFactor -= 1;
  else if (timezoneChange >= 2) fatigueFactor -= 0.5;
  
  // Schedule density penalties
  if (gamesLast3Days >= 3) fatigueFactor -= 1.5;
  if (gamesLast7Days >= 5) fatigueFactor -= 1;
  
  return {
    daysRest,
    isBackToBack,
    travel: {
      distance: travelDistance,
      timezoneChange,
      isLongTrip: travelDistance > 1500 || timezoneChange >= 2
    },
    schedule: {
      gamesLast3Days,
      gamesLast7Days,
      gamesLast14Days
    },
    fatigueFactor: Math.max(-5, Math.min(5, fatigueFactor))
  };
}

/**
 * Get rest differential between home and away teams
 */
export function getRestDifferential(homeFactors, awayFactors) {
  return {
    restDiff: homeFactors.daysRest - awayFactors.daysRest,
    fatigueAdvantage: homeFactors.fatigueFactor - awayFactors.fatigueFactor,
    travelAdvantage: awayFactors.travel.distance - homeFactors.travel.distance,
    scheduleAdvantage: awayFactors.schedule.gamesLast7Days - homeFactors.schedule.gamesLast7Days,
    
    // Summary
    hasRestAdvantage: homeFactors.fatigueFactor > awayFactors.fatigueFactor + 1,
    hasRestDisadvantage: homeFactors.fatigueFactor < awayFactors.fatigueFactor - 1,
    
    // Expected point impact (research-based)
    expectedImpact: calculateExpectedImpact(homeFactors, awayFactors)
  };
}

/**
 * Calculate expected point impact from rest/travel
 * Based on NBA research:
 * - B2B games: -3 to -5 points
 * - Travel >2000mi: -1 to -2 points
 * - Timezone change: -1 to -2 points per zone
 */
function calculateExpectedImpact(homeFactors, awayFactors) {
  let homeImpact = 0;
  let awayImpact = 0;
  
  // Back-to-back penalty
  if (homeFactors.isBackToBack) homeImpact -= 3;
  if (awayFactors.isBackToBack) awayImpact -= 3;
  
  // Travel penalty
  if (homeFactors.travel.distance > 2000) homeImpact -= 1.5;
  if (awayFactors.travel.distance > 2000) awayImpact -= 1.5;
  
  // Timezone penalty (worse going East to West)
  homeImpact -= homeFactors.travel.timezoneChange * 0.7;
  awayImpact -= awayFactors.travel.timezoneChange * 0.7;
  
  // Schedule density
  if (homeFactors.schedule.gamesLast3Days >= 3) homeImpact -= 1;
  if (awayFactors.schedule.gamesLast3Days >= 3) awayImpact -= 1;
  
  return {
    home: Math.round(homeImpact * 10) / 10,
    away: Math.round(awayImpact * 10) / 10,
    differential: Math.round((homeImpact - awayImpact) * 10) / 10
  };
}

export default {
  calculateRestFactors,
  getRestDifferential,
  calculateDistance,
  calculateTimezoneChange,
  TEAM_LOCATIONS
};
