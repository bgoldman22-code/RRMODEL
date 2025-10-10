// netlify/functions/nfl-odds-snapshot/index.mjs
// Scheduled function: Captures odds snapshots with smart frequency
// Pre-game week: Every 2 hours | Game day morning: Every 30min | Game window: Every 5min

import { getStore } from "@netlify/blobs";
import { canonicalBookName, isBookAllowed } from '../_lib/odds-constants.mjs';

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds';

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

export const config = {
  schedule: "*/5 * * * *" // Every 5 minutes (but smart filtering below)
};

export default async (req, context) => {
  console.log("[ODDS_SNAPSHOT] Starting odds snapshot capture...");
  
  const now = new Date();
  const etNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = etNow.getDay(); // 0=Sunday, 1=Monday, 4=Thursday
  const hour = etNow.getHours();
  const minute = etNow.getMinutes();
  
  // SMART FREQUENCY LOGIC:
  // 1. Pre-game week (Tue-Wed, Fri-Sat): Every 2 hours (12 snapshots/day)
  // 2. Game day morning (Thu/Sun/Mon 6AM-5PM): Every 30 minutes (22 snapshots)
  // 3. Game window (Thu/Sun/Mon 6PM-12AM): Every 5 minutes (72 snapshots)
  
  const isGameDay = (day === 4 || day === 0 || day === 1); // Thu/Sun/Mon
  const isGameWindow = isGameDay && hour >= 18; // 6 PM - midnight
  const isGameMorning = isGameDay && hour >= 6 && hour < 18; // 6 AM - 6 PM
  const isPreGameWeek = !isGameDay; // Tue, Wed, Fri, Sat
  
  // Pre-game week: Only run every 2 hours (minute 0 or 30 at even hours)
  if (isPreGameWeek && !(hour % 2 === 0 && minute < 5)) {
    console.log(`[ODDS_SNAPSHOT] Pre-game week - waiting for 2hr interval (Day ${day}, ${hour}:${minute} ET)`);
    return new Response(JSON.stringify({ message: "Pre-game week - 2hr interval" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  // Game day morning: Only run every 30 minutes (minute 0 or 30)
  if (isGameMorning && !(minute < 5 || (minute >= 30 && minute < 35))) {
    console.log(`[ODDS_SNAPSHOT] Game day morning - waiting for 30min interval (${hour}:${minute} ET)`);
    return new Response(JSON.stringify({ message: "Game day morning - 30min interval" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  // Game window: Run every 5 minutes (already at 5min cron)
  if (!isGameWindow && !isGameMorning && !isPreGameWeek) {
    console.log(`[ODDS_SNAPSHOT] Outside active windows (Day ${day}, Hour ${hour} ET) - skipping`);
    return new Response(JSON.stringify({ message: "Outside active windows" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  console.log(`[ODDS_SNAPSHOT] Active window - capturing snapshot (Day ${day}, ${hour}:${minute} ET)`);
  
  // Fetch current odds with deep links
  const oddsUrl = `${ODDS_API_BASE}?` +
    `apiKey=${ODDS_API_KEY}&` +
    `regions=us&` +
    `markets=h2h,spreads,totals&` +
    `oddsFormat=american&` +
    `includeLinks=true`;
  
  const response = await fetch(oddsUrl);
  
  if (!response.ok) {
    throw new Error(`Odds API error: ${response.status}`);
  }
  
  const games = await response.json();
  console.log(`[ODDS_SNAPSHOT] Fetched ${games.length} games from Odds API`);
  
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
        
        // Also update "latest" pointer
        await store.set(`${snapshot.game_id}/latest`, JSON.stringify(snapshot));
      }
    } catch (error) {
      console.error(`[ODDS_SNAPSHOT] Failed to process game ${game.id}:`, error);
    }
  }
  
  console.log(`[ODDS_SNAPSHOT] ✅ Created ${snapshotsCreated} snapshots`);
  
  return new Response(JSON.stringify({
    status: 'success',
    snapshots_created: snapshotsCreated,
    timestamp: timestamp
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
