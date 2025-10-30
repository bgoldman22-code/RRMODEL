/**
 * Test Netlify Blobs - Verify boxscores data is accessible
 */

import { getStore } from '@netlify/blobs';
import { gunzip } from 'zlib';
import { promisify } from 'util';

const gunzipAsync = promisify(gunzip);

export default async (req, context) => {
  console.log('🧪 Testing Netlify Blobs access...');
  
  try {
    const store = getStore('nba-data');
    
    // Read as blob since it's gzipped
    const blob = await store.get('player-boxscores-current');
    
    if (!blob) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No data found in Blobs',
        store: 'nba-data',
        key: 'player-boxscores-current'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Convert blob to buffer
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Decompress
    const decompressed = await gunzipAsync(buffer);
    const boxscores = JSON.parse(decompressed.toString());
    
    const isArray = Array.isArray(boxscores);
    const count = isArray ? boxscores.length : 0;
    const sample = isArray && boxscores[0] ? boxscores[0] : null;
    
    return new Response(JSON.stringify({
      success: true,
      store: 'nba-data',
      key: 'player-boxscores-current',
      compressed: true,
      compressedSize: `${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
      decompressedSize: `${(decompressed.length / 1024 / 1024).toFixed(2)} MB`,
      dataType: typeof boxscores,
      isArray,
      entryCount: count,
      sampleEntry: sample,
      message: `✅ Successfully loaded ${count} boxscore entries from Netlify Blobs (gzip compressed)`
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack
    }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
