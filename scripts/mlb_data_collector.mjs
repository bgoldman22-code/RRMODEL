/**
 * MLB HR Round Robin - Historical Data Collector
 * Collects 2021-2025 game data, Statcast HR events, player stats
 * Runs in background with progress tracking
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data', 'mlb_historical');

// Ensure data directories exist
const DIRS = {
  games: path.join(DATA_DIR, 'games'),
  statcast: path.join(DATA_DIR, 'statcast'),
  players: path.join(DATA_DIR, 'players'),
  odds: path.join(DATA_DIR, 'odds'),
  processed: path.join(DATA_DIR, 'processed')
};

Object.values(DIRS).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const YEARS = [2021, 2022, 2023, 2024, 2025];
const MLB_STATS_API_BASE = 'https://statsapi.mlb.com/api/v1.1';

/**
 * Progress tracking
 */
class ProgressTracker {
  constructor(name, total) {
    this.name = name;
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
    this.errors = [];
  }

  increment(itemName = '') {
    this.current++;
    const pct = ((this.current / this.total) * 100).toFixed(1);
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const rate = (this.current / (elapsed / 60)).toFixed(1);
    
    process.stdout.write(
      `\r${this.name}: ${this.current}/${this.total} (${pct}%) | ` +
      `${elapsed}s elapsed | ${rate}/min | ${itemName}`.padEnd(100)
    );
  }

  error(itemName, error) {
    this.errors.push({ item: itemName, error: error.message });
    console.error(`\n❌ Error processing ${itemName}: ${error.message}`);
  }

  complete() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`\n✅ ${this.name} complete: ${this.current}/${this.total} in ${elapsed}s`);
    if (this.errors.length > 0) {
      console.log(`⚠️  ${this.errors.length} errors encountered`);
    }
  }
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

/**
 * PHASE 1: Collect MLB Schedule & Game Data
 */
