/**
 * Simple Blobs test - just check if we can read anything
 */

import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  console.log('🧪 Simple Blobs test...');
  
  try {
    const store = getStore('nba-data');
    
    // Try the simplest possible read
    const data = await store.get('player-boxscores-current');
    
    console.log('Data type:', typeof data);
    console.log('Data constructor:', data?.constructor?.name);
    
    return new Response(JSON.stringify({
      success: true,
      dataExists: !!data,
      dataType: typeof data,
      dataConstructor: data?.constructor?.name,
      hasArrayBuffer: typeof data?.arrayBuffer === 'function',
      hasText: typeof data?.text === 'function',
      message: 'Blob retrieved successfully'
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
