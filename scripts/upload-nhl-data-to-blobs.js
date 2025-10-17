#!/usr/bin/env node
/**
 * Upload NHL player/team stats to Netlify Blobs
 * Run: node scripts/upload-nhl-data-to-blobs.js
 * 
 * This solves the 502 error issue by storing data in Netlify Blobs
 * instead of trying to read from file system in Lambda environment.
 */

import { getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function uploadNHLData() {
  try {
    console.log('🏒 Uploading NHL data to Netlify Blobs...\n');
    
    // Initialize Netlify Blobs store
    const store = getStore({
      name: 'nhl-stats',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN
    });
    
    // Read player stats
    const playerStatsPath = path.join(__dirname, '../data/nhl/player_stats_20242025.json');
    if (!fs.existsSync(playerStatsPath)) {
      throw new Error(`Player stats file not found: ${playerStatsPath}`);
    }
    
    const playerStats = JSON.parse(fs.readFileSync(playerStatsPath, 'utf8'));
    console.log(`📊 Read player stats: ${playerStats.players?.length || 0} players`);
    
    // Upload player stats
    await store.set('player_stats_20242025', JSON.stringify(playerStats));
    console.log('✅ Uploaded player stats to Netlify Blobs\n');
    
    // Read team stats
    const teamStatsPath = path.join(__dirname, '../data/nhl/team_stats_20242025.json');
    if (!fs.existsSync(teamStatsPath)) {
      throw new Error(`Team stats file not found: ${teamStatsPath}`);
    }
    
    const teamStats = JSON.parse(fs.readFileSync(teamStatsPath, 'utf8'));
    console.log(`📊 Read team stats: ${Object.keys(teamStats.teams || {}).length} teams`);
    
    // Upload team stats
    await store.set('team_stats_20242025', JSON.stringify(teamStats));
    console.log('✅ Uploaded team stats to Netlify Blobs\n');
    
    console.log('🎉 SUCCESS! NHL data uploaded to Netlify Blobs');
    console.log('   Store name: nhl-stats');
    console.log('   Keys: player_stats_20242025, team_stats_20242025');
    console.log('\nNext: Elite NHL scanner will now work without 502 errors!');
    
  } catch (error) {
    console.error('❌ Error uploading NHL data:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the upload
uploadNHLData();
