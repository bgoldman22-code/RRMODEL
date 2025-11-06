/**
 * TheOddsAPI Client (Serverless)
 * 
 * Fetches NFL game lines and player props from TheOddsAPI.
 * Uses Netlify Blobs for caching (1h TTL by default).
 * 
 * Key Features:
 * - Game lines: spreads, totals, moneylines (DraftKings/FanDuel priority)
 * - Player props: Comprehensive coverage including:
 *   - Passing: yards, TDs, completions, attempts, INTs
 *   - Rushing: yards, attempts, longest
 *   - Receiving: yards, receptions, longest
 *   - Touchdowns: anytime, first, last
 *   - Defense/ST: tackles, sacks, INTs, kicking points
 * - Implied totals: homeIT = (total/2) - (spread/2)
 * - Script lean: ±4.5 threshold for pass-heavy underdogs, run-heavy favorites
 * - Cache with configurable TTL (default 1h)
 * - Graceful handling of 404s (props may not be available until Tuesday/Wednesday)
 * 
 * API Docs: https://the-odds-api.com/liveapi/guides/v4/
 */

import { getCachedLines, setCachedLines, getCachedProps, setCachedProps } from './ff-blobs.mjs';

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'americanfootball_nfl';
const REGIONS = 'us';
const MARKETS_LINES = 'spreads,totals,h2h';
const BOOKMAKERS = 'draftkings,fanduel';

// Player prop markets - using correct TheOddsAPI v4 market names
// NOTE: Must use /events/{eventId}/odds endpoint, not /sports/{sport}/odds
const PROP_MARKETS = [
  // Passing props
  'player_pass_yds',           // Pass Yards (Over/Under)
  'player_pass_tds',            // Pass Touchdowns (Over/Under)
  'player_pass_completions',    // Pass Completions (Over/Under)
  'player_pass_attempts',       // Pass Attempts (Over/Under)
  'player_pass_interceptions',  // Pass Interceptions (Over/Under)
  
  // Rushing props
  'player_rush_yds',            // Rush Yards (Over/Under)
  'player_rush_tds',            // Rush Touchdowns (Over/Under)
  'player_rush_attempts',       // Rush Attempts (Over/Under)
  
  // Receiving props
  'player_reception_yds',       // Reception Yards (Over/Under)
  'player_receptions',          // Receptions (Over/Under)
  'player_reception_tds',       // Reception Touchdowns (Over/Under)
  
  // Touchdown props (Yes/No markets)
  'player_anytime_td',          // Anytime Touchdown Scorer (Yes/No)
  'player_1st_td',              // 1st Touchdown Scorer (Yes/No)
  'player_last_td',             // Last Touchdown Scorer (Yes/No)
  
  // Defensive/ST props
  'player_tackles_assists',     // Tackles + Assists (Over/Under)
  'player_sacks',               // Sacks (Over/Under)
  'player_kicking_points'       // Kicking Points (Over/Under)
];

/**
 * Normalize team names for matching (TheOddsAPI → standard abbrev)
 */
const TEAM_NAME_MAP = {
  'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC', 'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LAR', 'Miami Dolphins': 'MIA', 'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
  'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF', 'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN', 'Washington Commanders': 'WAS'
};

/**
 * Fetch game lines (spreads, totals) for current NFL week
 * @param {number} week - NFL week number (for cache key)
 * @returns {Promise<Array>} Array of game objects with lines
 */
