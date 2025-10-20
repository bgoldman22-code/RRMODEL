/**
 * ONE-TIME SETUP: Upload NHL Stats to Netlify Blobs
 * 
 * Call this function ONCE after deploying to populate the Blobs store.
 * URL: /.netlify/functions/nhl-setup-blobs
 * 
 * This reads the stats from GitHub and uploads them to Netlify Blobs.
 */

import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  try {
    console.log('🚀 Starting NHL Blobs setup...');
    
    // Initialize Blobs store (use same pattern as _blobs.mjs helper)
    const storeName = 'nhl-stats';
    let store;
    
    try {
      // Prefer implicit runtime context on Netlify Functions
      console.log('⚙️ Trying automatic Netlify runtime context...');
      store = getStore({ name: storeName });
      console.log('✅ Using automatic Blobs context');
    } catch (err) {
      console.log('⚠️ Automatic context failed, trying explicit credentials...');
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
      
      if (!siteID || !token) {
        const details = `HAS_SITE_ID=${!!siteID}, HAS_TOKEN=${!!token}`;
        throw new Error(`Blobs unavailable. Detail: ${err?.name||''} ${err?.message||err} • ${details}`);
      }
      
      store = getStore({ name: storeName, siteID, token });
      console.log('✅ Using explicit Blobs credentials');
    }
    
    // Upload player stats
    await store.set('player_stats_20242025', playerStats, {
      metadata: {
        uploaded: new Date().toISOString(),
        playerCount: playerStats.players?.length || 0,
        source: 'github-main41'
      }
    });
    console.log(`✅ Uploaded player stats to Netlify Blobs`);
    
    // Upload team stats
    await store.set('team_stats_20242025', teamStats, {
      metadata: {
        uploaded: new Date().toISOString(),
        teamCount: Object.keys(teamStats.teams || {}).length,
        source: 'github-main41'
      }
    });
    console.log(`✅ Uploaded team stats to Netlify Blobs`);
    
    // Verify
    const playerVerify = await store.get('player_stats_20242025', { type: 'json' });
    const teamVerify = await store.get('team_stats_20242025', { type: 'json' });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '🎉 NHL stats uploaded to Netlify Blobs successfully!',
        data: {
          players: playerVerify?.players?.length || 0,
          teams: Object.keys(teamVerify?.teams || {}).length,
          uploaded: new Date().toISOString()
        },
        nextSteps: [
          'Elite model is now ready to use',
          'Visit /.netlify/functions/nhl-sog-scanner-elite-fast to test',
          'This setup function can be deleted after first run'
        ]
      }, null, 2)
    };
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Failed to upload NHL stats to Blobs',
        troubleshooting: [
          'Check that data files exist in GitHub: data/nhl/player_stats_20242025.json',
          'Verify Netlify Blobs is enabled for this site',
          'Check Netlify function logs for details'
        ]
      }, null, 2)
    };
  }
}
