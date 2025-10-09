// netlify/functions/_lib/espn-ir-tracker.mjs
// ESPN Injured Reserve (IR) Tracker - Supplements BallDontLie with long-term IR data
// BallDontLie only tracks weekly injury reports; ESPN tracks IR-designated players

const TEAM_ABBREVIATIONS = {
  'Arizona Cardinals': 'ARI', 'Arizona': 'ARI',
  'Atlanta Falcons': 'ATL', 'Atlanta': 'ATL',
  'Baltimore Ravens': 'BAL', 'Baltimore': 'BAL',
  'Buffalo Bills': 'BUF', 'Buffalo': 'BUF',
  'Carolina Panthers': 'CAR', 'Carolina': 'CAR',
  'Chicago Bears': 'CHI', 'Chicago': 'CHI',
  'Cincinnati Bengals': 'CIN', 'Cincinnati': 'CIN',
  'Cleveland Browns': 'CLE', 'Cleveland': 'CLE',
  'Dallas Cowboys': 'DAL', 'Dallas': 'DAL',
  'Denver Broncos': 'DEN', 'Denver': 'DEN',
  'Detroit Lions': 'DET', 'Detroit': 'DET',
  'Green Bay Packers': 'GB', 'Green Bay': 'GB',
  'Houston Texans': 'HOU', 'Houston': 'HOU',
  'Indianapolis Colts': 'IND', 'Indianapolis': 'IND',
  'Jacksonville Jaguars': 'JAX', 'Jacksonville': 'JAX',
  'Kansas City Chiefs': 'KC', 'Kansas City': 'KC',
  'Las Vegas Raiders': 'LV', 'Las Vegas': 'LV',
  'Los Angeles Chargers': 'LAC', 'L.A. Chargers': 'LAC',
  'Los Angeles Rams': 'LAR', 'L.A. Rams': 'LAR',
  'Miami Dolphins': 'MIA', 'Miami': 'MIA',
  'Minnesota Vikings': 'MIN', 'Minnesota': 'MIN',
  'New England Patriots': 'NE', 'New England': 'NE',
  'New Orleans Saints': 'NO', 'New Orleans': 'NO',
  'New York Giants': 'NYG', 'NY Giants': 'NYG',
  'New York Jets': 'NYJ', 'NY Jets': 'NYJ',
  'Philadelphia Eagles': 'PHI', 'Philadelphia': 'PHI',
  'Pittsburgh Steelers': 'PIT', 'Pittsburgh': 'PIT',
  'San Francisco 49ers': 'SF', 'San Francisco': 'SF',
  'Seattle Seahawks': 'SEA', 'Seattle': 'SEA',
  'Tampa Bay Buccaneers': 'TB', 'Tampa Bay': 'TB',
  'Tennessee Titans': 'TEN', 'Tennessee': 'TEN',
  'Washington Commanders': 'WAS', 'Washington': 'WAS'
};

const ESPN_TEAM_IDS = {
  'ARI': '22', 'ATL': '1', 'BAL': '33', 'BUF': '2', 'CAR': '29', 'CHI': '3',
  'CIN': '4', 'CLE': '5', 'DAL': '6', 'DEN': '7', 'DET': '8', 'GB': '9',
  'HOU': '34', 'IND': '11', 'JAX': '30', 'KC': '12', 'LV': '13', 'LAC': '24',
  'LAR': '14', 'MIA': '15', 'MIN': '16', 'NE': '17', 'NO': '18', 'NYG': '19',
  'NYJ': '20', 'PHI': '21', 'PIT': '23', 'SF': '25', 'SEA': '26', 'TB': '27',
  'TEN': '10', 'WAS': '28'
};

/**
 * Fetch IR players using ESPN's official roster API (preferred method)
 * Returns clean structured data without HTML parsing
 */
