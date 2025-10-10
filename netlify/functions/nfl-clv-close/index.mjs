// netlify/functions/nfl-clv-close/index.mjs
// Scheduled function to close out CLV entries at kickoff
// Runs every 5 minutes, checks for kicked-off games, records closing lines

import { getStore } from "@netlify/blobs";

export const config = {
  schedule: "*/5 * * * *" // Every 5 minutes
};

export default async (req, context) => {
  console.log("[CLV_CLOSE] Starting CLV closing process...");
  
  const clvStore = getStore("clv-tracking");
  const oddsStore = getStore("odds-timeseries");
  
  try {
    // Get all open CLV entries (those without closing price)
    const { blobs } = await clvStore.list();
    const openEntries = [];
    
    for (const blob of blobs) {
      const entry = await clvStore.get(blob.key, { type: 'json' });
      if (entry.closing_price === null) {
        openEntries.push({ key: blob.key, entry });
      }
    }
    
    if (openEntries.length === 0) {
      console.log("[CLV_CLOSE] No open entries to close");
      return new Response(JSON.stringify({ message: "No entries to close" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    console.log(`[CLV_CLOSE] Found ${openEntries.length} open entries`);
    
    let closedCount = 0;
    
    // Check each entry
    for (const { key, entry } of openEntries) {
      const { game_id, market, side } = entry;
      
      // Get latest snapshot for this game
      const latestSnapshot = await getLatestSnapshot(oddsStore, game_id);
      
      if (!latestSnapshot) {
        console.log(`[CLV_CLOSE] No snapshot found for ${game_id}`);
        continue;
      }
      
      // Check if game has started (compare kickoff time to now)
      const kickoffTime = new Date(latestSnapshot.commence_time);
      const now = new Date();
      
      if (now < kickoffTime) {
        // Game hasn't started yet
        continue;
      }
      
      console.log(`[CLV_CLOSE] Game ${game_id} has kicked off, closing CLV entry ${key}`);
      
      // Get closing line (last snapshot before kickoff)
      const closingPrice = extractClosingPrice(latestSnapshot, market, side);
      
      if (!closingPrice) {
        console.log(`[CLV_CLOSE] No closing price found for ${market}/${side}`);
        continue;
      }
      
      const closingImplied = americanToImplied(closingPrice);
      const clv_bps = Math.round((entry.entry_implied - closingImplied) * 10000);
      
      // Update entry with closing data
      entry.closing_price = closingPrice;
      entry.closing_implied = closingImplied;
      entry.close_timestamp = now.toISOString();
      entry.clv_bps = clv_bps;
      
      await clvStore.set(key, JSON.stringify(entry));
      
      console.log(`[CLV_CLOSE] Closed ${key}: ${entry.entry_price} → ${closingPrice} = ${clv_bps} bps CLV`);
      closedCount++;
    }
    
    console.log(`[CLV_CLOSE] Closed ${closedCount} entries`);
    
    return new Response(JSON.stringify({ 
      message: `Closed ${closedCount} CLV entries`,
      closed_count: closedCount
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (error) {
    console.error("[CLV_CLOSE] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

/**
 * Get latest snapshot for a game
 */
async function getLatestSnapshot(store, gameId) {
  try {
    const latest = await store.get(`${gameId}/latest`, { type: 'json' });
    return latest;
  } catch (error) {
    console.error(`[CLV_CLOSE] Error getting latest snapshot for ${gameId}:`, error);
    return null;
  }
}

/**
 * Extract closing price from snapshot
 */
function extractClosingPrice(snapshot, market, side) {
  // Average across all books (same logic as movement metrics)
  const prices = [];
  
  for (const [bookName, bookData] of Object.entries(snapshot.books || {})) {
    let price = null;
    
    if (market === 'moneyline') {
      price = side === 'home' ? bookData.moneyline?.home_price : bookData.moneyline?.away_price;
    } else if (market === 'spread') {
      price = side === 'home' ? bookData.spread?.home_price : bookData.spread?.away_price;
    } else if (market === 'total') {
      price = side === 'over' ? bookData.total?.over_price : bookData.total?.under_price;
    }
    
    if (price !== null && price !== undefined) {
      prices.push(price);
    }
  }
  
  if (prices.length === 0) return null;
  
  // Return average (in practice, might want best price instead)
  return Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
}

/**
 * Convert American odds to implied probability
 */
function americanToImplied(american) {
  const num = parseFloat(american);
  if (num >= 0) {
    return 100 / (num + 100);
  } else {
    return Math.abs(num) / (Math.abs(num) + 100);
  }
}
