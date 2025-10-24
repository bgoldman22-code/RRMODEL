/**
 * Upload NHL Stats to Netlify Blobs
 * 
 * Reads local player_stats_20252026.json and uploads to Netlify Blobs
 * Run after update-player-stats.mjs to sync local → production
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getStore } from '@netlify/blobs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CURRENT_SEASON = '20252026';

async function uploadToBlobs() {
  console.log('🔄 Uploading NHL stats to Netlify Blobs...');
  
  try {
    // Read local file
    const statsFile = path.join(__dirname, `../../data/nhl/player_stats_${CURRENT_SEASON}.json`);
    
    if (!fs.existsSync(statsFile)) {
      console.error(`❌ File not found: ${statsFile}`);
      console.log('💡 Run update-player-stats.mjs first to generate the stats file');
      process.exit(1);
    }
    
    const fileData = fs.readFileSync(statsFile, 'utf8');
    const data = JSON.parse(fileData);
    
    console.log(`📊 Loaded ${data.totalPlayers} players from local file`);
    
    // Upload to Netlify Blobs
    const store = getStore('nhl-stats');
    await store.set(`player_stats_${CURRENT_SEASON}`, fileData);
    
    console.log(`✅ Uploaded to Netlify Blobs: player_stats_${CURRENT_SEASON}`);
    console.log(`   Players: ${data.totalPlayers}`);
    console.log(`   Teams: ${data.teams}`);
    console.log(`   File size: ${(fileData.length / 1024).toFixed(0)} KB`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    
    if (error.message.includes('Netlify Blobs')) {
      console.log('\n💡 This script requires Netlify credentials:');
      console.log('   Set NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID environment variables');
      console.log('   Or run this as a GitHub Action with secrets configured');
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  uploadToBlobs().catch(console.error);
}

export { uploadToBlobs };