async function fetchESPN_IR_ViaAPI() {
  const irPlayers = {};
  let totalIR = 0;

  try {
    console.log('📡 Fetching IR data via ESPN API...');
    
    // Fetch all 32 teams in parallel
    const teamFetches = Object.entries(ESPN_TEAM_IDS).map(async ([abbrev, teamId]) => {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryTracker/1.0)'
          }
        });

        if (!response.ok) {
          console.warn(`⚠️ ESPN API failed for ${abbrev}: ${response.status}`);
          return { abbrev, players: [] };
        }

        const data = await response.json();
        
        // Flatten athletes from offense/defense/special teams groups
        const allAthletes = [];
        if (data.athletes && Array.isArray(data.athletes)) {
          data.athletes.forEach(group => {
            if (group.items && Array.isArray(group.items)) {
              allAthletes.push(...group.items);
            }
          });
        }

        const irPlayersForTeam = allAthletes
          .filter(athlete => {
            // Check injuries array for IR status (primary source)
            const injuryStatus = athlete.injuries?.[0]?.status?.toLowerCase();
            if (injuryStatus?.includes('injured reserve') || injuryStatus?.includes('reserve/injured')) {
              return true;
            }
            
            // Fallback: check main status field
            const status = athlete.status?.type?.toLowerCase();
            return status === 'injured_reserve' || 
                   status === 'reserve/injured' ||
                   status === 'ir';
          })
          .map(athlete => ({
            name: athlete.displayName || athlete.fullName,
            position: athlete.position?.abbreviation || 'UNK',
            injury: athlete.injuries?.[0]?.longComment || athlete.injuries?.[0]?.status || 'Season-ending injury',
            status: 'IR'
          }));

        if (irPlayersForTeam.length > 0) {
          console.log(`  ${abbrev}: ${irPlayersForTeam.length} IR players`);
        }

        return { abbrev, players: irPlayersForTeam };
      } catch (err) {
        console.warn(`⚠️ Failed to fetch ${abbrev} roster: ${err.message}`);
        return { abbrev, players: [] };
      }
    });

    const results = await Promise.all(teamFetches);
    
    results.forEach(({ abbrev, players }) => {
      if (players.length > 0) {
        irPlayers[abbrev] = players;
        totalIR += players.length;
      }
    });

    console.log(`✅ ESPN API: Found ${totalIR} IR players across ${Object.keys(irPlayers).length} teams`);
    return { irPlayers, source: 'ESPN_API', totalIR };

  } catch (error) {
    console.error('❌ ESPN API fetch failed:', error.message);
    return { irPlayers: {}, source: 'ESPN_API_FAILED', totalIR: 0 };
  }
}

/**
 * Fallback: Parse ESPN's injuries webpage for IR players
 * Used if API fails or returns incomplete data
 */
async function fetchESPN_IR_ViaWebpage() {
  try {
    console.log('📄 Fetching IR data via ESPN webpage scraping...');
    
    const response = await fetch('https://www.espn.com/nfl/injuries', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryTracker/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`ESPN page returned ${response.status}`);
    }

    const html = await response.text();
    const irPlayers = {};
    let totalIR = 0;

    // Parse HTML for team sections and IR status
    // ESPN structure: Team headers followed by player rows with status cells
    const teamPattern = /<h2[^>]*>([^<]+(?:Cardinals|Falcons|Ravens|Bills|Panthers|Bears|Bengals|Browns|Cowboys|Broncos|Lions|Packers|Texans|Colts|Jaguars|Chiefs|Raiders|Chargers|Rams|Dolphins|Vikings|Patriots|Saints|Giants|Jets|Eagles|Steelers|49ers|Seahawks|Buccaneers|Titans|Commanders))<\/h2>/gi;
    const playerPattern = /<td[^>]*>([^<]+)<\/td>[^<]*<td[^>]*>([^<]+)<\/td>[^<]*<td[^>]*>([^<]+)<\/td>[^<]*<td[^>]*>(Injured Reserve|IR)<\/td>/gi;

    let currentTeam = null;
    const lines = html.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for team header
      const teamMatch = line.match(teamPattern);
      if (teamMatch) {
        const teamName = teamMatch[0].replace(/<[^>]+>/g, '').trim();
        currentTeam = TEAM_ABBREVIATIONS[teamName] || 
                     TEAM_ABBREVIATIONS[teamName.replace(' Injuries', '').trim()] ||
                     teamName.substring(0, 3).toUpperCase();
        continue;
      }

      // Check for IR player
      if (currentTeam && (line.includes('Injured Reserve') || line.includes('>IR<'))) {
        const playerMatch = line.match(playerPattern);
        if (playerMatch) {
          const [_, name, position, injury, status] = playerMatch;
          
          if (!irPlayers[currentTeam]) {
            irPlayers[currentTeam] = [];
          }

          irPlayers[currentTeam].push({
            name: name.trim(),
            position: position.trim(),
            injury: injury.trim(),
            status: 'IR'
          });
          totalIR++;
        }
      }
    }

    console.log(`✅ ESPN Webpage: Found ${totalIR} IR players across ${Object.keys(irPlayers).length} teams`);
    return { irPlayers, source: 'ESPN_WEBPAGE', totalIR };

  } catch (error) {
    console.error('❌ ESPN webpage scraping failed:', error.message);
    return { irPlayers: {}, source: 'ESPN_WEBPAGE_FAILED', totalIR: 0 };
  }
}

