// scripts/lib/blob_io.js
// Unified blob I/O with Netlify Blobs if available, else local FS fallback.

import fs from 'fs';
import path from 'path';

let blobsClient = null;
try {
  // Optional dependency: @netlify/blobs (only used in Netlify environment)
  const mod = await import('@netlify/blobs').catch(()=>null);
  if (mod && process.env.NETLIFY) {
    blobsClient = mod;
  }
} catch (e) {
  // ignore
}

export async function writeToBlobStorage(blobPath, data) {
  const json = JSON.stringify(data);
  if (blobsClient && blobsClient.set) {
    // New Netlify Blobs API (@netlify/blobs >= v6)
    await blobsClient.set(blobPath, json, { contentType: 'application/json' });
    return;
  }
  // Fallback: write to local repo path (useful for local runs & CI artifacts)
  const outDir = path.join(process.cwd(), '.artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, blobPath.replace(/\//g, '__'));
  fs.writeFileSync(outFile, json, 'utf8');
  console.log(`[blob_io] Wrote local artifact at ${outFile}`);
}

export async function readFromBlobStorage(blobPath) {
  if (blobsClient && blobsClient.get) {
    const res = await blobsClient.get(blobPath);
    if (!res) return null;
    const txt = await res.text();
    return JSON.parse(txt);
  }
  // Local fallback
  const inFile = path.join(process.cwd(), '.artifacts', blobPath.replace(/\//g, '__'));
  if (fs.existsSync(inFile)) {
    return JSON.parse(fs.readFileSync(inFile, 'utf8'));
  }
  return null;
}
