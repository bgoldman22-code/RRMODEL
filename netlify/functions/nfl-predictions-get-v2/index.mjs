// netlify/functions/nfl-predictions-get-v2/index.mjs
// V2 ENHANCEMENT: HAD (Healthy Average Depth) predictions endpoint
// Reads from predictions-v2/current.json (HAD-adjusted injury impacts)
// Identical to V1 except for blob storage path

import { getStore } from '@netlify/blobs';
import crypto from 'crypto';

export default async (request) => {
  const startTime = Date.now();
  
  try {
    const name = process.env.BLOBS_STORE_NFL || "nfl-td";
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN;
    const store = (siteID && token) ? getStore({ siteID, token, name }) : getStore(name);

    // V2: Get HAD-enhanced prediction data from separate blob storage
    const predictionData = await store.get("predictions-v2/current.json", { type: "json" });
    
    if (!predictionData) {
      return new Response(JSON.stringify({ 
        ok: true, 
        rows: [], 
        note: "No V2 predictions yet. V2 uses HAD (Healthy Average Depth) system for injury depth override.",
        version: "v2-had"
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
          'X-Prediction-Version': 'v2-had'
        }
      });
    }

    // Generate response body
    const body = JSON.stringify(predictionData);
    
    // Generate ETag from content hash (MD5, first 16 chars for efficiency)
    const etag = '"' + crypto.createHash('md5').update(body).digest('hex').substring(0, 16) + '"';
    
    // Check if client has current version (304 Not Modified)
    const clientEtag = request.headers.get('if-none-match');
    if (clientEtag === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': etag,
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=1800',
          'X-Cache-Status': 'HIT',
          'X-Lambda-Duration': `${Date.now() - startTime}ms`,
          'X-Prediction-Version': 'v2-had'
        }
      });
    }

    // Get generation timestamp from prediction data
    const generatedAt = predictionData.updated || predictionData.generated_at || new Date().toISOString();
    const lastModified = new Date(generatedAt).toUTCString();

    // Return fresh data with caching headers
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=1800',
        'ETag': etag,
        'Last-Modified': lastModified,
        'X-Cache-Status': 'MISS',
        'X-Generated-At': generatedAt,
        'X-Lambda-Duration': `${Date.now() - startTime}ms`,
        'X-Predictions-Count': String(predictionData.predictions?.length || predictionData.rows?.length || 0),
        'X-Prediction-Version': 'v2-had' // V2: HAD-enabled predictions
      }
    });

  } catch (error) {
    console.error('[GET_V2_ERROR]', error);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: "Failed to retrieve V2 predictions.", 
      details: error.message,
      version: "v2-had"
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Lambda-Duration': `${Date.now() - startTime}ms`,
        'X-Prediction-Version': 'v2-had'
      }
    });
  }
};
