/**
 * Seed Netlify Blobs using @netlify/blobs SDK
 * 
 * This ensures data is stored in SDK-compatible format
 * 
 * Usage:
 *   NETLIFY_SITE_ID=xxx NETLIFY_TOKEN=xxx node scripts/nba/seed-blobs-with-sdk.mjs
 */

import { getStore } from '@netlify/blobs';
import { readFile } from 'fs/promises';

const SITE_ID = process.env.NETLIFY_SITE_ID;
const TOKEN = process.env.NETLIFY_TOKEN;

if (!TOKEN || !SITE_ID) {
  console.error('❌ NETLIFY_SITE_ID and NETLIFY_TOKEN required');
  process.exit(1);
}

// Set environment variables for SDK
process.env.NETLIFY_BLOBS_CONTEXT = JSON.stringify({
  siteID: SITE_ID,
  token: TOKEN,
  edgeURL: 'https://edge.netlify.com'
});

async function seedBlobs() {
  console.log('📤 Seeding Netlify Blobs using SDK...');
  
  try {
    // Read local boxscores file
    const boxscoresPath = '/tmp/player-boxscores-2024.json';
    const boxscoresData = await readFile(boxscoresPath, 'utf-8');
    const boxscores = JSON.parse(boxscoresData);
    
    console.log(`📁 Loaded ${boxscores.length} entries from ${boxscoresPath}`);
    console.log(`📊 File size: ${(boxscoresData.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Split into historical and current based on date
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
    
    console.log(`\n📊 Historical (Oct-Dec 2024): ${historicalBoxscores.length} entries`);
    console.log(`📊 Current (Jan 2025+): ${currentBoxscores.length} entries`);
    
    // Get store
    const store = getStore({ 
      name: 'nba-data',
      siteID: SITE_ID,
      token: TOKEN
    });
    
    // Upload both blobs using SDK
    console.log(`\n📤 Uploading Historical blob...`);
    await store.set('player-boxscores-historical', JSON.stringify(historicalBoxscores));
    console.log(`✅ Historical uploaded`);
    
    console.log(`\n📤 Uploading Current blob...`);
    await store.set('player-boxscores-current', JSON.stringify(currentBoxscores));
    console.log(`✅ Current uploaded`);
    
    console.log('\n✅ SUCCESS!');
    console.log(`📊 Total entries: ${historicalBoxscores.length + currentBoxscores.length}`);
    console.log(`🔗 Store: nba-data`);
    console.log(`🔑 Keys: player-boxscores-historical, player-boxscores-current`);
    console.log('\n✨ Blobs seeded with SDK - compatible with { type: "json" } reads!');
    
  } catch (error) {
    console.error('\n❌ Seed failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

seedBlobs();
