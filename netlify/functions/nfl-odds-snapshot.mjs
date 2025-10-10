// netlify/functions/nfl-odds-snapshot.mjs
// Scheduled function to capture odds snapshots for line movement tracking
// Runs every 5 minutes during game weeks

import { getStore } from "@netlify/blobs";

export default async (request, context) => {
  try {
    const baseUrl = process.env.URL || 'https://bgroundrobin.com';
    
    // Fetch current odds from The Odds API
    const oddsRes = await fetch(`${baseUrl}/.netlify/functions/nfl-odds-get?regions=us&markets=h2h,spreads,totals`);
    
    if (!oddsRes.ok) {
      throw new Error(`Odds fetch failed: ${oddsRes.status}`);
    }
    
    const oddsData = await oddsRes.json();
    const games = oddsData.games || oddsData || [];
    
    if (games.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        message: 'No games to track',
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Store snapshots
    const store = getStore("odds-timeseries");
    const timestamp = new Date().toISOString();
    const snapshotsBySaved = [];
    
    for (const game of games) {
      const gameId = game.id || `${game.away_team}_${game.home_team}`;
      
      // Create snapshot object
      const snapshot = {
        game_id: gameId,
        timestamp: timestamp,
        home_team: game.home_team,
        away_team: game.away_team,
        bookmakers: (game.bookmakers || []).map(book => ({
          key: book.key,
          title: book.title,
          markets: book.markets.map(market => ({
            key: market.key,
            outcomes: market.outcomes.map(outcome => ({
              name: outcome.name,
              price: outcome.price,
              point: outcome.point
            }))
          }))
        }))
      };
      
      // Save to timeseries store (key format: gameId/timestamp)
      const snapshotKey = `${gameId}/${Date.now()}`;
      await store.set(snapshotKey, JSON.stringify(snapshot), {
        metadata: {
          game_id: gameId,
          timestamp: timestamp
        }
      });
      
      snapshotsBySaved.push(gameId);
    }
    
    // Cleanup old snapshots (older than 48 hours)
    await cleanupOldSnapshots(store);
    
    return new Response(JSON.stringify({
      ok: true,
      message: 'Odds snapshots captured',
      timestamp: timestamp,
      games_tracked: snapshotsBySaved.length,
      game_ids: snapshotsBySaved
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[ODDS_SNAPSHOT_ERROR]', error);
    return new Response(JSON.stringify({
      ok: false,
      error: 'Failed to capture odds snapshots',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * Remove snapshots older than 48 hours to prevent blob bloat
 */
async function cleanupOldSnapshots(store) {
  try {
    const cutoff = Date.now() - (48 * 60 * 60 * 1000); // 48 hours ago
    
    // List all blobs and delete old ones
    const { blobs } = await store.list();
    let deletedCount = 0;
    
    for (const blob of blobs) {
      // Extract timestamp from key (format: gameId/timestamp)
      const parts = blob.key.split('/');
      if (parts.length === 2) {
        const timestamp = parseInt(parts[1], 10);
        if (!isNaN(timestamp) && timestamp < cutoff) {
          await store.delete(blob.key);
          deletedCount++;
        }
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[CLEANUP] Deleted ${deletedCount} old odds snapshots`);
    }
  } catch (error) {
    console.warn('[CLEANUP_ERROR]', error.message);
    // Don't fail the main function if cleanup fails
  }
}
