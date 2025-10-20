/**
 * ONE-TIME SETUP: Upload NHL Stats to Netlify Blobs
 * 
 * Call this function ONCE after deploying to populate the Blobs store.
 * URL: /.netlify/functions/nhl-setup-blobs
 * 
 * This reads the stats from GitHub and uploads them to Netlify Blobs.
 */

import { getStore } from '@netlify/blobs';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  
  try {
    console.log('🚀 NHL Blobs Setup - Starting data upload...');
    
    // Fetch player stats from GitHub raw
    const playerStatsUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main41/data/nhl/player_stats_20242025.json';
    console.log(`📥 Fetching player stats from GitHub...`);
    
    const playerResponse = await fetch(playerStatsUrl);
    if (!playerResponse.ok) {
      throw new Error(`Failed to fetch player stats: ${playerResponse.status}`);
    }
    
    const playerStats = await playerResponse.json();
    console.log(`✅ Loaded ${playerStats.players?.length || 0} players`);
    
    // Fetch team stats from GitHub raw
    const teamStatsUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main41/data/nhl/team_stats_20242025.json';
    console.log(`📥 Fetching team stats from GitHub...`);
    
    const teamResponse = await fetch(teamStatsUrl);
    if (!teamResponse.ok) {
      throw new Error(`Failed to fetch team stats: ${teamResponse.status}`);
    }
    
    const teamStats = await teamResponse.json();
    console.log(`✅ Loaded ${Object.keys(teamStats.teams || {}).length} teams`);
    
    // Get Blobs store
    const store = getStore('nhl-stats');
    
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
