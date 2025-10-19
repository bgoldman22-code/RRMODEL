/**
 * Upload SSOT JSON to Netlify Blobs
 * Run this after generating SSOT with generate-ssot.R
 */

import { getStore } from '@netlify/blobs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SSOT_DIR = path.join(__dirname, '../../data/nfl/ssot');

async function uploadSSOT() {
  const store = getStore('nfl-receiving-ssot');
  
  // Read all SSOT files
  const files = await fs.readdir(SSOT_DIR);
  const ssotFiles = files.filter(f => f.startsWith('week_') && f.endsWith('.json'));
  
  console.log(`📦 Found ${ssotFiles.length} SSOT files to upload`);
  
  for (const file of ssotFiles) {
    const filePath = path.join(SSOT_DIR, file);
    const data = await fs.readFile(filePath, 'utf8');
    const ssot = JSON.parse(data);
    
    // Store with key: week_X_YYYY
    const key = file.replace('.json', '');
    await store.set(key, data, {
      metadata: {
        week: ssot.week.toString(),
        season: ssot.season.toString(),
        generated_at: ssot.generated_at,
        player_count: ssot.players.length.toString()
      }
    });
    
    console.log(`✅ Uploaded ${key}: Week ${ssot.week} ${ssot.season}, ${ssot.players.length} players`);
  }
  
  console.log('\\n🎉 All SSOT files uploaded to Netlify Blobs!');
}

uploadSSOT().catch(console.error);
