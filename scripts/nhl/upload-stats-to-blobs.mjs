#!/usr/bin/env node

/**
 * Upload NHL Stats to Netlify Blobs
 * 
 * This uploads player and team stats to Netlify Blobs so the elite
 * projection engine can access them in production.
 */

import { getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function uploadStats() {
  try {
    console.log('🚀 Uploading NHL stats to Netlify Blobs...\n');
    
    // Get the nhl-stats store
    const store = getStore('nhl-stats');
    
    // Read player stats
    const playerStatsPath = path.join(__dirname, '../../data/nhl/player_stats_20242025.json');
    console.log(`📂 Reading player stats from: ${playerStatsPath}`);
    
    if (!fs.existsSync(playerStatsPath)) {
      throw new Error(`Player stats file not found: ${playerStatsPath}`);
    }
    
    const playerStatsRaw = fs.readFileSync(playerStatsPath, 'utf-8');
    const playerStats = JSON.parse(playerStatsRaw);
    
    console.log(`✅ Loaded ${playerStats.players?.length || 0} players`);
    
    // Upload player stats
    await store.set('player_stats_20242025', playerStats, {
      metadata: {
        uploaded: new Date().toISOString(),
        playerCount: playerStats.players?.length || 0
      }
    });
    
    console.log(`✅ Uploaded player stats to Netlify Blobs\n`);
    
    // Read team stats
    const teamStatsPath = path.join(__dirname, '../../data/nhl/team_stats_20242025.json');
    console.log(`📂 Reading team stats from: ${teamStatsPath}`);
    
    if (!fs.existsSync(teamStatsPath)) {
      throw new Error(`Team stats file not found: ${teamStatsPath}`);
    }
    
    const teamStatsRaw = fs.readFileSync(teamStatsPath, 'utf-8');
    const teamStats = JSON.parse(teamStatsRaw);
    
    console.log(`✅ Loaded ${Object.keys(teamStats.teams || {}).length} teams`);
    
    // Upload team stats
    await store.set('team_stats_20242025', teamStats, {
      metadata: {
        uploaded: new Date().toISOString(),
        teamCount: Object.keys(teamStats.teams || {}).length
      }
    });
    
    console.log(`✅ Uploaded team stats to Netlify Blobs\n`);
    
    // Verify
    console.log('🔍 Verifying upload...');
    const playerVerify = await store.get('player_stats_20242025', { type: 'json' });
    const teamVerify = await store.get('team_stats_20242025', { type: 'json' });
    
    console.log(`✅ Player stats verified: ${playerVerify?.players?.length || 0} players`);
    console.log(`✅ Team stats verified: ${Object.keys(teamVerify?.teams || {}).length} teams`);
    
    console.log('\n🎉 Upload complete! Elite model can now access player/team stats.');
    
  } catch (error) {
    console.error('\n❌ Upload failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

uploadStats();
