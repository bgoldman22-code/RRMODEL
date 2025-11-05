// netlify/functions/nfl-v41-latest.mjs
// GET endpoint for latest V4.1 NFL predictions
// Independent from legacy NFL functions

import { getStore, LATEST_KEY } from './_lib/blobs-nfl-v41.mjs';

export default async function handler(req) {
  try {
    const store = getStore();
    const latestBundle = await store.get(LATEST_KEY, { type: 'json' });
    
    if (!latestBundle) {
      return new Response(
        JSON.stringify({ error: 'No V4.1 predictions available yet' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify(latestBundle),
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300, s-maxage=300'
        }
      }
    );
  } catch (error) {
    console.error('Error fetching V4.1 latest:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
