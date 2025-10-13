// netlify/functions/nfl-predictions-get/index.mjs
// Lightweight read-only endpoint with HTTP caching for fast TTFB
// Phase 1 Speed Optimization: ETag, Cache-Control, 304 responses

import { getStore } from '@netlify/blobs';
import crypto from 'crypto';

export default async (request) => {
  const startTime = Date.now();
  
  try {
    const name = process.env.BLOBS_STORE_NFL || "nfl-td";
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN;
    const store = (siteID && token) ? getStore({ siteID, token, name }) : getStore(name);

    // Get prediction data from blob storage
    const predictionData = await store.get("predictions/current.json", { type: "json" });
    
    if (!predictionData) {
      return new Response(JSON.stringify({ ok: true, rows: [], note: "No predictions yet." }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=300'
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
          'X-Lambda-Duration': `${Date.now() - startTime}ms`
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
        'X-Predictions-Count': String(predictionData.predictions?.length || predictionData.rows?.length || 0)
      }
    });

  } catch (error) {
    console.error('[GET_ERROR]', error);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: "Failed to retrieve predictions.", 
      details: error.message 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Lambda-Duration': `${Date.now() - startTime}ms`
      }
    });
  }
};