export async function getWeekLines(week) {
  // Check cache first
  const cached = await getCachedLines(week);
  if (cached) {
    return cached;
  }

  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      throw new Error('Missing ODDS_API_KEY environment variable');
    }

    const url = new URL(`${ODDS_API_BASE}/sports/${SPORT}/odds`);
    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('regions', REGIONS);
    url.searchParams.set('markets', MARKETS_LINES);
    url.searchParams.set('bookmakers', BOOKMAKERS);
    url.searchParams.set('oddsFormat', 'american');

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TheOddsAPI error (${response.status}): ${errorText}`);
    }

    const games = await response.json();
    
    // Parse and normalize game lines
    const lines = games.map(game => {
      const homeTeam = TEAM_NAME_MAP[game.home_team] || game.home_team;
      const awayTeam = TEAM_NAME_MAP[game.away_team] || game.away_team;

      // Extract best available lines (prioritize DraftKings, fallback to FanDuel)
      let spread = null, total = null, homeML = null, awayML = null;

      for (const bookmaker of game.bookmakers || []) {
        for (const market of bookmaker.markets || []) {
          if (market.key === 'spreads' && !spread) {
            const homeOutcome = market.outcomes.find(o => o.name === game.home_team);
            if (homeOutcome) {
              spread = parseFloat(homeOutcome.point);
            }
          }
          if (market.key === 'totals' && !total) {
            const overOutcome = market.outcomes.find(o => o.name === 'Over');
            if (overOutcome) {
              total = parseFloat(overOutcome.point);
            }
          }
          if (market.key === 'h2h' && !homeML) {
            const homeOutcome = market.outcomes.find(o => o.name === game.home_team);
            const awayOutcome = market.outcomes.find(o => o.name === game.away_team);
            if (homeOutcome) homeML = homeOutcome.price;
            if (awayOutcome) awayML = awayOutcome.price;
          }
        }
      }

      // Calculate implied totals
      const impliedTotals = spread && total ? {
        homeIT: (total / 2) - (spread / 2),
        awayIT: (total / 2) + (spread / 2)
      } : null;

      return {
        game_id: game.id,
        commence_time: game.commence_time,
        home_team: homeTeam,
        away_team: awayTeam,
        spread,
        total,
        home_ml: homeML,
        away_ml: awayML,
        implied_totals: impliedTotals
      };
    });

    // Cache for future requests
    await setCachedLines(week, lines);

    console.log(`Fetched ${lines.length} game lines for week ${week} from TheOddsAPI`);
    return lines;
  } catch (error) {
    console.error('Error fetching game lines:', error.message);
    throw error;
  }
}

/**
 * Fetch player props for current NFL week
 * @param {number} week - NFL week number (for cache key)
 * @returns {Promise<Object>} Map of player names to prop data
 */
export async function getPlayerProps(week) {
  // Check cache first
  const cached = await getCachedProps(week);
  if (cached) {
    console.log(`Using cached props: ${Object.keys(cached).length} players`);
    return cached;
  }

  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      throw new Error('Missing ODDS_API_KEY environment variable');
    }

    console.log(`Fetching player props for week ${week}...`);

    // Step 1: Get upcoming events to get event IDs
    const eventsUrl = new URL(`${ODDS_API_BASE}/sports/${SPORT}/events`);
    eventsUrl.searchParams.set('apiKey', apiKey);
    
    const eventsResponse = await fetch(eventsUrl.toString());
    if (!eventsResponse.ok) {
      throw new Error(`Failed to fetch events: ${eventsResponse.status}`);
    }
    
    const events = await eventsResponse.json();
    console.log(`Found ${events.length} upcoming NFL games`);
    
    if (events.length === 0) {
      console.warn('No upcoming games found');
      return {};
    }

    const allProps = {};
    let totalApiCalls = 0;
    let successfulCalls = 0;
    let totalPropsFound = 0;

    // Step 2: For each event, fetch player props using /events/{eventId}/odds endpoint
    // NOTE: Player props MUST use per-event endpoint, not the sports/odds endpoint
    for (const event of events) {
      const eventId = event.id;
      
      // Fetch multiple markets in one call (comma-separated)
      const marketsParam = PROP_MARKETS.join(',');
      const url = new URL(`${ODDS_API_BASE}/sports/${SPORT}/events/${eventId}/odds`);
      url.searchParams.set('apiKey', apiKey);
      url.searchParams.set('regions', REGIONS);
      url.searchParams.set('markets', marketsParam);
      url.searchParams.set('bookmakers', BOOKMAKERS);
      url.searchParams.set('oddsFormat', 'american');

      totalApiCalls++;

      try {
        const response = await fetch(url.toString());
        
        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`Failed to fetch props for event ${eventId}: ${response.status}`);
          continue;
        }

        const eventOdds = await response.json();
        
        if (!eventOdds || !eventOdds.bookmakers || eventOdds.bookmakers.length === 0) {
          continue;
        }

        successfulCalls++;
        let propsFoundInEvent = 0;

        // Process each bookmaker's markets from the event
        for (const bookmaker of eventOdds.bookmakers) {
          for (const market of bookmaker.markets) {
            const marketKey = market.key;
            
            // Process each outcome (player prop)
            for (const outcome of market.outcomes || []) {
              const playerName = outcome.description || outcome.name;
              if (!playerName) continue;

              const line = parseFloat(outcome.point || 0);
              const price = outcome.price;
              const impliedProb = americanToProb(price);

              // Initialize player entry if needed
              if (!allProps[playerName]) {
                allProps[playerName] = {
                  name: playerName,
                  team: null,
                  props: {}
                };
              }

              // Map TheOddsAPI market keys to our internal prop names
              if (marketKey === 'player_pass_yds' && !allProps[playerName].props.pass_yds) {
                allProps[playerName].props.pass_yds = line;
                allProps[playerName].props.pass_yds_prob = impliedProb;
                propsFoundInEvent++;
              } else if (marketKey === 'player_pass_tds' && !allProps[playerName].props.pass_tds) {
                allProps[playerName].props.pass_tds = line;
                allProps[playerName].props.pass_tds_prob = impliedProb;
                propsFoundInEvent++;
              } else if (marketKey === 'player_pass_completions' && !allProps[playerName].props.pass_completions) {
                allProps[playerName].props.pass_completions = line;
                propsFoundInEvent++;
              } else if (marketKey === 'player_rush_yds' && !allProps[playerName].props.rush_yds) {
                allProps[playerName].props.rush_yds = line;
                allProps[playerName].props.rush_yds_prob = impliedProb;
                propsFoundInEvent++;
              } else if (marketKey === 'player_reception_yds' && !allProps[playerName].props.rec_yds) {
                allProps[playerName].props.rec_yds = line;
                allProps[playerName].props.rec_yds_prob = impliedProb;
                propsFoundInEvent++;
              } else if (marketKey === 'player_receptions' && !allProps[playerName].props.receptions) {
                allProps[playerName].props.receptions = line;
                allProps[playerName].props.receptions_prob = impliedProb;
                propsFoundInEvent++;
              } else if (marketKey === 'player_anytime_td' && !allProps[playerName].props.anytime_td_prob) {
                allProps[playerName].props.anytime_td_prob = impliedProb;
                allProps[playerName].props.two_plus_td_prob = Math.pow(impliedProb, 1.8) * 0.6;
                propsFoundInEvent++;
              } else if (marketKey === 'player_reception_tds' && !allProps[playerName].props.rec_tds) {
                allProps[playerName].props.rec_tds = line;
                propsFoundInEvent++;
              } else if (marketKey === 'player_rush_tds' && !allProps[playerName].props.rush_tds) {
                allProps[playerName].props.rush_tds = line;
                propsFoundInEvent++;
              }
            }
          }
        }
        
        if (propsFoundInEvent > 0) {
          console.log(`  Event ${eventId} (${eventOdds.away_team} @ ${eventOdds.home_team}): ${propsFoundInEvent} props`);
          totalPropsFound += propsFoundInEvent;
        }

      } catch (error) {
        console.error(`Error fetching props for event ${eventId}:`, error.message);
        continue;
      }
    }

    const totalPlayers = Object.keys(allProps).length;
    console.log(`\nProps Summary for Week ${week}:`);
    console.log(`  - API calls: ${successfulCalls}/${totalApiCalls} successful events`);
    console.log(`  - Total props found: ${totalPropsFound}`);
    console.log(`  - Total players with props: ${totalPlayers}`);

    // Only cache if we got some props (don't cache empty results)
    if (totalPlayers > 0) {
      await setCachedProps(week, allProps);
      console.log(`  - Cached props for future requests`);
    } else {
      console.warn(`  - NOT caching (no props available yet)`);
    }

    return allProps;
  } catch (error) {
    console.error('Error fetching player props:', error.message);
    throw error;
  }
}

/**
 * Convert American odds to implied probability
 * @param {number} americanOdds - American odds (e.g., -110, +150)
 * @returns {number} Implied probability (0-1)
 */
function americanToProb(americanOdds) {
  if (americanOdds < 0) {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  } else {
    return 100 / (americanOdds + 100);
  }
}

/**
 * Calculate game script lean (pass-heavy vs run-heavy)
 * @param {Object} context - Game context with spread, impliedTotal
 * @param {string} team - Team abbreviation
 * @param {number} threshold - Spread threshold for script lean (default 4.5)
 * @returns {Object} { passLean, runLean } scores
 */
export function calculateScriptLean(context, team, threshold = 4.5) {
  const { spread, implied_totals } = context;
  
  if (!spread || !implied_totals) {
    return { passLean: 0, runLean: 0 };
  }

  const isHome = team === context.home_team;
  const teamSpread = isHome ? spread : -spread;
  
  // Pass-heavy: Underdogs by ≥4.5
  const passLean = teamSpread >= threshold ? 1 : 0;
  
  // Run-heavy: Favorites by ≥4.5
  const runLean = teamSpread <= -threshold ? 1 : 0;

  return { passLean, runLean };
}

/**
 * Get game context for a specific team
 * @param {Array} lines - Game lines from getWeekLines
 * @param {string} team - Team abbreviation (case-insensitive)
 * @returns {Object|null} Game context or null if not found
 */
export function getGameContext(lines, team) {
  const teamUpper = team?.toUpperCase();
  for (const game of lines) {
    if (game.home_team?.toUpperCase() === teamUpper || game.away_team?.toUpperCase() === teamUpper) {
      return game;
    }
  }
  return null;
}
