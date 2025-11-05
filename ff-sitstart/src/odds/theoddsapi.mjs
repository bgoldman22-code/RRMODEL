import axios from 'axios';
import { cache } from '../util/cache.mjs';
import { logger } from '../util/logger.mjs';
import { normTeam, probFromAmerican } from './normalize.mjs';

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'americanfootball_nfl';

/**
 * Get week lines (spreads, totals, moneylines) for NFL games
 * 
 * @param {number} week - NFL week number
 * @returns {Promise<Array>} - Array of game lines
 */
export async function getWeekLines(week) {
  const cacheKey = `odds_lines_week${week}`;
  
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.debug(`Using cached lines for week ${week}`);
    return cached;
  }
  
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error('ODDS_API_KEY not found in environment');
  }
  
  try {
    const url = `${ODDS_API_BASE}/sports/${SPORT}/odds/`;
    const response = await axios.get(url, {
      params: {
        apiKey,
        regions: 'us',
        markets: 'spreads,totals,h2h',
        oddsFormat: 'american',
        dateFormat: 'iso'
      }
    });
    
    const games = response.data || [];
    logger.debug(`Fetched ${games.length} games from TheOddsAPI`);
    
    const lines = games.map(game => {
      const homeTeam = normTeam(game.home_team);
      const awayTeam = normTeam(game.away_team);
      
      // Find DraftKings or FanDuel bookmaker
      const bookmaker = game.bookmakers?.find(b => 
        b.key === 'draftkings' || b.key === 'fanduel'
      ) || game.bookmakers?.[0];
      
      if (!bookmaker) {
        logger.warn(`No bookmaker data for ${awayTeam} @ ${homeTeam}`);
        return null;
      }
      
      // Extract spreads
      const spreadMarket = bookmaker.markets?.find(m => m.key === 'spreads');
      const homeSpreadOutcome = spreadMarket?.outcomes?.find(o => o.name === game.home_team);
      const awaySpreadOutcome = spreadMarket?.outcomes?.find(o => o.name === game.away_team);
      
      // Extract totals
      const totalsMarket = bookmaker.markets?.find(m => m.key === 'totals');
      const overOutcome = totalsMarket?.outcomes?.find(o => o.name === 'Over');
      const underOutcome = totalsMarket?.outcomes?.find(o => o.name === 'Under');
      
      // Extract moneylines
      const h2hMarket = bookmaker.markets?.find(m => m.key === 'h2h');
      const homeMLOutcome = h2hMarket?.outcomes?.find(o => o.name === game.home_team);
      const awayMLOutcome = h2hMarket?.outcomes?.find(o => o.name === game.away_team);
      
      return {
        id: game.id,
        homeTeam,
        awayTeam,
        kickoff: game.commence_time,
        spread: parseFloat(homeSpreadOutcome?.point) || 0,
        spreadPrice: homeSpreadOutcome?.price || -110,
        total: parseFloat(overOutcome?.point || underOutcome?.point) || 0,
        overPrice: overOutcome?.price || -110,
        underPrice: underOutcome?.price || -110,
        homeML: homeMLOutcome?.price || 0,
        awayML: awayMLOutcome?.price || 0,
        bookmaker: bookmaker.key
      };
    }).filter(g => g !== null);
    
    // Cache for 1 hour
    cache.set(cacheKey, lines);
    
    return lines;
  } catch (error) {
    logger.error(`Failed to fetch odds: ${error.message}`);
    throw error;
  }
}

/**
 * Get player props for NFL games
 * 
 * @param {number} week - NFL week number
 * @returns {Promise<Object>} - Map of playerKey -> props
 */
export async function getPlayerProps(week) {
  const cacheKey = `odds_props_week${week}`;
  
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.debug(`Using cached props for week ${week}`);
    return cached;
  }
  
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error('ODDS_API_KEY not found in environment');
  }
  
  // First get all games
  const lines = await getWeekLines(week);
  
  const propsMap = {};
  let totalPropsFound = 0;
  
  // For each game, fetch player props
  for (const game of lines) {
    try {
      const url = `${ODDS_API_BASE}/sports/${SPORT}/events/${game.id}/odds/`;
      const response = await axios.get(url, {
        params: {
          apiKey,
          regions: 'us',
          markets: 'player_pass_yds,player_pass_tds,player_rush_yds,player_rush_tds,player_receptions,player_reception_yds,player_anytime_td,player_first_td,player_last_td',
          oddsFormat: 'american',
          dateFormat: 'iso'
        }
      });
      
      const bookmakers = response.data?.bookmakers || [];
      const bookmaker = bookmakers.find(b => b.key === 'draftkings' || b.key === 'fanduel') || bookmakers[0];
      
      if (!bookmaker) continue;
      
      // Process each market
      for (const market of bookmaker.markets || []) {
        for (const outcome of market.outcomes || []) {
          const playerName = outcome.description; // e.g., "Patrick Mahomes"
          const playerKey = `${playerName}_${game.homeTeam === normTeam(outcome.description) ? game.homeTeam : game.awayTeam}`;
          
          if (!propsMap[playerKey]) {
            propsMap[playerKey] = {
              name: playerName,
              team: null, // Will be set when we match to roster
              props: {}
            };
          }
          
          // Map market to prop type
          const propType = market.key.replace('player_', '');
          const line = parseFloat(outcome.point);
          const price = outcome.price;
          
          // Store both over/under for most props
          if (outcome.name === 'Over') {
            propsMap[playerKey].props[propType] = line;
            propsMap[playerKey].props[`${propType}_over_price`] = price;
          } else if (outcome.name === 'Under') {
            propsMap[playerKey].props[`${propType}_under_price`] = price;
          }
          
          // For TD props, we just need the Yes price
          if (market.key === 'player_anytime_td' && outcome.name === 'Yes') {
            propsMap[playerKey].props.anytime_td_price = price;
            propsMap[playerKey].props.anytime_td_prob = probFromAmerican(price);
          }
          
          // NEW: 2+ TD prop
          if (market.key === 'player_first_td' || market.key === 'player_last_td') {
            // Some books offer "2+ TDs" as separate market, but not always available
            // We'll estimate from anytime TD if needed
          }
          
          totalPropsFound++;
        }
      }
      
      // Rate limit: small delay between game requests
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      logger.warn(`Failed to fetch props for game ${game.id}: ${error.message}`);
    }
  }
  
  logger.debug(`Fetched ${totalPropsFound} props for ${Object.keys(propsMap).length} players`);
  
  // Cache for 1 hour
  cache.set(cacheKey, propsMap);
  
  return propsMap;
}

/**
 * Estimate 2+ TD probability from anytime TD probability
 * Uses simple heuristic: if P(any TD) = p, then P(2+ TD) ≈ p² * 0.5
 * 
 * @param {number} anytimeTDProb - Probability of scoring any TD
 * @returns {number} - Estimated probability of 2+ TDs
 */
export function estimate2PlusTDProb(anytimeTDProb) {
  if (!anytimeTDProb || anytimeTDProb <= 0) return 0;
  
  // Heuristic: rough approximation based on empirical data
  // High-ceiling RBs: if P(any) = 0.6, P(2+) ≈ 0.2
  // Mid-tier RBs: if P(any) = 0.4, P(2+) ≈ 0.08
  return Math.pow(anytimeTDProb, 1.8) * 0.6;
}
