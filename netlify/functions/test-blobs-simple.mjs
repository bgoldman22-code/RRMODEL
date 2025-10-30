/**
 * Simple Blobs test - just check if we can read anything
 */

import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  console.log('🧪 Simple Blobs test - reading both blobs...');
  
  try {
    const store = getStore('nba-data');
    
    // Read both blobs using the { type: 'json' } pattern
    const [historicalData, currentData] = await Promise.all([
      store.get('player-boxscores-historical', { type: 'json' }),
      store.get('player-boxscores-current', { type: 'json' })
    ]);
    
    console.log('Historical entries:', historicalData?.length || 0);
    console.log('Current entries:', currentData?.length || 0);
    
    const totalEntries = (historicalData?.length || 0) + (currentData?.length || 0);
    
    return new Response(JSON.stringify({
      success: true,
      historicalExists: !!historicalData,
      currentExists: !!currentData,
      historicalEntries: historicalData?.length || 0,
      currentEntries: currentData?.length || 0,
      totalEntries,
      sampleHistorical: historicalData?.[0] || null,
      sampleCurrent: currentData?.[0] || null,
      message: 'Both blobs read successfully with { type: "json" }'
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack
    }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
