/**
 * Test Netlify Blobs - Verify boxscores data is accessible
 */

import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  console.log('🧪 Testing Netlify Blobs access...');
  
  try {
    const store = getStore('nba-data');
    
    // Try to read the boxscores
    const boxscores = await store.get('player-boxscores-current', { type: 'json' });
    
    if (!boxscores) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No data found in Blobs',
        store: 'nba-data',
        key: 'player-boxscores-current'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const isArray = Array.isArray(boxscores);
    const count = isArray ? boxscores.length : 0;
    const sample = isArray && boxscores[0] ? boxscores[0] : null;
    
    return new Response(JSON.stringify({
      success: true,
      store: 'nba-data',
      key: 'player-boxscores-current',
      dataType: typeof boxscores,
      isArray,
      entryCount: count,
      sampleEntry: sample,
      message: `✅ Successfully loaded ${count} boxscore entries from Netlify Blobs`
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
