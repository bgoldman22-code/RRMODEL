// netlify/functions/nfl-odds-snapshot/index.mjs
// Scheduled function: Captures odds snapshots every 5 minutes during game windows
// Stores time-series data for line movement analysis and CLV tracking

import { getStore } from "@netlify/blobs";
import { canonicalBookName, isBookAllowed } from '../_lib/odds-constants.mjs';

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds';

export const handler = async (event, context) => {
  console.log('[SNAPSHOT] Starting odds snapshot capture...');
  
  try {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const hourUTC = now.getUTCHours();
    const hourET = hourUTC - 4; // Simplified TZ conversion
    
    // Only run during game windows
    const isThursday = dayOfWeek === 4 && hourET >= 18 && hourET <= 23;
    const isSunday = dayOfWeek === 0 && hourET >= 11 && hourET <= 23;
    const isMonday = dayOfWeek === 1 && hourET >= 18 && hourET <= 23;
    
    if (!isThursday && !isSunday && !isMonday) {
      console.log('[SNAPSHOT] Outside game windows, skipping');
      return {
        statusCode: 200,
        body: JSON.stringify({ status: 'skipped', reason: 'Outside game windows' })
      };
    }
    
    // Fetch current odds with deep links
    const oddsUrl = `${ODDS_API_BASE}?` +
      `apiKey=${ODDS_API_KEY}&` +
      `regions=us&` +
      `markets=h2h,spreads,totals&` +
      `oddsFormat=american&` +
      `includeLinks=true`; // Enable deep links
    
    const response = await fetch(oddsUrl);
    
    if (!response.ok) {
      throw new Error(`Odds API error: ${response.status}`);
    }
    
    const games = await response.json();
    
    console.log(`[SNAPSHOT] Fetched ${games.length} games from Odds API`);
    
    // Process and store snapshots
    const store = getStore("odds-timeseries");
    const timestamp = now.toISOString();
    let snapshotsCreated = 0;
    
    for (const game of games) {
      try {
        const snapshot = createOddsSnapshot(game, timestamp);
        if (snapshot) {
          const key = `${snapshot.game_id}/${timestamp}`;
          await store.set(key, JSON.stringify(snapshot));
          snapshotsCreated++;
          
          // Also update "latest" pointer for fast access
          await store.set(`${snapshot.game_id}/latest`, JSON.stringify(snapshot));
        }
      } catch (error) {
        console.error(`[SNAPSHOT] Failed to process game ${game.id}:`, error);
      }
    }
    
    console.log(`[SNAPSHOT] ✅ Created ${snapshotsCreated} snapshots`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'success',
        snapshots_created: snapshotsCreated,
        timestamp: timestamp
      })
    };
    
  } catch (error) {
    console.error('[SNAPSHOT] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        status: 'error',
        message: error.message
      })
    };
  }
};

/**
 * Create odds snapshot from Odds API game data
 */
function createOddsSnapshot(game, timestamp) {
  if (!game.bookmakers || game.bookmakers.length === 0) {
    return null;
  }
  
  const gameId = `${game.away_team}@${game.home_team}-${game.commence_time.slice(0, 10)}`;
  
  const snapshot = {
    game_id: gameId,
    timestamp: timestamp,
    commence_time: game.commence_time,
    home_team: game.home_team,
    away_team: game.away_team,
    books: {},
    links: {}
  };
  
  // Extract odds from each bookmaker (allowed books only)
  for (const book of game.bookmakers) {
    const rawBookName = book.title;
    const bookName = canonicalBookName(rawBookName);
    
    // Filter to allowed books only
    if (!isBookAllowed(bookName)) {
      continue;
    }
    
    const bookData = {};
    const bookLinks = {};
    
    // Extract moneyline (h2h)
    const h2hMarket = book.markets?.find(m => m.key === 'h2h');
    if (h2hMarket) {
      const homeOutcome = h2hMarket.outcomes.find(o => o.name === game.home_team);
      const awayOutcome = h2hMarket.outcomes.find(o => o.name === game.away_team);
      
      if (homeOutcome && awayOutcome) {
        const homeImplied = americanToImplied(homeOutcome.price);
        const awayImplied = americanToImplied(awayOutcome.price);
        
        bookData.moneyline = {
          home: homeOutcome.price,
          away: awayOutcome.price,
          home_implied: homeImplied,
          away_implied: awayImplied
        };
        
        // Store deep links if available
        if (homeOutcome.link) bookLinks.moneyline_home = homeOutcome.link;
        if (awayOutcome.link) bookLinks.moneyline_away = awayOutcome.link;
      }
    }
    
    // Extract spreads
    const spreadMarket = book.markets?.find(m => m.key === 'spreads');
    if (spreadMarket) {
      const homeOutcome = spreadMarket.outcomes.find(o => o.name === game.home_team);
      const awayOutcome = spreadMarket.outcomes.find(o => o.name === game.away_team);
      
      if (homeOutcome && awayOutcome) {
        bookData.spread = {
          home_line: homeOutcome.point,
          home_price: homeOutcome.price,
          away_line: awayOutcome.point,
          away_price: awayOutcome.price,
          home_implied: americanToImplied(homeOutcome.price),
          away_implied: americanToImplied(awayOutcome.price)
        };
        
        if (homeOutcome.link) bookLinks.spread_home = homeOutcome.link;
        if (awayOutcome.link) bookLinks.spread_away = awayOutcome.link;
      }
    }
    
    // Extract totals
    const totalMarket = book.markets?.find(m => m.key === 'totals');
    if (totalMarket) {
      const overOutcome = totalMarket.outcomes.find(o => o.name === 'Over');
      const underOutcome = totalMarket.outcomes.find(o => o.name === 'Under');
      
      if (overOutcome && underOutcome) {
        bookData.total = {
          over_line: overOutcome.point,
          over_price: overOutcome.price,
          under_price: underOutcome.price,
          over_implied: americanToImplied(overOutcome.price),
          under_implied: americanToImplied(underOutcome.price)
        };
        
        if (overOutcome.link) bookLinks.total_over = overOutcome.link;
        if (underOutcome.link) bookLinks.total_under = underOutcome.link;
      }
    }
    
    if (Object.keys(bookData).length > 0) {
      snapshot.books[bookName] = bookData;
    }
    
    if (Object.keys(bookLinks).length > 0) {
      snapshot.links[bookName] = bookLinks;
    }
  }
  
  return snapshot;
}

/**
 * Convert American odds to implied probability
 */
function americanToImplied(american) {
  if (american > 0) {
    return 100 / (american + 100);
  } else {
    return Math.abs(american) / (Math.abs(american) + 100);
  }
}

// Schedule: Every 5 minutes
export const config = {
  schedule: "*/5 * * * *"
};
