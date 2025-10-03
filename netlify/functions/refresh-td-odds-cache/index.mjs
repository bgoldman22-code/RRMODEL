// netlify/functions/refresh-td-odds-cache/index.mjs
// Standalone function to refresh the TD odds cache
// Can be called manually or via scheduled deployment

import fs from 'fs/promises';
import { fetchPlayerPropOdds } from '../../../scripts/fetch-player-prop-odds.js';

const ODDS_CACHE_FILE = 'public/data/nfl-td-odds-cache.json';

export default async (request, context) => {
  console.log('🔄 Manual odds cache refresh triggered');
  
  try {
    // Fetch fresh odds from TheOddsAPI
    console.log('📡 Fetching player prop odds...');
    const odds = await fetchPlayerPropOdds();
    console.log(`✅ Fetched odds for ${Object.keys(odds).length} players`);
    
    // Save to cache
    const cache = {
      timestamp: new Date().toISOString(),
      player_count: Object.keys(odds).length,
      refresh_type: 'manual',
      odds: odds
    };
    
    await fs.mkdir('public/data', { recursive: true });
    await fs.writeFile(ODDS_CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`✅ Saved odds cache to ${ODDS_CACHE_FILE}`);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Odds cache refreshed successfully',
      player_count: Object.keys(odds).length,
      timestamp: cache.timestamp,
      cache_file: ODDS_CACHE_FILE
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('❌ Odds cache refresh failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Odds cache refresh failed',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
