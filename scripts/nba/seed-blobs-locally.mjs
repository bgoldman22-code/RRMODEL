/**
 * Local Script - Seed Netlify Blobs with Boxscores
 * 
 * Uploads boxscores data to Netlify Blobs from your local machine
 * Compresses JSON to fit within 10MB Netlify Blobs limit
 * 
 * Usage:
 *   NETLIFY_SITE_ID=xxx NETLIFY_TOKEN=xxx node scripts/nba/seed-blobs-locally.mjs
 */

import { readFile } from 'fs/promises';
import { gzip } from 'zlib';
import { promisify } from 'util';
import fetch from 'node-fetch';

const gzipAsync = promisify(gzip);

// Get site ID from environment or use the actual site ID
// Find your site ID at: https://app.netlify.com/sites/rrmodel/settings/general
const SITE_ID = process.env.NETLIFY_SITE_ID;
const TOKEN = process.env.NETLIFY_TOKEN;
const STORE_NAME = 'nba-data';
const KEY = 'player-boxscores-current';

if (!TOKEN) {
  console.error('❌ NETLIFY_TOKEN environment variable required');
  console.error('Get it from: https://app.netlify.com/user/applications#personal-access-tokens');
  process.exit(1);
}

async function seedBlobs() {
  console.log('📤 Seeding Netlify Blobs with boxscores...');
  
  try {
    // Read local boxscores file
    const boxscoresPath = 'data/nba/player-boxscores-2024.json';
    const boxscoresData = await readFile(boxscoresPath, 'utf-8');
    const boxscores = JSON.parse(boxscoresData);
    
    console.log(`📁 Loaded ${boxscores.length} entries from ${boxscoresPath}`);
    console.log(`📊 Original size: ${(boxscoresData.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Compress with gzip to fit in 10MB Netlify Blobs limit
    console.log(`🗜️  Compressing with gzip...`);
    const compressed = await gzipAsync(boxscoresData);
    console.log(`📊 Compressed size: ${(compressed.length / 1024 / 1024).toFixed(2)} MB`);
    
    if (compressed.length > 10 * 1024 * 1024) {
      throw new Error('Compressed data still exceeds 10MB limit. Need to filter data further.');
    }
    
    // Upload to Netlify Blobs
    const url = `https://api.netlify.com/api/v1/blobs/${SITE_ID}/${STORE_NAME}/${KEY}`;
    
    console.log(`\n📤 Uploading to Netlify Blobs...`);
    console.log(`   Store: ${STORE_NAME}`);
    console.log(`   Key: ${KEY}`);
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'gzip'
      },
      body: compressed
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed: ${response.status} - ${error}`);
    }
    
    console.log('\n✅ SUCCESS!');
    console.log(`📊 Uploaded ${boxscores.length} boxscore entries to Netlify Blobs`);
    console.log(`🔗 Store: ${STORE_NAME}`);
    console.log(`🔑 Key: ${KEY}`);
    console.log('\n✨ Your predictions function can now read from Blobs!');
    
  } catch (error) {
    console.error('\n❌ Seed failed:', error.message);
    process.exit(1);
  }
}

seedBlobs();
