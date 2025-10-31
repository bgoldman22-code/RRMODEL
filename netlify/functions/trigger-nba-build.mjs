/**
 * Trigger Netlify Build via Build Hook
 * 
 * This function triggers a Netlify build which will:
 * 1. Run the local generator script in CI
 * 2. Update public/data/nba-player-props-live.json
 * 3. Deploy the new static file
 * 
 * Schedule this to run after picks are generated
 * 
 * Requires: NETLIFY_BUILD_HOOK environment variable
 */

import fetch from 'node-fetch';

export default async (req, context) => {
  const buildHook = process.env.NETLIFY_BUILD_HOOK;
  
  if (!buildHook) {
    return new Response(JSON.stringify({
      error: 'NETLIFY_BUILD_HOOK not configured'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    console.log('🔄 Triggering Netlify build to update NBA picks...');
    
    const response = await fetch(buildHook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    if (!response.ok) {
      throw new Error(`Build hook failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    console.log('✅ Build triggered successfully');
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Build triggered - NBA picks will update in ~2 minutes',
      buildId: result.id,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  schedule: "0 12 * * *"  // Daily at 12:00 PM UTC (8:00 AM EDT) - 1 hour after boxscores update
};
