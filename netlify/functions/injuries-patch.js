// netlify/functions/injuries-patch.js  
// SURGICAL REFRESHER: Returns cache instantly, triggers background refresh when stale
// Implements stale-while-revalidate pattern

import { getStore } from '@netlify/blobs';

function getBlobStore() {
  const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-data';
  const token = process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.NETLIFY_SITE_ID;
  return (token && siteID)
    ? getStore({ name: storeName, siteID, token })
    : getStore(storeName);
}

export const handler = async (event) => {
  console.log('🔧 Surgical injury patch starting...');
  
  try {
    const requestedTeams = (event.queryStringParameters?.teams || '').split(',').filter(Boolean);
    const store = getBlobStore();
    const latest = await store.get('nfl/injuries/v4/latest.json');
    
    let data = { teams: {}, asOf: null, summary: {} };
    let status = 'NO_CACHE';
    
    if (latest) {
      data = JSON.parse(latest);
      status = 'CACHED';
    }
    
    // Filter to requested teams
    const teams = requestedTeams.length > 0
      ? Object.fromEntries(requestedTeams.map(t => [t.toUpperCase(), data.teams[t.toUpperCase()]]).filter(([,v]) => v))
      : data.teams;

    // Check staleness (15 minutes = stale)
    const STALE_THRESHOLD = 15 * 60 * 1000; // 15 minutes
    const age = data.asOf ? (Date.now() - Date.parse(data.asOf)) : Infinity;
    const isStale = age > STALE_THRESHOLD;
    
    const response = {
      success: true,
      status,
      asOf: data.asOf,
      teams,
      summary: {
        ...data.summary,
        cacheAgeMinutes: Math.floor(age / 1000 / 60),
        teamsReturned: Object.keys(teams).length,
        isStale
      },
      refreshTriggered: false
    };

    // If stale and close to game time, trigger background refresh (fire-and-forget)
    if (isStale && shouldTriggerRefresh()) {
      try {
        // Option 1: Trigger via webhook (if configured)
        if (process.env.REFRESH_WEBHOOK_URL) {
          fetch(process.env.REFRESH_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              teams: requestedTeams,
              trigger: 'surgical_patch',
              staleMinutes: Math.floor(age / 1000 / 60)
            })
          }).catch(() => {}); // fire-and-forget
        }
        
        // Option 2: Trigger Netlify background function (if available)
        // This would require Netlify's background function setup
        
        response.refreshTriggered = true;
        console.log(`🔄 Triggered background refresh for ${requestedTeams.length || 'all'} teams`);
        
      } catch (refreshError) {
        console.warn('⚠️ Failed to trigger refresh:', refreshError.message);
        // Don't fail the request if refresh trigger fails
      }
    }

    console.log(`✅ Patch complete: ${Object.keys(teams).length} teams, stale=${isStale}, refresh=${response.refreshTriggered}`);
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': isStale ? 'no-cache' : 'public, max-age=30'
      },
      body: JSON.stringify(response)
    };
    
  } catch (error) {
    console.error('❌ Injury patch failed:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Failed to patch injury data'
      })
    };
  }
};

function shouldTriggerRefresh() {
  // Only trigger refresh during reasonable hours (not 3am on Tuesday)
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sunday, 6=Saturday
  
  // Aggressive refresh on game days (Thu-Mon) during prime hours
  if ([0, 1, 4, 5, 6].includes(day) && hour >= 10 && hour <= 23) {
    return true;
  }
  
  // Light refresh other times if data is very stale (>1 hour)
  const VERY_STALE_THRESHOLD = 60 * 60 * 1000; // 1 hour
  return false; // Could implement based on staleness
}