/**
 * Primary export: Fetch IR players with automatic fallback
 * Tries API first, falls back to webpage scraping
 */
export async function fetchESPN_IR_Players() {
  // Try API first (cleaner, more reliable)
  let result = await fetchESPN_IR_ViaAPI();

  // If API returned no data or very few players, fall back to webpage
  if (result.totalIR < 10) {
    console.warn(`⚠️ API returned only ${result.totalIR} IR players, trying webpage fallback...`);
    const webpageResult = await fetchESPN_IR_ViaWebpage();
    
    // Use webpage result if it found more players
    if (webpageResult.totalIR > result.totalIR) {
      result = webpageResult;
    }
  }

  // Add metadata
  result.timestamp = new Date().toISOString();
  result.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24hr cache

  return result;
}

/**
 * Check if a specific player is on IR
 */
export function isPlayerOnIR(playerName, teamCode, irData) {
  if (!irData || !irData.irPlayers) return false;
  
  const teamIR = irData.irPlayers[teamCode];
  if (!teamIR || teamIR.length === 0) return false;

  // Normalize player name for comparison (handles "Patrick Mahomes II" vs "Patrick Mahomes")
  const normalizedSearchName = playerName.toLowerCase().replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '').trim();

  return teamIR.some(player => {
    const normalizedPlayerName = player.name.toLowerCase().replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, '').trim();
    return normalizedPlayerName === normalizedSearchName || 
           normalizedPlayerName.includes(normalizedSearchName) ||
           normalizedSearchName.includes(normalizedPlayerName);
  });
}

/**
 * Get all IR players for a specific team
 */
export function getTeamIRPlayers(teamCode, irData) {
  if (!irData || !irData.irPlayers) return [];
  return irData.irPlayers[teamCode] || [];
}

/**
 * Integration helper: Merge IR data into existing injury structure
 * Converts ESPN IR format to match BallDontLie structure
 */
export function mergeIRIntoInjuryData(existingInjuries, irData) {
  if (!irData || !irData.irPlayers) return existingInjuries;

  const merged = { ...existingInjuries };

  Object.entries(irData.irPlayers).forEach(([teamCode, irPlayers]) => {
    if (!merged.teams) merged.teams = {};
    if (!merged.teams[teamCode]) {
      merged.teams[teamCode] = { injuries: [] };
    }

    // Add IR players to team's injury list if not already present
    irPlayers.forEach(irPlayer => {
      const alreadyExists = merged.teams[teamCode].injuries?.some(
        inj => inj.playerName?.toLowerCase() === irPlayer.name.toLowerCase()
      );

      if (!alreadyExists) {
        merged.teams[teamCode].injuries = merged.teams[teamCode].injuries || [];
        merged.teams[teamCode].injuries.push({
          playerName: irPlayer.name,
          position: irPlayer.position,
          status: 'out', // IR = definitely out
          designation: 'IR',
          injuryStatus: 'Injured Reserve',
          returnDate: 'Season-ending',
          impact: 'HIGH',
          source: irData.source,
          isIR: true // Flag for special handling
        });
      }
    });
  });

  // Add metadata
  if (!merged.metadata) merged.metadata = {};
  merged.metadata.irSource = irData.source;
  merged.metadata.irCount = irData.totalIR;
  merged.metadata.irTimestamp = irData.timestamp;

  return merged;
}

export default {
  fetchESPN_IR_Players,
  isPlayerOnIR,
  getTeamIRPlayers,
  mergeIRIntoInjuryData
};
