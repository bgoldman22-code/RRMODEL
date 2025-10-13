/**
 * Download CSV snapshots of picks for CLV tracking
 * 
 * GET /.netlify/functions/nfl-picks-snapshot-get?season=2025&week=6
 * Returns the CSV file with all timestamped snapshots for that week
 */

import { getSnapshotCSV, listSnapshots } from '../_lib/csv-snapshot.mjs';

export default async (request, context) => {
  try {
    const url = new URL(request.url);
    const season = url.searchParams.get('season') || '2025';
    const week = url.searchParams.get('week');
    
    // If no week specified, list all available snapshots
    if (!week) {
      const snapshots = await listSnapshots(season);
      return new Response(JSON.stringify({
        ok: true,
        season: season,
        snapshots: snapshots
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    // Get specific week's CSV with diagnostics
    const result = await getSnapshotCSV(season, week, true);
    
    if (!result.content) {
      // Enhanced 404 with diagnostics
      return new Response(JSON.stringify({
        ok: false,
        error: 'Snapshot not found',
        season: season,
        week: week,
        attemptedKey: result.key,
        nearby: result.listed || []
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    // Return CSV file
    const pad2 = n => String(n).padStart(2, '0');
    return new Response(result.content, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${season}_week${pad2(week)}_picks_snapshots.csv"`,
        'Cache-Control': 'public, max-age=60',
        'X-Snapshot-Key': result.key,
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('Error fetching snapshot:', error);
    return new Response(JSON.stringify({
      ok: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
