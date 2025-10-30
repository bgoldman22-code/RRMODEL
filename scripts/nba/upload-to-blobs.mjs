/**
 * Upload large NBA data files to Netlify Blobs
 * Run once to migrate from git to Blobs storage
 * 
 * Usage: node scripts/nba/upload-to-blobs.mjs
 */

import { getStore } from '@netlify/blobs';
import fs from 'fs/promises';
import path from 'path';

const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID || 'bgroundrobin';
const NETLIFY_TOKEN = process.env.NETLIFY_AUTH_TOKEN;

if (!NETLIFY_TOKEN) {
  console.error('❌ NETLIFY_AUTH_TOKEN environment variable required');
  console.log('   Get it from: https://app.netlify.com/user/applications/personal');
  process.exit(1);
}

async function uploadFile(store, filePath, blobKey) {
  try {
    console.log(`📤 Uploading ${filePath} to blob: ${blobKey}`);
    const data = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(data);
    
    await store.setJSON(blobKey, json);
    
    const sizeKB = (data.length / 1024).toFixed(2);
    console.log(`✅ Uploaded ${sizeKB} KB to ${blobKey}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to upload ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🏀 NBA Data → Netlify Blobs Migration\n');
  
  const store = getStore({
    name: 'nba-data',
    siteID: NETLIFY_SITE_ID,
    token: NETLIFY_TOKEN
  });
  
  const files = [
    // Historical odds (650K+ lines)
    {
      local: 'data/nba/historical-odds-2024.json',
      blob: 'historical-odds-2024'
    },
    // Checkpoints (600K+ lines each)
    {
      local: 'data/nba/checkpoints/checkpoint-2025-02-08.json',
      blob: 'checkpoints/2025-02-08'
    },
    {
      local: 'data/nba/checkpoints/checkpoint-2025-02-18.json',
      blob: 'checkpoints/2025-02-18'
    },
    {
      local: 'data/nba/checkpoints/checkpoint-2025-02-28.json',
      blob: 'checkpoints/2025-02-28'
    },
    // Backtest results
    {
      local: 'data/nba/backtest-results.json',
      blob: 'backtest-results'
    },
    {
      local: 'data/nba/backtest-results-v2.json',
      blob: 'backtest-results-v2'
    }
  ];
  
  let uploaded = 0;
  let failed = 0;
  
  for (const file of files) {
    const success = await uploadFile(store, file.local, file.blob);
    if (success) uploaded++;
    else failed++;
  }
  
  console.log(`\n📊 Results: ${uploaded} uploaded, ${failed} failed`);
  console.log('\n✅ Migration complete! Now add these to .gitignore and remove from git:');
  console.log('   git rm --cached data/nba/checkpoints/*.json');
  console.log('   git rm --cached data/nba/historical-odds-*.json');
  console.log('   git rm --cached data/nba/backtest-results*.json');
  console.log('   git commit -m "Remove large NBA data files (now in Netlify Blobs)"');
}

main().catch(console.error);
