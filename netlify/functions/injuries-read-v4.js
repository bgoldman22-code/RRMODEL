// Fast reader with atomic pattern - Production v4.0
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
  const startTime = Date.now();
  
  try {
    const store = getBlobStore();
    
    // 1. Read pointer first (atomic pattern)
    const pointerData = await store.get('injuries/v4/latest.json');
    if (!pointerData) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'No injury data pointer available',
          message: 'System is initializing - please wait for data generation'
        })
      };
    }

    const pointer = JSON.parse(pointerData);
    
    // 2. Follow reference to actual snapshot data
    const snapshotData = await store.get(pointer.ref);
    if (!snapshotData) {
      console.error(`Snapshot not found: ${pointer.ref}`);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: `Snapshot not found: ${pointer.ref}`,
          message: 'Data integrity issue - please retry'
        })
      };
    }

    const injuryData = JSON.parse(snapshotData);
    
    // 3. Optional team filtering
    const teams = (event.queryStringParameters?.teams || '').split(',').filter(Boolean);
    
    let filteredData = injuryData;
    if (teams.length > 0) {
      filteredData = {
        ...injuryData,
        teams: Object.fromEntries(
          Object.entries(injuryData.teams || {})
            .filter(([teamCode]) => teams.includes(teamCode.toUpperCase()))
        )
      };
    }

    const responseTime = Date.now() - startTime;
    const cacheAge = Date.now() - new Date(pointer.asOf).getTime();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'X-Response-Time': `${responseTime}ms`,
        'X-Cache-Source': 'blob-storage-atomic',
        'X-Data-Age': `${Math.floor(cacheAge / 1000)}s`,
        'ETag': pointer.etag || 'unknown',
        'X-Snapshot-Ref': pointer.ref,
        'X-As-Of': pointer.asOf,
        'X-Schema-Version': pointer.schemaVersion || '4.0'
      },
      body: JSON.stringify({
        success: true,
        data: filteredData,
        responseTime: `${responseTime}ms`,
        cached: true,
        teams: teams.length > 0 ? teams : 'all',
        dataAge: `${Math.floor(cacheAge / 1000)}s`,
        partial: injuryData.summary?.partial || false
      })
    };
  } catch (error) {
    console.error('Fast reader v4 error:', error);
    const responseTime = Date.now() - startTime;
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message,
        responseTime: `${responseTime}ms`,
        version: 'v4.0-atomic'
      })
    };
  }
};