// netlify/functions/nfl-clv-track/index.mjs
// CLV (Closing Line Value) tracking endpoint
// Records bet entries and computes CLV at game close

import { getStore } from "@netlify/blobs";

/**
 * POST: Log a bet entry
 * Body: { game_id, market, side, entry_price, entry_timestamp, pick_id, units }
 * 
 * GET: Get CLV statistics
 * Query: ?market=moneyline&weeks=6
 */
export default async (req, context) => {
  const store = getStore("clv-tracking");
  
  if (req.method === "POST") {
    return handleLogEntry(req, store);
  } else if (req.method === "GET") {
    return handleGetStats(req, store);
  } else {
    return new Response("Method not allowed", { status: 405 });
  }
};

/**
 * Log a bet entry for CLV tracking
 */
async function handleLogEntry(req, store) {
  try {
    const body = await req.json();
    const { game_id, market, side, entry_price, entry_timestamp, pick_id, units } = body;
    
    if (!game_id || !market || !side || !entry_price) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Convert entry_price (American odds) to implied probability
    const entry_implied = americanToImplied(entry_price);
    
    // Create entry record
    const entry = {
      game_id,
      market,
      side,
      entry_price,
      entry_implied,
      entry_timestamp: entry_timestamp || new Date().toISOString(),
      pick_id: pick_id || `${game_id}_${market}_${side}`,
      units: units || 0,
      
      // To be filled at close
      closing_price: null,
      closing_implied: null,
      close_timestamp: null,
      clv_bps: null // (entry_implied - closing_implied) * 10000
    };
    
    // Store with unique key
    const key = `${entry.pick_id}_${Date.now()}`;
    await store.set(key, JSON.stringify(entry));
    
    console.log(`[CLV] Logged entry: ${key} @ ${entry_price} (${(entry_implied * 100).toFixed(2)}%)`);
    
    return new Response(JSON.stringify({ 
      success: true, 
      key,
      entry_implied: entry_implied.toFixed(4)
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (error) {
    console.error("[CLV] Error logging entry:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

/**
 * Get CLV statistics
 */
async function handleGetStats(req, store) {
  try {
    const url = new URL(req.url);
    const market = url.searchParams.get("market") || "all";
    const weeks = parseInt(url.searchParams.get("weeks") || "6", 10);
    
    const cutoff = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
    
    // Fetch all entries
    const { blobs } = await store.list();
    const entries = [];
    
    for (const blob of blobs) {
      const entry = await store.get(blob.key, { type: 'json' });
      const entryTime = new Date(entry.entry_timestamp);
      
      if (entryTime >= cutoff) {
        if (market === "all" || entry.market === market) {
          entries.push(entry);
        }
      }
    }
    
    // Separate closed vs open
    const closedBets = entries.filter(e => e.clv_bps !== null);
    const openBets = entries.filter(e => e.clv_bps === null);
    
    // Compute stats
    const stats = {
      market,
      weeks,
      total_bets: entries.length,
      closed_bets: closedBets.length,
      open_bets: openBets.length,
      
      avg_clv_bps: closedBets.length > 0 
        ? closedBets.reduce((sum, b) => sum + b.clv_bps, 0) / closedBets.length 
        : 0,
      
      positive_clv_rate: closedBets.length > 0
        ? closedBets.filter(b => b.clv_bps > 0).length / closedBets.length
        : 0,
      
      median_clv_bps: closedBets.length > 0 
        ? getMedian(closedBets.map(b => b.clv_bps))
        : 0,
      
      // Breakdown by market
      by_market: getMarketBreakdown(closedBets)
    };
    
    return new Response(JSON.stringify(stats, null, 2), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300" // 5min cache
      }
    });
    
  } catch (error) {
    console.error("[CLV] Error getting stats:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

/**
 * Compute median
 */
function getMedian(values) {
  if (values.length === 0) return 0;
  
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    return sorted[mid];
  }
}

/**
 * Breakdown stats by market
 */
function getMarketBreakdown(closedBets) {
  const breakdown = {};
  
  for (const bet of closedBets) {
    if (!breakdown[bet.market]) {
      breakdown[bet.market] = {
        count: 0,
        avg_clv_bps: 0,
        positive_rate: 0,
        total_clv: 0,
        positive_count: 0
      };
    }
    
    const m = breakdown[bet.market];
    m.count++;
    m.total_clv += bet.clv_bps;
    if (bet.clv_bps > 0) m.positive_count++;
  }
  
  // Compute averages
  for (const market of Object.keys(breakdown)) {
    const m = breakdown[market];
    m.avg_clv_bps = m.total_clv / m.count;
    m.positive_rate = m.positive_count / m.count;
    delete m.total_clv;
    delete m.positive_count;
  }
  
  return breakdown;
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
