// netlify/functions/nfl-v41-by-date.mjs
// GET endpoint for V4.1 NFL predictions by specific date
// Independent from legacy NFL functions

import { getStore, keyForDate } from './_lib/blobs-nfl-v41.mjs';

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get('date');
    
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(
        JSON.stringify({ error: 'Invalid or missing date parameter. Use format: YYYY-MM-DD' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const store = getStore();
    const bundle = await store.get(keyForDate(date), { type: 'json' });
    
    if (!bundle) {
      return new Response(
        JSON.stringify({ error: `No V4.1 predictions found for ${date}` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify(bundle),
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600'
        }
      }
    );
  } catch (error) {
    console.error('Error fetching V4.1 by date:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
