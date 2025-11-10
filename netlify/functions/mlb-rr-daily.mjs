/**
 * MLB Round Robin V2 - Daily Scheduled Refresh
 * 
 * Runs daily at 8 AM ET during MLB season (April-October)
 * Caches predictions to Netlify Blobs for fast page loads
 * 
 * Schedule: "0 12 * * *" (8 AM ET = 12 PM UTC during EDT)
 */

import { schedule } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

export const handler = schedule('0 12 * * *', async (event) => {
  const startTime = Date.now();
  
  try {
    console.log('🚀 Starting MLB RR daily refresh...');
    
    // Check if MLB season is active
    const now = new Date();
    const month = now.getMonth() + 1;
    const isSeasonActive = month >= 3 && month <= 10;
    
    if (!isSeasonActive) {
      console.log('⏸️  MLB offseason - skipping refresh');
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'MLB offseason',
          nextOpeningDay: '2026-03-26'
        })
      };
    }
    
    // Import the generator function dynamically
    const { handler: generateHandler } = await import('./mlb-rr-generate.mjs');
    
    // Generate fresh predictions
    console.log('📊 Generating predictions...');
    const result = await generateHandler(event, {});
    
    if (result.statusCode !== 200) {
      throw new Error('Generation failed');
    }
    
    const data = JSON.parse(result.body);
    
    // Store in Blobs for fast retrieval
    const store = getStore('mlb-rr-predictions');
    const today = new Date().toISOString().split('T')[0];
    
    await store.set('latest', JSON.stringify(data));
    await store.set(today, JSON.stringify(data));
    
    const elapsed = Date.now() - startTime;
    
    console.log(`✅ MLB RR refresh complete in ${elapsed}ms`);
    console.log(`   Games: ${data.meta?.gamesCount || 0}`);
    console.log(`   Top EV picks: ${data.topByEV?.length || 0}`);
    console.log(`   Cached to Blobs: latest, ${today}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        cached: true,
        date: today,
        gamesCount: data.meta?.gamesCount || 0,
        picksCount: data.topByEV?.length || 0,
        elapsed: `${elapsed}ms`
      })
    };
    
  } catch (error) {
    console.error('❌ MLB RR daily refresh failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
});
