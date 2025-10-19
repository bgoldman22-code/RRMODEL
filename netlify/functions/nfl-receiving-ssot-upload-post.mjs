/**
 * Upload SSOT JSON to Netlify Blobs via POST
 * POST /.netlify/functions/nfl-receiving-ssot-upload-post
 * Body: { "key": "week_7_2025", "data": {...} }
 */

import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
    };
  }

  try {
    const { key, data } = JSON.parse(event.body);
    
    if (!key || !data) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing key or data in request body' })
      };
    }

    // Use explicit credentials (same pattern as test-blobs)
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
    const storeName = 'nfl-receiving-ssot';
    
    let store;
    if (siteID && token) {
      store = getStore({ name: storeName, siteID, token });
    } else {
      store = getStore(storeName);
    }
    
    const ssotStr = typeof data === 'string' ? data : JSON.stringify(data);
    const ssot = JSON.parse(ssotStr);
    
    // Store the SSOT
    await store.set(key, ssotStr, {
      metadata: {
        week: ssot.week.toString(),
        season: ssot.season.toString(),
        generated_at: ssot.generated_at,
        player_count: ssot.players.length.toString()
      }
    });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Successfully uploaded SSOT: ${key}`,
        week: ssot.week,
        season: ssot.season,
        players: ssot.players.length,
        generated_at: ssot.generated_at
      })
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