async function collectGameData(year) {
  console.log(`\n📅 Collecting ${year} MLB schedule...`);
  
  try {
    // Fetch season schedule (v1 endpoint still works for schedule)
    const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${year}&gameType=R`;
    const scheduleData = await fetchWithRetry(scheduleUrl);
    
    const allGames = [];
    for (const date of scheduleData.dates || []) {
      for (const game of date.games || []) {
        allGames.push({
          gameDate: date.date,
          gamePk: game.gamePk,
          status: game.status.detailedState,
          home: game.teams.home.team.name,
          away: game.teams.away.team.name,
          venue: game.venue?.name
        });
      }
    }
    
    console.log(`   Found ${allGames.length} games for ${year}`);
    
    // Save schedule
    const scheduleFile = path.join(DIRS.games, `${year}_schedule.json`);
    fs.writeFileSync(scheduleFile, JSON.stringify(allGames, null, 2));
    
    // Fetch detailed game data (with HRs)
    const finalGames = allGames.filter(g => g.status === 'Final');
    const tracker = new ProgressTracker(`${year} Game Details`, finalGames.length);
    
    const gamesWithDetails = [];
    
    for (const game of finalGames) {
      try {
        const gameUrl = `${MLB_STATS_API_BASE}/game/${game.gamePk}/feed/live`;
        const gameData = await fetchWithRetry(gameUrl);
        
        // Extract HRs from play-by-play
        const hrs = [];
        const plays = gameData.liveData?.plays?.allPlays || [];
        
        for (const play of plays) {
          if (play.result?.eventType === 'home_run') {
            hrs.push({
              batter: play.matchup?.batter?.fullName,
              batterId: play.matchup?.batter?.id,
              pitcher: play.matchup?.pitcher?.fullName,
              pitcherId: play.matchup?.pitcher?.id,
              inning: play.about?.inning,
              halfInning: play.about?.halfInning,
              pitchSequence: play.playEvents?.map(e => e.details?.type?.description).filter(Boolean)
            });
          }
        }
        
        // Extract starting pitchers
        const boxscore = gameData.liveData?.boxscore;
        const homeStarter = boxscore?.teams?.home?.pitchers?.[0];
        const awayStarter = boxscore?.teams?.away?.pitchers?.[0];
        
        gamesWithDetails.push({
          ...game,
          homeStarter: homeStarter ? boxscore.teams.home.players[`ID${homeStarter}`]?.person?.fullName : null,
          awayStarter: awayStarter ? boxscore.teams.away.players[`ID${awayStarter}`]?.person?.fullName : null,
          homeScore: gameData.liveData?.linescore?.teams?.home?.runs,
          awayScore: gameData.liveData?.linescore?.teams?.away?.runs,
          hrs: hrs
        });
        
        tracker.increment(`${game.away} @ ${game.home}`);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        tracker.error(`Game ${game.gamePk}`, error);
      }
    }
    
    tracker.complete();
    
    // Save detailed games
    const detailsFile = path.join(DIRS.games, `${year}_games_detailed.json`);
    fs.writeFileSync(detailsFile, JSON.stringify(gamesWithDetails, null, 2));
    
    const totalHRs = gamesWithDetails.reduce((sum, g) => sum + g.hrs.length, 0);
    console.log(`   ✅ ${year}: ${gamesWithDetails.length} games, ${totalHRs} HRs recorded\n`);
    
    return gamesWithDetails;
    
  } catch (error) {
    console.error(`❌ Error collecting ${year} data:`, error.message);
    return [];
  }
}

/**
 * PHASE 2: Prepare for Statcast data
 * (Will use Python/pybaseball - creating placeholder)
 */
async function prepareStatcastCollection() {
  console.log(`\n📊 Preparing Statcast data collection...`);
  
  const pythonScript = `
# MLB HR RR - Statcast Data Collector
# Run this after installing: pip install pybaseball

import pybaseball as pyb
import pandas as pd
import json
from datetime import datetime, timedelta
import os

pyb.cache.enable()

YEARS = [2021, 2022, 2023, 2024, 2025]
OUTPUT_DIR = '${DIRS.statcast}'

def collect_statcast_hrs(year):
    """Collect all HR batted ball events for a year"""
    print(f"\\n📊 Collecting Statcast HRs for {year}...")
    
    start_date = f"{year}-03-01"
    end_date = f"{year}-11-30"
    
    # Fetch all statcast data (this takes a while!)
    print(f"   Fetching statcast data {start_date} to {end_date}...")
    data = pyb.statcast(start_dt=start_date, end_dt=end_date)
    
    # Filter to HRs only
    hrs = data[data['events'] == 'home_run'].copy()
    
    print(f"   Found {len(hrs)} HRs")
    
    # Select relevant columns
    hr_data = hrs[[
        'game_date', 'player_name', 'batter', 'pitcher', 
        'launch_speed', 'launch_angle', 'hit_distance_sc',
        'hc_x', 'hc_y', 'pitch_type', 'release_speed',
        'home_team', 'away_team', 'inning', 'outs_when_up',
        'description', 'zone', 'balls', 'strikes'
    ]].copy()
    
    # Save to JSON
    output_file = os.path.join(OUTPUT_DIR, f'{year}_statcast_hrs.json')
    hr_data.to_json(output_file, orient='records', indent=2)
    
    print(f"   ✅ Saved {len(hr_data)} HRs to {output_file}")
    
    return len(hr_data)

def collect_player_stats(year):
    """Collect player season stats"""
    print(f"\\n📈 Collecting player stats for {year}...")
    
    # Batting stats
    batting = pyb.batting_stats(year)
    batting_file = os.path.join('${DIRS.players}', f'{year}_batting.json')
    batting.to_json(batting_file, orient='records', indent=2)
    print(f"   ✅ Batting: {len(batting)} players")
    
    # Pitching stats
    pitching = pyb.pitching_stats(year)
    pitching_file = os.path.join('${DIRS.players}', f'{year}_pitching.json')
    pitching.to_json(pitching_file, orient='records', indent=2)
    print(f"   ✅ Pitching: {len(pitching)} players")
    
    return len(batting), len(pitching)

if __name__ == '__main__':
    print("=" * 60)
    print("MLB HR Round Robin - Statcast Data Collection")
    print("=" * 60)
    
    total_hrs = 0
    
    for year in YEARS:
        try:
            hrs = collect_statcast_hrs(year)
            total_hrs += hrs
            
            batting_count, pitching_count = collect_player_stats(year)
            
        except Exception as e:
            print(f"❌ Error with {year}: {e}")
    
    print(f"\\n✅ COMPLETE: {total_hrs} total HRs collected across {len(YEARS)} years")
`;

  const pythonFile = path.join(PROJECT_ROOT, 'scripts', 'collect_statcast_data.py');
  fs.writeFileSync(pythonFile, pythonScript);
  
  console.log(`   ✅ Created Python script: ${pythonFile}`);
  console.log(`   ⚠️  Run manually: python scripts/collect_statcast_data.py`);
  console.log(`   ⚠️  Requires: pip install pybaseball pandas`);
}

/**
 * PHASE 3: Create odds data structure
 */
async function createOddsStructure() {
  console.log(`\n💰 Creating odds data structure...`);
  
  const readmeContent = `
# Historical HR Odds Data

## Structure
\`\`\`
odds/
  2021/
    03-28.json  (Opening Day)
    03-29.json
    ...
  2022/
  2023/
  2024/
  2025/
\`\`\`

## Format
\`\`\`json
{
  "date": "2025-09-25",
  "lastUpdated": "2025-09-25T18:00:00Z",
  "players": [
    {
      "name": "Aaron Judge",
      "playerId": 592450,
      "team": "NYY",
      "opponent": "BAL",
      "isHome": true,
      "odds": {
        "fanduel": 300,
        "draftkings": 320,
        "betmgm": 310
      }
    }
  ]
}
\`\`\`

## Collection Status
- 2021: ⏳ Awaiting user's odds source
- 2022: ⏳ Awaiting user's odds source
- 2023: ⏳ Awaiting user's odds source
- 2024: ⏳ Awaiting user's odds source
- 2025: ⏳ Awaiting user's odds source

## Notes
User will provide method to retrieve historical odds.
TheOddsAPI mentioned as potential source.
`;

  const readmeFile = path.join(DIRS.odds, 'README.md');
  fs.writeFileSync(readmeFile, readmeContent);
  
  // Create year directories
  YEARS.forEach(year => {
    const yearDir = path.join(DIRS.odds, year.toString());
    if (!fs.existsSync(yearDir)) {
      fs.mkdirSync(yearDir, { recursive: true });
    }
  });
  
  console.log(`   ✅ Odds structure created at: ${DIRS.odds}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('MLB HR ROUND ROBIN - HISTORICAL DATA COLLECTOR');
  console.log('Collecting 2021-2025 data for comprehensive backtest');
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  
  // Phase 1: MLB Game Data (via MLB Stats API)
  console.log('\n📦 PHASE 1: MLB Game Data Collection');
  console.log('   Source: MLB Stats API (statsapi.mlb.com)');
  console.log('   Data: Schedules, scores, starting pitchers, HR events');
  
  const allGames = [];
  for (const year of YEARS) {
    const games = await collectGameData(year);
    allGames.push(...games);
  }
  
  // Phase 2: Statcast (via Python/pybaseball)
  console.log('\n📦 PHASE 2: Statcast HR Data');
  console.log('   Source: Baseball Savant (via pybaseball)');
  console.log('   Data: Exit velo, launch angle, spray charts, pitch types');
  await prepareStatcastCollection();
  
  // Phase 3: Odds Data Structure
  console.log('\n📦 PHASE 3: Historical Odds Data');
  console.log('   Source: TBD (awaiting user plan)');
  await createOddsStructure();
  
  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalHRs = allGames.reduce((sum, g) => sum + g.hrs.length, 0);
  
  console.log('\n' + '='.repeat(60));
  console.log('COLLECTION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Games collected: ${allGames.length}`);
  console.log(`✅ HRs recorded: ${totalHRs}`);
  console.log(`⚠️  Statcast data: Ready to collect (run Python script)`);
  console.log(`⚠️  Odds data: Awaiting user's collection method`);
  console.log(`⏱️  Total time: ${elapsed}s`);
  console.log('='.repeat(60));
  
  console.log('\n📋 NEXT STEPS:');
  console.log('   1. Run: python scripts/collect_statcast_data.py');
  console.log('   2. Provide method for historical odds collection');
  console.log('   3. Build RR simulator and backtest engine');
  console.log('');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { collectGameData, prepareStatcastCollection, createOddsStructure };
