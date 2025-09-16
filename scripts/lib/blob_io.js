// scripts/lib/blob_io.js
import fs from 'fs';
import path from 'path';
import { getStore } from '@netlify/blobs';

export async function writeToBlobStorage(blobPath, data) {
  const json = JSON.stringify(data);
  
  // Try Netlify Blobs if we have a token
  const token = process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.NETLIFY_SITE_ID;
  
  if (token && siteID) {
    try {
      // Use the same store name that your functions are configured to read from
      const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';
      
      const store = getStore({
        name: storeName,
        siteID: siteID,
        token: token
      });
      await store.set(blobPath, json, { contentType: 'application/json' });
      console.log(`[blob_io] Wrote to Netlify Blobs (${storeName}): ${blobPath}`);
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
