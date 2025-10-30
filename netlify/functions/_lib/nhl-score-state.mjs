/**
 * NHL SCORE STATE ADJUSTMENT
 * 
 * Teams that are likely to trail shoot MORE (chasing the game)
 * Teams that are likely to lead shoot LESS (protecting the lead)
 * 
 * Based on moneyline odds, we estimate game script and adjust SOG projections
 * 
 * Research shows:
 * - Heavy underdogs: +10-15% shots (trailing most of game)
 * - Slight underdogs: +3-7% shots (competitive, trailing some)
 * - Even games: No adjustment
 * - Slight favorites: -2-5% shots (leading some, defensive)
 * - Heavy favorites: -5-10% shots (leading most of game, coast)
 */

import fetch from 'node-fetch';

/**
 * Convert American odds to win probability
 */
function oddsToWinProbability(americanOdds) {
  if (!americanOdds || americanOdds === 0) return 0.5; // Even if no odds
  
  if (americanOdds < 0) {
    // Favorite: -150 = 150/(150+100) = 60%
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  } else {
    // Underdog: +150 = 100/(150+100) = 40%
    return 100 / (americanOdds + 100);
  }
}

/**
 * Calculate score state adjustment based on win probability
 * 
 * Returns multiplier for SOG projection:
 * - > 1.0 = team likely to trail, shoots MORE
 * - < 1.0 = team likely to lead, shoots LESS
 * - 1.0 = even game, no adjustment
 */
export function calculateScoreStateAdjustment(teamWinProb) {
  if (!teamWinProb || teamWinProb < 0 || teamWinProb > 1) {
    return 1.0; // No adjustment if invalid
  }
  
  // Heavy underdog (< 35% win probability)
  // Likely trailing most of game → more desperate shooting
  if (teamWinProb < 0.35) {
    return 1.12; // +12% shots
  }
  
  // Moderate underdog (35-42% win probability)
  // Competitive but likely down → increased aggression
  if (teamWinProb < 0.42) {
    return 1.07; // +7% shots
  }
  
  // Slight underdog (42-48% win probability)
  // Close game, slightly chasing
  if (teamWinProb < 0.48) {
    return 1.03; // +3% shots
  }
  
  // Even game (48-52% win probability)
  // No expected score effect
  if (teamWinProb <= 0.52) {
    return 1.0; // No adjustment
  }
  
  // Slight favorite (52-58% win probability)
  // Close game, slightly protecting
  if (teamWinProb < 0.58) {
    return 0.98; // -2% shots
  }
  
  // Moderate favorite (58-65% win probability)
  // Likely leading some → defensive posture
  if (teamWinProb < 0.65) {
    return 0.95; // -5% shots
  }
  
  // Heavy favorite (> 65% win probability)
  // Leading most of game → coasting, protecting lead
  return 0.92; // -8% shots
}

/**
 * Get moneyline odds from The Odds API
 * Returns win probability for the team
 */
export async function getTeamWinProbability(team, opponent) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ ODDS_API_KEY not found, skipping score state adjustment');
      return null;
    }
    
    // Fetch NHL moneylines from The Odds API
    const url = `https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Odds API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Find game with this team
    const game = data.find(g => 
      g.home_team === team || g.away_team === team
    );
    
    if (!game) {
      console.warn(`⚠️ No odds found for ${team} vs ${opponent}`);
      return null;
    }
    
    // Get moneyline from first bookmaker (usually consensus)
    const bookmaker = game.bookmakers?.[0];
    if (!bookmaker) return null;
    
    const h2hMarket = bookmaker.markets?.find(m => m.key === 'h2h');
    if (!h2hMarket) return null;
    
    // Find team's moneyline
    const teamOutcome = h2hMarket.outcomes?.find(o => o.name === team);
    if (!teamOutcome) return null;
    
    const moneyline = teamOutcome.price;
    const winProb = oddsToWinProbability(moneyline);
    
    console.log(`💰 ${team} moneyline: ${moneyline > 0 ? '+' : ''}${moneyline} → ${(winProb * 100).toFixed(1)}% win prob`);
    
    return winProb;
    
  } catch (error) {
    console.error(`❌ Failed to fetch odds for ${team}:`, error.message);
    return null;
  }
}

/**
 * Get win probability from MoneyPuck pre-game model (alternative source)
 * MoneyPuck provides free pre-game win probabilities updated daily
 */
export async function getMoneyPuckWinProbability(team, opponent, gameDate) {
  try {
    // MoneyPuck provides game predictions in CSV format
    // URL: https://moneypuck.com/moneypuck/simulations/simulations_recent.csv
    const url = 'https://moneypuck.com/moneypuck/simulations/simulations_recent.csv';
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`MoneyPuck returned ${response.status}`);
    }
    
    const csv = await response.text();
    const lines = csv.split('\n');
    
    // Parse CSV header
    const headers = lines[0].split(',');
    const teamIdx = headers.indexOf('team');
    const oppIdx = headers.indexOf('opponent');
    const winProbIdx = headers.indexOf('winProb');
    
    // Find matching game
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values[teamIdx] === team && values[oppIdx] === opponent) {
        const winProb = parseFloat(values[winProbIdx]);
        console.log(`💰 ${team} vs ${opponent} - MoneyPuck win prob: ${(winProb * 100).toFixed(1)}%`);
        return winProb;
      }
    }
    
    console.warn(`⚠️ No MoneyPuck prediction found for ${team} vs ${opponent}`);
    return null;
    
  } catch (error) {
    console.error(`❌ Failed to fetch MoneyPuck odds:`, error.message);
    return null;
  }
}

/**
 * Main function: Get score state adjustment for a player
 * Tries multiple sources in order:
 * 1. The Odds API (real-time, requires API key)
 * 2. MoneyPuck (free, updated daily)
 * 3. No adjustment (if all fail)
 */
export async function getScoreStateAdjustment(team, opponent, useCache = true) {
  // Try The Odds API first (more up-to-date)
  let winProb = await getTeamWinProbability(team, opponent);
  
  // Fallback to MoneyPuck if Odds API fails
  if (winProb === null) {
    winProb = await getMoneyPuckWinProbability(team, opponent);
  }
  
  // If still no data, return no adjustment
  if (winProb === null) {
    console.warn(`⚠️ No score state data for ${team}, using 1.0x adjustment`);
    return 1.0;
  }
  
  const adjustment = calculateScoreStateAdjustment(winProb);
  
  console.log(`📊 Score state: ${team} (${(winProb * 100).toFixed(1)}% win prob) → ${adjustment.toFixed(3)}x adjustment`);
  
  return adjustment;
}

/**
 * Cache score state adjustments for a game day
 * Prevents repeated API calls for same matchup
 */
const scoreStateCache = new Map();

export async function getCachedScoreStateAdjustment(team, opponent) {
  const cacheKey = `${team}_${opponent}`;
  
  if (scoreStateCache.has(cacheKey)) {
    console.log(`✅ Using cached score state for ${team} vs ${opponent}`);
    return scoreStateCache.get(cacheKey);
  }
  
  const adjustment = await getScoreStateAdjustment(team, opponent);
  scoreStateCache.set(cacheKey, adjustment);
  
  return adjustment;
}

/**
 * Clear cache (call once per day)
 */
export function clearScoreStateCache() {
  scoreStateCache.clear();
  console.log('🗑️ Cleared score state cache');
}
