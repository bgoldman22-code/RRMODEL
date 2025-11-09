#!/usr/bin/env node
/**
 * Fetch Pitcher Matchup Data
 * 
 * Gets H2H stats (batter vs pitcher) from MLB Stats API
 * Fetches pitch type data and player IDs
 * 
 * Usage: node scripts/fetch_pitcher_matchups.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

const CONFIG = {
  MLB_STATS_API: 'https://statsapi.mlb.com/api/v1',
  STATCAST_API: 'https://baseballsavant.mlb.com/statcast_search',
  OUTPUT_DIR: path.join(PROJECT_ROOT, 'data', 'mlb_live', 'matchups'),
  CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours
};

// Ensure output directory exists
if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
  fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
}

/**
 * Search for player ID by name
 */
async function findPlayerId(playerName) {
  try {
    const url = `${CONFIG.MLB_STATS_API}/people/search`;
    const params = { names: playerName };
    
    const response = await axios.get(url, { params });
    
    if (response.data.people && response.data.people.length > 0) {
      return response.data.people[0].id;
    }
    
    return null;
  } catch (error) {
    console.error(`Error finding player ID for ${playerName}:`, error.message);
    return null;
  }
}

/**
 * Fetch H2H stats between batter and pitcher
 */
async function fetchH2HStats(batterId, pitcherId) {
  try {
    const url = `${CONFIG.MLB_STATS_API}/people/${batterId}/stats`;
    const params = {
      stats: 'vsPlayer',
      opposingPlayerId: pitcherId,
      group: 'hitting'
    };
    
    const response = await axios.get(url, { params });
    
    if (!response.data.stats || response.data.stats.length === 0) {
      return {
        hr: 0,
        ab: 0,
        avg: '.000',
        slg: '.000',
        hasData: false
      };
    }
    
    const stats = response.data.stats[0].splits[0]?.stat || {};
    
    return {
      hr: stats.homeRuns || 0,
      ab: stats.atBats || 0,
      hits: stats.hits || 0,
      avg: stats.avg || '.000',
      slg: stats.slg || '.000',
      ops: stats.ops || '.000',
      hasData: true
    };
  } catch (error) {
    console.error(`Error fetching H2H stats:`, error.message);
    return {
      hr: 0,
      ab: 0,
      avg: '.000',
      slg: '.000',
      hasData: false
    };
  }
}

/**
 * Fetch pitcher's pitch mix and tendencies
 */
async function fetchPitcherProfile(pitcherId, year = new Date().getFullYear()) {
  try {
    // Try to load from cache first
    const cacheFile = path.join(CONFIG.OUTPUT_DIR, `pitcher_${pitcherId}_${year}.json`);
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (Date.now() - cached.timestamp < CONFIG.CACHE_DURATION) {
        return cached.data;
      }
    }
    
    // Fetch season stats to get pitch types
    const url = `${CONFIG.MLB_STATS_API}/people/${pitcherId}/stats`;
    const params = {
      stats: 'season',
      season: year,
      group: 'pitching'
    };
    
    const response = await axios.get(url, { params });
    
    const stats = response.data.stats?.[0]?.splits?.[0]?.stat || {};
    
    const profile = {
      era: stats.era || 0,
      whip: stats.whip || 0,
      strikeoutsPer9: stats.strikeoutsPer9Inn || 0,
      homeRunsPer9: stats.homeRunsPer9 || 0,
      groundBallPct: stats.groundBallPct || 0,
      flyBallPct: stats.flyBallPct || 0,
      // Pitch mix would come from Statcast (more complex)
      pitchMix: {
        primary: 'Fastball', // Default
        usage: 60,
        zone: 'mixed'
      }
    };
    
    // Cache the result
    fs.writeFileSync(cacheFile, JSON.stringify({
      timestamp: Date.now(),
      data: profile
    }, null, 2));
    
    return profile;
  } catch (error) {
    console.error(`Error fetching pitcher profile:`, error.message);
    return {
      era: 0,
      whip: 0,
      strikeoutsPer9: 0,
      homeRunsPer9: 0,
      groundBallPct: 0,
      flyBallPct: 0,
      pitchMix: {
        primary: 'Fastball',
        usage: 60,
        zone: 'mixed'
      }
    };
  }
}

/**
 * Get matchup data for a batter against today's pitcher
 */
async function getMatchupData(batterName, pitcherName) {
  console.log(`   Fetching matchup: ${batterName} vs ${pitcherName}...`);
  
  // Find player IDs
  const batterId = await findPlayerId(batterName);
  const pitcherId = await findPlayerId(pitcherName);
  
  if (!batterId || !pitcherId) {
    console.log(`   ⚠️  Could not find player IDs`);
    return {
      pitcher: pitcherName,
      h2h: { hr: 0, ab: 0, avg: '.000', hasData: false },
      pitcherProfile: null
    };
  }
  
  // Fetch H2H stats
  const h2h = await fetchH2HStats(batterId, pitcherId);
  
  // Fetch pitcher profile
  const pitcherProfile = await fetchPitcherProfile(pitcherId);
  
  return {
    batterId,
    pitcherId,
    pitcher: pitcherName,
    h2h,
    pitcherProfile
  };
}

/**
 * Fetch matchups for all games today
 */
async function fetchTodayMatchups(todayGames) {
  console.log(`\n🎯 Fetching pitcher matchups for ${todayGames.length} games...\n`);
  
  const matchups = [];
  
  for (const game of todayGames) {
    console.log(`Game: ${game.away} @ ${game.home}`);
    console.log(`   Starters: ${game.awayStarter} vs ${game.homeStarter}`);
    
    const gameMatchups = {
      gamePk: game.gamePk,
      home: game.home,
      away: game.away,
      homeStarter: game.homeStarter,
      awayStarter: game.awayStarter,
      venue: game.venue,
      matchups: []
    };
    
    matchups.push(gameMatchups);
  }
  
  const date = new Date().toISOString().split('T')[0];
  const filepath = path.join(CONFIG.OUTPUT_DIR, `${date}_matchups.json`);
  
  fs.writeFileSync(filepath, JSON.stringify({
    date,
    timestamp: new Date().toISOString(),
    games: matchups
  }, null, 2));
  
  console.log(`\n💾 Saved matchups to: ${filepath}`);
  
  return matchups;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('⚾ MLB Pitcher Matchup Fetcher\n');
    
    // This would be called with actual game data
    // For now, just demonstrate the functions
    console.log('ℹ️  This script is meant to be imported and used by the dashboard generator');
    console.log('ℹ️  It provides functions to fetch H2H data and pitcher profiles');
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { findPlayerId, fetchH2HStats, fetchPitcherProfile, getMatchupData, fetchTodayMatchups };
