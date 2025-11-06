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

// Player prop markets - comprehensive coverage for fantasy scoring
const PROP_MARKETS = [
  // Passing
  'player_pass_yds',
  'player_pass_tds',
  'player_pass_completions',
  'player_pass_attempts',
  'player_pass_interceptions',
  'player_pass_longest_completion',
  
  // Rushing
  'player_rush_yds',
  'player_rush_attempts',
  'player_rush_longest',
  
  // Receiving
  'player_rec_yds',
  'player_receptions',
  'player_reception_longest',
  
  // Touchdowns (critical for fantasy!)
  'player_anytime_td',
  'player_first_td',
  'player_last_td',
  
  // Defense/Special Teams (if available)
  'player_tackles_assists',
  'player_sacks',
  'player_interceptions',
  'player_kicking_points'
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
    return cached;
  }

  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      throw new Error('Missing ODDS_API_KEY environment variable');
    }

    const allProps = {};

    // Fetch each prop market separately (TheOddsAPI requires separate calls)
    for (const market of PROP_MARKETS) {
      // Correct endpoint: /sports/{sport}/events with markets parameter
      const url = new URL(`${ODDS_API_BASE}/sports/${SPORT}/events`);
      url.searchParams.set('apiKey', apiKey);
      url.searchParams.set('regions', REGIONS);
      url.searchParams.set('markets', market); // Market as parameter, not in path
      url.searchParams.set('bookmakers', BOOKMAKERS);
      url.searchParams.set('oddsFormat', 'american');

      try {
        console.log(`Fetching ${market}...`);
        const response = await fetch(url.toString());
        
        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`Failed to fetch ${market}: ${response.status} - ${errorText}`);
          continue;
        }

        const events = await response.json();

        // Parse props from each event
        for (const event of events) {
          for (const bookmaker of event.bookmakers || []) {
            for (const propMarket of bookmaker.markets || []) {
              for (const outcome of propMarket.outcomes || []) {
                const playerName = outcome.description; // Player name
                const line = parseFloat(outcome.point || 0);
                const price = outcome.price;

                // Convert American odds to implied probability
                const impliedProb = americanToProb(price);

                // Initialize player props if not exists
                if (!allProps[playerName]) {
                  allProps[playerName] = {
                    name: playerName,
                    team: null, // TheOddsAPI doesn't always provide team
                    props: {}
                  };
                }

                // Store prop based on market type
                if (market === 'player_pass_yds') {
                  allProps[playerName].props.pass_yds = line;
                  allProps[playerName].props.pass_yds_prob = impliedProb;
                }
                if (market === 'player_pass_tds') {
                  allProps[playerName].props.pass_tds = line;
                  allProps[playerName].props.pass_tds_prob = impliedProb;
                }
                if (market === 'player_pass_completions') {
                  allProps[playerName].props.pass_completions = line;
                  allProps[playerName].props.pass_completions_prob = impliedProb;
                }
                if (market === 'player_pass_attempts') {
                  allProps[playerName].props.pass_attempts = line;
                  allProps[playerName].props.pass_attempts_prob = impliedProb;
                }
                if (market === 'player_pass_interceptions') {
                  allProps[playerName].props.interceptions = line;
                  allProps[playerName].props.interceptions_prob = impliedProb;
                }
                if (market === 'player_pass_longest_completion') {
                  allProps[playerName].props.pass_longest = line;
                }
                if (market === 'player_rush_yds') {
                  allProps[playerName].props.rush_yds = line;
                  allProps[playerName].props.rush_yds_prob = impliedProb;
                }
                if (market === 'player_rush_attempts') {
                  allProps[playerName].props.rush_attempts = line;
                  allProps[playerName].props.rush_attempts_prob = impliedProb;
                }
                if (market === 'player_rush_longest') {
                  allProps[playerName].props.rush_longest = line;
                }
                if (market === 'player_rec_yds') {
                  allProps[playerName].props.rec_yds = line;
                  allProps[playerName].props.rec_yds_prob = impliedProb;
                }
                if (market === 'player_receptions') {
                  allProps[playerName].props.receptions = line;
                  allProps[playerName].props.receptions_prob = impliedProb;
                }
                if (market === 'player_reception_longest') {
                  allProps[playerName].props.rec_longest = line;
                }
                if (market === 'player_anytime_td') {
                  allProps[playerName].props.anytime_td_prob = impliedProb;
                  // Estimate 2+ TD probability (heuristic: prob^1.8 * 0.6)
                  allProps[playerName].props.two_plus_td_prob = Math.pow(impliedProb, 1.8) * 0.6;
                }
                if (market === 'player_first_td') {
                  allProps[playerName].props.first_td_prob = impliedProb;
                }
                if (market === 'player_last_td') {
                  allProps[playerName].props.last_td_prob = impliedProb;
                }
                if (market === 'player_tackles_assists') {
                  allProps[playerName].props.tackles_assists = line;
                }
                if (market === 'player_sacks') {
                  allProps[playerName].props.sacks = line;
                }
                if (market === 'player_interceptions') {
                  allProps[playerName].props.def_interceptions = line; // Different from QB INTs
                }
                if (market === 'player_kicking_points') {
                  allProps[playerName].props.kicking_points = line;
                }
              }
            }
          }
        }
      } catch (marketError) {
        console.warn(`Error fetching ${market}:`, marketError.message);
      }
    }

    // Cache for future requests
    await setCachedProps(week, allProps);

    console.log(`Fetched props for ${Object.keys(allProps).length} players for week ${week}`);
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
 * @param {string} team - Team abbreviation
 * @returns {Object|null} Game context or null if not found
 */
export function getGameContext(lines, team) {
  for (const game of lines) {
    if (game.home_team === team || game.away_team === team) {
      return game;
    }
  }
  return null;
}
