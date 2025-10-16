#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════
 * BUILD ESPN PLAYER ID MAPPING
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Creates a mapping file between player names and ESPN athlete IDs.
 * Run this ONCE to build the mapping, then use it for fast lookups.
 * 
 * USAGE:
 * node scripts/nba/build-player-id-mapping.mjs
 * 
 * ═══════════════════════════════════════════════════════════════════
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  ESPN_BASE: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba',
  SEASON_DATA: path.join(__dirname, '../../data/nba/players/archive/player_seasons_2024_25.json'),
  OUTPUT: path.join(__dirname, '../../data/nba/player-id-mapping.json'),
  RATE_LIMIT_MS: 300
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchPlayer(playerName) {
  const url = `${CONFIG.ESPN_BASE}/athletes?search=${encodeURIComponent(playerName)}&limit=5`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    const athletes = data?.athletes || [];
    
    if (athletes.length === 0) return null;
    
    // Find best match
    const exactMatch = athletes.find(a => 
      a.displayName?.toLowerCase() === playerName.toLowerCase() ||
      a.fullName?.toLowerCase() === playerName.toLowerCase()
    );
    
    const player = exactMatch || athletes[0];
    
    return {
      name: playerName,
      espnId: player.id,
      espnName: player.displayName,
      team: player.team?.abbreviation || 'UNK'
    };
    
  } catch (error) {
    console.error(`Failed to search ${playerName}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🏀 Building ESPN Player ID Mapping...\n');
  
  // Load players
  const data = await fs.readFile(CONFIG.SEASON_DATA, 'utf-8');
  const players = JSON.parse(data);
  
  const activePlayers = players.filter(p => {
    const mpg = p.minutes_played / (p.games_played || 1);
    return mpg >= 10 && p.games_played >= 3;
  });
  
  console.log(`Found ${activePlayers.length} active players\n`);
  
  const mapping = {};
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < activePlayers.length; i++) {
    const player = activePlayers[i];
    const progress = `[${i + 1}/${activePlayers.length}]`;
    
    console.log(`${progress} ${player.player}...`);
    
    const result = await searchPlayer(player.player);
    await sleep(CONFIG.RATE_LIMIT_MS);
    
    if (result) {
      mapping[player.player] = result.espnId;
      console.log(`  ✅ ${result.espnName} → ${result.espnId}`);
      success++;
    } else {
      console.log(`  ❌ Not found`);
      failed++;
    }
  }
  
  // Save mapping
  await fs.writeFile(CONFIG.OUTPUT, JSON.stringify(mapping, null, 2));
  
  console.log(`\n✅ Mapping saved: ${CONFIG.OUTPUT}`);
  console.log(`📊 Success: ${success}, Failed: ${failed}\n`);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
