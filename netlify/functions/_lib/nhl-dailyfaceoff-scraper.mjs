/**
 * NHL DAILY FACEOFF LINE SCRAPER
 * 
 * Scrapes real PP1/PP2 assignments from DailyFaceoff.com
 * Updated daily at 9 AM ET, catches line changes immediately
 * 
 * Replaces season-average PP TOI detection with actual current units
 */

import * as cheerio from 'cheerio';

// Team name mapping: NHL API name → Daily Faceoff URL slug
const TEAM_SLUGS = {
  'Anaheim Ducks': 'anaheim-ducks',
  'Boston Bruins': 'boston-bruins',
  'Buffalo Sabres': 'buffalo-sabres',
  'Calgary Flames': 'calgary-flames',
  'Carolina Hurricanes': 'carolina-hurricanes',
  'Chicago Blackhawks': 'chicago-blackhawks',
  'Colorado Avalanche': 'colorado-avalanche',
  'Columbus Blue Jackets': 'columbus-blue-jackets',
  'Dallas Stars': 'dallas-stars',
  'Detroit Red Wings': 'detroit-red-wings',
  'Edmonton Oilers': 'edmonton-oilers',
  'Florida Panthers': 'florida-panthers',
  'Los Angeles Kings': 'los-angeles-kings',
  'Minnesota Wild': 'minnesota-wild',
  'Montréal Canadiens': 'montreal-canadiens',
  'Montreal Canadiens': 'montreal-canadiens',
  'Nashville Predators': 'nashville-predators',
  'New Jersey Devils': 'new-jersey-devils',
  'New York Islanders': 'new-york-islanders',
  'New York Rangers': 'new-york-rangers',
  'Ottawa Senators': 'ottawa-senators',
  'Philadelphia Flyers': 'philadelphia-flyers',
  'Pittsburgh Penguins': 'pittsburgh-penguins',
  'San Jose Sharks': 'san-jose-sharks',
  'Seattle Kraken': 'seattle-kraken',
  'St. Louis Blues': 'st-louis-blues',
  'Tampa Bay Lightning': 'tampa-bay-lightning',
  'Toronto Maple Leafs': 'toronto-maple-leafs',
  'Utah Hockey Club': 'utah-hockey-club',
  'Vancouver Canucks': 'vancouver-canucks',
  'Vegas Golden Knights': 'vegas-golden-knights',
  'Washington Capitals': 'washington-capitals',
  'Winnipeg Jets': 'winnipeg-jets'
};

// Cache for 24 hours (updates daily at 9 AM ET)
const lineCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Normalize player names for matching
 * Handles: Jr./III suffixes, accents, nicknames
 */
function normalizePlayerName(name) {
  return name
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|iii|ii|iv)$/i, '') // Remove suffixes
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c')
    .replace(/[š]/g, 's')
    .replace(/[ž]/g, 'z')
    .trim();
}

/**
 * Fetch and parse line combinations for a team
 */
