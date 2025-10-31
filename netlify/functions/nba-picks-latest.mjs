/**
 * Serve Latest NBA Picks from Blobs
 * 
 * Reads the latest predictions from Netlify Blobs and serves them
 * Frontend can call this to get live picks
 * 
 * Usage: https://bgroundrobin.com/.netlify/functions/nba-picks-latest
 */

import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  try {
    const store = getStore('nba-data');
    
    // Read latest picks from Blobs
    const picks = await store.get('nba-picks-latest', { type: 'json' });
    
    if (!picks) {
      // Fall back to the static file if no picks in Blobs yet
      return new Response(JSON.stringify({
        error: 'No picks available yet. Run generate-daily-predictions first.',
        generated: new Date().toISOString()
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
        }
      });
    }
    
    return new Response(JSON.stringify(picks), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching picks:', error);
    
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
