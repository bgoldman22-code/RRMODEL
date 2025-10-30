/**
 * Local Script - Seed Netlify Blobs with Boxscores
 * 
 * Uploads boxscores data to Netlify Blobs from your local machine
 * 
 * Netlify Blobs handles compression automatically - don't compress manually!
 * 
 * Usage:
 *   NETLIFY_SITE_ID=xxx NETLIFY_TOKEN=xxx node scripts/nba/seed-blobs-locally.mjs
 */

import { readFile } from 'fs/promises';
import fetch from 'node-fetch';

// Get site ID from environment or use the actual site ID
// Find your site ID at: https://app.netlify.com/sites/rrmodel/settings/general
const SITE_ID = process.env.NETLIFY_SITE_ID;
const TOKEN = process.env.NETLIFY_TOKEN;
const STORE_NAME = 'nba-data';
const KEY_HISTORICAL = 'player-boxscores-historical'; // Oct-Dec 2024
const KEY_CURRENT = 'player-boxscores-current'; // Jan 2025 onwards

if (!TOKEN) {
  console.error('❌ NETLIFY_TOKEN environment variable required');
  console.error('Get it from: https://app.netlify.com/user/applications#personal-access-tokens');
  process.exit(1);
}

async function seedBlobs() {
  console.log('📤 Seeding Netlify Blobs with boxscores...');
  
  try {
    // Read local boxscores file (from temp location or data dir)
    let boxscoresPath = '/tmp/player-boxscores-2024.json';
    try {
      await readFile(boxscoresPath, 'utf-8');
    } catch {
      boxscoresPath = 'data/nba/player-boxscores-2024.json';
    }
    
    const boxscoresData = await readFile(boxscoresPath, 'utf-8');
    const boxscores = JSON.parse(boxscoresData);
    
    console.log(`📁 Loaded ${boxscores.length} entries from ${boxscoresPath}`);
    console.log(`📊 File size: ${(boxscoresData.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Split into two blobs to stay under 10MB limit
    // Historical: Oct 2024 - Dec 2024 (early season)
    // Current: Jan 2025 onwards (recent games)
    const historicalStart = new Date('2024-10-01');
    const currentStart = new Date('2025-01-01');
    
    const historicalBoxscores = boxscores.filter(b => {
      const date = new Date(b.gameDate);
      return date >= historicalStart && date < currentStart;
    });
    
    const currentBoxscores = boxscores.filter(b => {
      const date = new Date(b.gameDate);
      return date >= currentStart;
    });
    
    const historicalData = JSON.stringify(historicalBoxscores);
    const currentData = JSON.stringify(currentBoxscores);
    
    console.log(`\n📊 Historical (Oct-Dec 2024): ${historicalBoxscores.length} entries, ${(historicalData.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Current (Jan 2025+): ${currentBoxscores.length} entries, ${(currentData.length / 1024 / 1024).toFixed(2)} MB`);
    
    if (historicalData.length > 10 * 1024 * 1024) {
      throw new Error(`Historical data exceeds 10MB limit (${(historicalData.length / 1024 / 1024).toFixed(2)}MB)`);
    }
    
    if (currentData.length > 10 * 1024 * 1024) {
      throw new Error(`Current data exceeds 10MB limit (${(currentData.length / 1024 / 1024).toFixed(2)}MB)`);
    }
    
    // Upload Historical Blob
    console.log(`\n📤 Uploading Historical blob...`);
    const historicalUrl = `https://api.netlify.com/api/v1/blobs/${SITE_ID}/${STORE_NAME}/${KEY_HISTORICAL}`;
    
    const historicalResponse = await fetch(historicalUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: historicalData
    });
    
    if (!historicalResponse.ok) {
      const error = await historicalResponse.text();
      throw new Error(`Historical upload failed: ${historicalResponse.status} - ${error}`);
    }
    
    console.log(`✅ Historical blob uploaded`);
    
    // Upload Current Blob
    console.log(`\n📤 Uploading Current blob...`);
    const currentUrl = `https://api.netlify.com/api/v1/blobs/${SITE_ID}/${STORE_NAME}/${KEY_CURRENT}`;
    
    const currentResponse = await fetch(currentUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: currentData
    });
    
    if (!currentResponse.ok) {
      const error = await currentResponse.text();
      throw new Error(`Current upload failed: ${currentResponse.status} - ${error}`);
    }
    
    console.log(`✅ Current blob uploaded`);
    
    console.log(`✅ Current blob uploaded`);
    
    console.log('\n✅ SUCCESS!');
    console.log(`📊 Uploaded ${historicalBoxscores.length + currentBoxscores.length} total boxscore entries to Netlify Blobs`);
    console.log(`🔗 Store: ${STORE_NAME}`);
    console.log(`🔑 Keys: ${KEY_HISTORICAL}, ${KEY_CURRENT}`);
    console.log(`📅 Historical: Oct-Dec 2024`);
    console.log(`📅 Current: Jan 2025 onwards`);
    console.log('\n✨ Your predictions function can now read from both Blobs!');
    
  } catch (error) {
    console.error('\n❌ Seed failed:', error.message);
    process.exit(1);
  }
}

seedBlobs();
