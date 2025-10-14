#!/usr/bin/env node

/**
 * Upload NBA Game Data to Netlify Blobs
 * This way functions can access it without file bundling issues
 */

import { getStore } from '@netlify/blobs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function uploadData() {
  console.log('📦 Uploading NBA data to Netlify Blobs...\n');
  
  const store = getStore('nba-data');
  
  // Upload current season games
  const currentSeasonPath = path.join(__dirname, '../data/nba/games/games_2024_25.json');
  const currentSeasonData = await fs.readFile(currentSeasonPath, 'utf8');
  const currentSeasonGames = JSON.parse(currentSeasonData);
  
  console.log(`📊 Current season: ${currentSeasonGames.length} games`);
  
  await store.set('games_2024_25', currentSeasonData, {
    metadata: {
      season: '2024-25',
      games: currentSeasonGames.length,
      updated: new Date().toISOString()
    }
  });
  
  console.log('✅ Uploaded games_2024_25.json to blob storage\n');
  
  // Check if we have previous seasons
  const seasons = ['2023_24', '2022_23'];
  
  for (const season of seasons) {
    const seasonPath = path.join(__dirname, `../data/nba/games/games_${season}.json`);
    try {
      const seasonData = await fs.readFile(seasonPath, 'utf8');
      const seasonGames = JSON.parse(seasonData);
      
      await store.set(`games_${season}`, seasonData, {
        metadata: {
          season: season.replace('_', '-'),
          games: seasonGames.length,
          updated: new Date().toISOString()
        }
      });
      
      console.log(`✅ Uploaded games_${season}.json (${seasonGames.length} games)`);
    } catch (error) {
      console.log(`⚠️  Skipping games_${season}.json (not found)`);
    }
  }
  
  console.log('\n🎉 All data uploaded to Netlify Blobs!');
  console.log('   Functions can now access via getStore("nba-data")');
}

uploadData().catch(console.error);