async function fetchTeamLines(teamName) {
  const slug = TEAM_SLUGS[teamName];
  if (!slug) {
    console.warn(`⚠️ No slug mapping for team: ${teamName}`);
    return null;
  }

  // Check cache first
  const cacheKey = `lines_${slug}`;
  const cached = lineCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const url = `https://www.dailyfaceoff.com/teams/${slug}/line-combinations`;
    console.log(`🔍 Fetching lines: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ Failed to fetch ${teamName} lines: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Find Power Play sections
    const pp1Players = [];
    const pp2Players = [];

    // Strategy: Look for sections labeled "Power Play" then extract player links
    // Daily Faceoff structure: Sections have headings, then player name links
    
    // Find all sections
    $('h4, h3, h2').each((i, elem) => {
      const heading = $(elem).text().trim().toLowerCase();
      
      if (heading.includes('power play') || heading === 'pp1' || heading === 'powerplay 1') {
        // Get next sibling elements until we hit another heading
        let currentElem = $(elem).next();
        let foundPP1 = false;
        let foundPP2 = false;
        
        while (currentElem.length && !currentElem.is('h4, h3, h2')) {
          // Look for player name links within this section
          currentElem.find('a[href*="/players/"]').each((j, link) => {
            const playerName = $(link).text().trim();
            if (playerName && playerName.length > 2) {
              const normalized = normalizePlayerName(playerName);
              
              // Determine if PP1 or PP2 based on context
              const context = currentElem.text().toLowerCase();
              if (context.includes('pp1') || context.includes('powerplay 1') || (!foundPP2 && !foundPP1)) {
                if (!pp1Players.includes(normalized)) {
                  pp1Players.push(normalized);
                  foundPP1 = true;
                }
              } else if (context.includes('pp2') || context.includes('powerplay 2')) {
                if (!pp2Players.includes(normalized)) {
                  pp2Players.push(normalized);
                  foundPP2 = true;
                }
              }
            }
          });
          
          currentElem = currentElem.next();
        }
      }
    });

    // Also try alternative parsing: look for any div/section with PP player groupings
    $('.lineup-player, .player-name, a[href*="/players/"]').each((i, elem) => {
      const playerName = $(elem).text().trim();
      const parentText = $(elem).parent().text().toLowerCase();
      
      if (playerName && playerName.length > 2) {
        const normalized = normalizePlayerName(playerName);
        
        // Check parent context for PP1/PP2
        if (parentText.includes('pp1') || parentText.includes('powerplay 1')) {
          if (!pp1Players.includes(normalized) && pp1Players.length < 5) {
            pp1Players.push(normalized);
          }
        } else if (parentText.includes('pp2') || parentText.includes('powerplay 2')) {
          if (!pp2Players.includes(normalized) && pp2Players.length < 5) {
            pp2Players.push(normalized);
          }
        }
      }
    });

    const result = {
      team: teamName,
      pp1: pp1Players,
      pp2: pp2Players,
      lastUpdated: new Date().toISOString()
    };

    console.log(`✅ ${teamName} lines: PP1=${pp1Players.length}, PP2=${pp2Players.length}`);

    // Cache the result
    lineCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return result;

  } catch (error) {
    console.error(`❌ Error fetching ${teamName} lines:`, error.message);
    return null;
  }
}

/**
 * Determine PP unit for a specific player
 * 
 * @param {string} playerName - Player's full name
 * @param {string} teamName - Team name (NHL API format)
 * @param {object} seasonStats - Fallback season PP stats (ppTimePerGame)
 * @returns {Promise<string>} 'PP1', 'PP2', or 'NONE'
 */
export async function determinePPUnit(playerName, teamName, seasonStats = null) {
  try {
    // Fetch team lines
    const teamLines = await fetchTeamLines(teamName);
    
    if (!teamLines) {
      // Fallback to season stats if scraper fails
      return fallbackPPUnit(seasonStats);
    }

    const normalizedPlayer = normalizePlayerName(playerName);

    // Check PP1
    if (teamLines.pp1.some(p => p.includes(normalizedPlayer) || normalizedPlayer.includes(p))) {
      return 'PP1';
    }

    // Check PP2
    if (teamLines.pp2.some(p => p.includes(normalizedPlayer) || normalizedPlayer.includes(p))) {
      return 'PP2';
    }

    // Not found - could be PP3 or bench
    // Use season stats as tiebreaker
    return fallbackPPUnit(seasonStats);

  } catch (error) {
    console.warn(`⚠️ PP unit detection failed for ${playerName}:`, error.message);
    return fallbackPPUnit(seasonStats);
  }
}

/**
 * Fallback to season PP time averages if scraper fails
 */
function fallbackPPUnit(seasonStats) {
  if (!seasonStats?.ppTimePerGame) return 'NONE';
  
  const ppTime = seasonStats.ppTimePerGame;
  
  if (ppTime > 2.5) return 'PP1';      // >2.5 min → PP1
  if (ppTime > 1.0) return 'PP2';      // 1-2.5 min → PP2
  return 'NONE';                        // <1 min → No PP
}

/**
 * Pre-fetch lines for all teams (run at startup)
 * Warms cache to avoid delays during scanning
 */
export async function warmPPLineCache() {
  console.log('🔥 Warming PP line cache for all teams...');
  
  const teams = Object.keys(TEAM_SLUGS);
  const promises = teams.map(team => fetchTeamLines(team));
  
  const results = await Promise.allSettled(promises);
  const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
  
  console.log(`✅ Cached lines for ${successful}/${teams.length} teams`);
}

/**
 * Get all PP1 players across the league (for debugging)
 */
export async function getAllPP1Players() {
  const allPP1 = [];
  
  for (const teamName of Object.keys(TEAM_SLUGS)) {
    const lines = await fetchTeamLines(teamName);
    if (lines?.pp1) {
      lines.pp1.forEach(player => {
        allPP1.push({ player, team: teamName });
      });
    }
  }
  
  return allPP1;
}

/**
 * Clear cache (for testing/debugging)
 */
export function clearPPLineCache() {
  lineCache.clear();
  console.log('🗑️ PP line cache cleared');
}
