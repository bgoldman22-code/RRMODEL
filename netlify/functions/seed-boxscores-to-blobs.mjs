/**
 * Manual Trigger - Upload Initial Boxscores to Netlify Blobs
 * 
 * ONE-TIME USE: Seeds Netlify Blobs with existing boxscores data
 * 
 * After running this once, the daily updater (update-boxscores-daily.mjs) 
 * will keep the data fresh automatically.
 * 
 * Usage:
 *   1. Deploy this function
 *   2. Visit: https://your-site.netlify.app/.netlify/functions/seed-boxscores-to-blobs
 *   3. Check response - should show "Uploaded X entries"
 *   4. Delete this function (no longer needed)
 */

import { getStore } from '@netlify/blobs';
import { readFile } from 'fs/promises';
import { join } from 'path';

export default async (req, context) => {
  console.log('📤 Seeding Netlify Blobs with initial boxscores...');
  
  try {
    // Read local boxscores file
    const boxscoresPath = join(process.cwd(), 'data/nba/player-boxscores-2024.json');
    const boxscoresRaw = await readFile(boxscoresPath, 'utf-8');
    const boxscores = JSON.parse(boxscoresRaw);
    
    console.log(`📁 Loaded ${boxscores.length} entries from local file`);
    
    // Upload to Netlify Blobs
    const store = getStore('nba-data');
    await store.set('player-boxscores-current', boxscoresRaw);
    
    console.log(`✅ Uploaded to Netlify Blobs: nba-data/player-boxscores-current`);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Initial boxscores uploaded to Netlify Blobs',
      entriesUploaded: boxscores.length,
      blobKey: 'player-boxscores-current',
      storeName: 'nba-data',
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Seed failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
