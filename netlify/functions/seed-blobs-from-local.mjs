/**
 * Netlify Function - Seed Blobs from Posted Data
 * 
 * Accepts boxscores data via POST request and uploads to Netlify Blobs
 * Uses the function's built-in Blobs access (no token needed)
 * 
 * Usage:
 *   POST to /.netlify/functions/seed-blobs-from-local
 *   Body: JSON array of boxscores
 */

import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    console.log('📤 Starting blob seed...');
    
    // Parse the posted boxscores data
    const boxscores = await req.json();
    
    if (!Array.isArray(boxscores)) {
      return new Response(JSON.stringify({ error: 'Expected array of boxscores' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`📁 Received ${boxscores.length} entries`);
    
    // Split into two blobs
    const historicalStart = new Date('2024-10-01');
    const currentStart = new Date('2025-01-01');
    
    const historicalBoxscores = boxscores.filter(b => {
      const date = new Date(b.gameDate);
      return date >= historicalStart && date < currentStart;
    });
    
    const currentBoxscores = boxscores.filter(b => {
      const date = new Date(b.gameDate);
      return date >= currentStart;
    });
    
    console.log(`📊 Historical (Oct-Dec 2024): ${historicalBoxscores.length} entries`);
    console.log(`📊 Current (Jan 2025+): ${currentBoxscores.length} entries`);
    
    // Get blob store
    const store = getStore({
      name: 'nba-data',
      consistency: 'strong'
    });
    
    // Upload both blobs
    console.log('📤 Uploading Historical blob...');
    await store.set('player-boxscores-historical', JSON.stringify(historicalBoxscores), {
      metadata: { 
        uploadedAt: new Date().toISOString(),
        entries: historicalBoxscores.length,
        dateRange: 'Oct-Dec 2024'
      }
    });
    
    console.log('📤 Uploading Current blob...');
    await store.set('player-boxscores-current', JSON.stringify(currentBoxscores), {
      metadata: { 
        uploadedAt: new Date().toISOString(),
        entries: currentBoxscores.length,
        dateRange: 'Jan 2025+'
      }
    });
    
    const result = {
      success: true,
      message: 'Blobs seeded successfully',
      historical: {
        entries: historicalBoxscores.length,
        dateRange: 'Oct-Dec 2024'
      },
      current: {
        entries: currentBoxscores.length,
        dateRange: 'Jan 2025+'
      },
      total: boxscores.length
    };
    
    console.log('✅ SUCCESS!', result);
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Seed failed:', error);
    return new Response(JSON.stringify({ 
      error: 'Seed failed', 
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  path: '/seed-blobs-from-local'
};
