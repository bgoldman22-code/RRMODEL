/**
 * Upload NHL Stats to Netlify Blobs
 * 
 * Reads local player_stats JSON files and uploads to Netlify Blobs
 * Supports multi-season upload for historical baseline
 * 
 * Usage:
 *   node upload-to-blobs.mjs                    # Upload all available seasons
 *   node upload-to-blobs.mjs --seasons=20252026 # Upload specific season(s)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getStore } from '@netlify/blobs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line args
const args = process.argv.slice(2);
const seasonsArg = args.find(arg => arg.startsWith('--seasons='));
const SEASONS = seasonsArg 
  ? seasonsArg.split('=')[1].split(',')
  : ['20222023', '20232024', '20242025', '20252026']; // All seasons by default

async function uploadToBlobs() {
  console.log(`🔄 Uploading ${SEASONS.length} NHL season(s) to Netlify Blobs...`);
  console.log(`   Seasons: ${SEASONS.join(', ')}\n`);
  
  // Get credentials from environment
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_TOKEN;
  
  if (!siteID || !token) {
    console.error('❌ Missing Netlify credentials');
    console.log('\n💡 Set environment variables:');
    console.log('   export NETLIFY_SITE_ID=your_site_id');
    console.log('   export NETLIFY_AUTH_TOKEN=your_auth_token');
    console.log('\n   Or run via GitHub Action with secrets configured');
    process.exit(1);
  }
  
  const store = getStore({ name: 'nhl-stats', siteID, token });
  let successCount = 0;
  let totalSize = 0;
  
  for (const season of SEASONS) {
    try {
      // Read local file
      const statsFile = path.join(__dirname, `../../data/nhl/player_stats_${season}.json`);
      
      if (!fs.existsSync(statsFile)) {
        console.warn(`⚠️  Skipping ${season}: File not found`);
        continue;
      }
      
      const fileData = fs.readFileSync(statsFile, 'utf8');
      const data = JSON.parse(fileData);
      const sizeKB = (fileData.length / 1024).toFixed(0);
      
      console.log(`📊 ${season}: ${data.totalPlayers} players, ${sizeKB} KB`);
      
      // Upload to Netlify Blobs
      await store.set(`player_stats_${season}`, fileData);
      
      console.log(`   ✅ Uploaded to Blobs\n`);
      successCount++;
      totalSize += parseInt(sizeKB);
      
    } catch (error) {
      console.error(`   ❌ Failed to upload ${season}:`, error.message);
    }
  }
  
  if (successCount === 0) {
    console.error('\n❌ No seasons uploaded successfully');
    
    console.log('\n💡 This script requires Netlify credentials:');
    console.log('   Set NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID environment variables');
    console.log('   Or run this as a GitHub Action with secrets configured');
    
    process.exit(1);
  }
  
  console.log(`\n✅ Upload complete: ${successCount}/${SEASONS.length} seasons`);
  console.log(`   Total size: ${totalSize} KB`);
  
  return true;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  uploadToBlobs().catch(console.error);
}

export { uploadToBlobs };
