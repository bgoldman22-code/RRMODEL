// scripts/lib/blob_io.js
import fs from 'fs';
import path from 'path';
import { getStore } from '@netlify/blobs';

export async function writeToBlobStorage(blobPath, data) {
  const json = JSON.stringify(data);
  
  // Try Netlify Blobs if we have a token
  if (process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN) {
    try {
      const store = getStore('nfl-data');
      await store.set(blobPath, json, { contentType: 'application/json' });
      console.log(`[blob_io] Wrote to Netlify Blobs: ${blobPath}`);
      return;
    } catch (error) {
      console.warn(`[blob_io] Blob write failed: ${error.message}`);
    }
  }
  
  // Fallback to local file
  const outDir = path.join(process.cwd(), '.artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, blobPath.replace(/\//g, '__'));
  fs.writeFileSync(outFile, json, 'utf8');
  console.log(`[blob_io] Wrote local artifact at ${outFile}`);
}
