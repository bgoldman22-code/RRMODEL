/**
 * NHL Schedule Refresh - Daily at 4am ET (8am or 9am UTC depending on DST)
 * 
 * Fetches today's NHL schedule from NHL.com API and caches to Netlify Blobs
 * This prevents rate limiting on the main scanner function (which runs frequently)
 * 
 * Scheduled: 4am ET = 8am UTC (DST) or 9am UTC (standard time)
 * Using 8am UTC for simplicity (works for most of the year)
 */

import { getStore } from '@netlify/blobs';

const NHL_API_BASE = 'https://api-web.nhle.com/v1';

export default async (request, context) => {
  console.log('🏒 NHL Schedule Refresh started at', new Date().toISOString());
  
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 Fetching NHL schedule for ${today}`);
    
    // Fetch schedule from NHL.com
    const scheduleUrl = `${NHL_API_BASE}/schedule/${today}`;
    const scheduleResponse = await fetch(scheduleUrl);
    
    if (!scheduleResponse.ok) {
      throw new Error(`NHL API returned ${scheduleResponse.status}: ${await scheduleResponse.text()}`);
    }
    
    const schedule = await scheduleResponse.json();
    const allGames = schedule.gameWeek?.[0]?.games || [];
    
    console.log(`✅ Fetched ${allGames.length} NHL games for today`);
    
    // Store in Netlify Blobs with today's date as key
    const store = getStore('nhl-schedule');
    await store.setJSON(today, {
      date: today,
      games: allGames,
      cached_at: new Date().toISOString(),
      ttl: 24 * 60 * 60 // 24 hours
    });
    
    console.log(`💾 Cached schedule to Netlify Blobs: nhl-schedule/${today}`);
    
    return new Response(JSON.stringify({
      success: true,
      date: today,
      games: allGames.length,
      cached_at: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    console.error('❌ NHL schedule refresh failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};

export const config = {
  schedule: '@daily'
};
