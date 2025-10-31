/**
 * Upload boxscores to Netlify Blobs via deployed function
 * 
 * This script posts the local boxscores data to a Netlify function
 * which then uploads to Blobs using the site's built-in credentials
 * 
 * Usage:
 *   node scripts/nba/upload-to-blobs.mjs
 */

import { readFile } from 'fs/promises';
import fetch from 'node-fetch';

const FUNCTION_URL = 'https://bgroundrobin.com/.netlify/functions/seed-blobs-from-local';

async function uploadToBlobs() {
  console.log('📤 Uploading boxscores to Netlify Blobs...');
  
  try {
    // Read local boxscores file
    let boxscoresPath = '/tmp/player-boxscores-2024.json';
    try {
      await readFile(boxscoresPath, 'utf-8');
    } catch {
      boxscoresPath = 'data/nba/player-boxscores-2024.json';
    }
    
    console.log(`� Reading from: ${boxscoresPath}`);
    const boxscoresData = await readFile(boxscoresPath, 'utf-8');
    const boxscores = JSON.parse(boxscoresData);
    
    console.log(`📊 Loaded ${boxscores.length} entries`);
    console.log(`📦 Data size: ${(boxscoresData.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Get date range
    const dates = boxscores.map(b => b.gameDate).sort();
    console.log(`📅 Date range: ${dates[0]} to ${dates[dates.length-1]}`);
    
    console.log(`\n📤 Posting to Netlify function...`);
    console.log(`🔗 URL: ${FUNCTION_URL}`);
    
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: boxscoresData
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed: ${response.status} - ${error}`);
    }
    
    const result = await response.json();
    
    console.log('\n✅ SUCCESS!');
    console.log('📊 Historical blob:', result.historical.entries, 'entries', `(${result.historical.dateRange})`);
    console.log('📊 Current blob:', result.current.entries, 'entries', `(${result.current.dateRange})`);
    console.log('📊 Total:', result.total, 'entries');
    console.log('\n✨ Your live predictions will now use the complete dataset!');
    
  } catch (error) {
    console.error('\n❌ Upload failed:', error.message);
    process.exit(1);
  }
}

uploadToBlobs();
