/**
 * Self-test endpoint for CSV snapshot system
 * Tests store/key/round-trip in isolation
 * 
 * GET /.netlify/functions/nfl-picks-snapshot-selftest
 */

import { getSnapshotStore, snapshotKey } from '../_lib/csv-snapshot.mjs';

export default async (request, context) => {
  const season = 2025, week = 99;
  const store = getSnapshotStore();
  const key = snapshotKey({ season, week });
  const csv = 'a,b,c\n1,2,3\ntest,data,here\n';

  try {
    // Write test blob - Netlify Blobs accepts strings directly
    await store.set(key, csv, { 
      metadata: { test: true, season: String(season), week: String(week) }
    });
    
    // Try to read it back - returns string directly
    const retrieved = await store.get(key);
    
    // List to verify
    const list = await store.list({ prefix: `nfl/${season}/` });
    
    const result = {
      ok: !!retrieved,
      wroteKey: key,
      listHasKey: !!list.blobs?.find(x => x.key === key),
      listCount: list.blobs?.length || 0,
      allKeys: list.blobs?.map(x => x.key) || [],
      sample: retrieved || null,
    };
    
    // Cleanup test blob
    if (ok) {
      await store.delete(key);
    }
    
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error.message,
      stack: error.stack
    }, null, 2), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
