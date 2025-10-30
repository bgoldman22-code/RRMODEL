/**
 * Manual Trigger - Upload Boxscores to Netlify Blobs via POST
 * 
 * ONE-TIME USE: Seeds Netlify Blobs by accepting data via POST
 * 
 * Usage:
 *   curl -X POST https://your-site.netlify.app/.netlify/functions/seed-blobs-from-post \
 *     -H "Content-Type: application/json" \
 *     -d @/path/to/boxscores.json
 */

import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  console.log('📤 Seeding Netlify Blobs from POST data...');
  
  if (req.method !== 'POST') {
    return new Response('Method not allowed - use POST', { status: 405 });
  }
  
  try {
    // Get data from POST body
    const bodyText = await req.text();
    const boxscores = JSON.parse(bodyText);
    
    if (!Array.isArray(boxscores)) {
      throw new Error('Expected an array of boxscores');
    }
    
    console.log(`📁 Received ${boxscores.length} entries`);
    
    // Split into historical and current based on date
    const historicalStart = new Date('2024-10-01');
    const currentStart = new Date('2025-01-01');
    
    const historicalBoxscores = boxscores.filter(b => {
      const date = new Date(b.gameDate);
      return date >= historicalStart && date < currentStart;
    });
    
    const currentBoxscores = boxscores.filter(b => {
      const date = new Date(b.gameDate);
      return date >= currentStart;
    });
    
    console.log(`📊 Split: ${historicalBoxscores.length} historical, ${currentBoxscores.length} current`);
    
    // Upload both to Netlify Blobs
    const store = getStore('nba-data');
    
    await Promise.all([
      store.set('player-boxscores-historical', JSON.stringify(historicalBoxscores)),
      store.set('player-boxscores-current', JSON.stringify(currentBoxscores))
    ]);
    
    console.log(`✅ Uploaded both blobs successfully`);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Boxscores split and uploaded to Netlify Blobs',
      historicalEntries: historicalBoxscores.length,
      currentEntries: currentBoxscores.length,
      totalEntries: boxscores.length,
      keys: {
        historical: 'player-boxscores-historical',
        current: 'player-boxscores-current'
      },
      storeName: 'nba-data',
      timestamp: new Date().toISOString()
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Seed failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
