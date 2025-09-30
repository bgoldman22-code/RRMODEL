// netlify/functions/injuries-read.js
// FAST READER: Always sub-50ms, never timeouts
// Reads from pre-computed blob cache

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
  console.log('🔍 Fast injury reader starting...');
  
  try {
    const store = getBlobStore();
    const latest = await store.get('nfl/injuries/v4/latest.json');
    
    if (!latest) {
      console.warn('⚠️ No cached injury data found');
      return {
        statusCode: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=120'
        },
        body: JSON.stringify({
          success: true,
          status: 'NO_CACHE',
          asOf: null,
          teams: {},
          message: 'No injury data cached yet. Background job may be running.'
        })
      };
    }

    const data = JSON.parse(latest);
    const requestedTeams = (event.queryStringParameters?.teams || '').split(',').filter(Boolean);
    
    // Filter to requested teams or return all
    const teams = requestedTeams.length > 0
      ? Object.fromEntries(requestedTeams.map(t => [t.toUpperCase(), data.teams[t.toUpperCase()]]).filter(([,v]) => v))
      : data.teams;

    const age = data.asOf ? Math.floor((Date.now() - Date.parse(data.asOf)) / 1000 / 60) : null;
    
    console.log(`✅ Served ${Object.keys(teams).length} teams, data age: ${age}min`);
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=120'
      },
      body: JSON.stringify({
        success: true,
        status: 'CACHED',
        asOf: data.asOf,
        version: data.version,
        source: data.source,
        teams,
        summary: {
          ...data.summary,
          cacheAgeMinutes: age,
          teamsReturned: Object.keys(teams).length
        }
      })
    };
    
  } catch (error) {
    console.error('❌ Injury reader failed:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Failed to read injury cache'
      })
    };
  }
};