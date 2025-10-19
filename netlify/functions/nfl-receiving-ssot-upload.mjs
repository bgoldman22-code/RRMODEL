/**
 * Upload SSOT JSON to Netlify Blobs
 * Access: GET /.netlify/functions/nfl-receiving-ssot-upload
 */

import { getStore } from '@netlify/blobs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const handler = async (event) => {
  try {
    const SSOT_DIR = path.join(__dirname, '../../data/nfl/ssot');
    const store = getStore('nfl-receiving-ssot');
    
    // Read all SSOT files
    const files = await fs.readdir(SSOT_DIR);
    const ssotFiles = files.filter(f => f.startsWith('week_') && f.endsWith('.json'));
    
    const uploaded = [];
    
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
      
      uploaded.push({
        key,
        week: ssot.week,
        season: ssot.season,
        players: ssot.players.length,
        generated_at: ssot.generated_at
      });
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Uploaded ${uploaded.length} SSOT files to Netlify Blobs`,
        files: uploaded
      }, null, 2)
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
