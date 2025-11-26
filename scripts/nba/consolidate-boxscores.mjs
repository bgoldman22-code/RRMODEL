#!/usr/bin/env node
/**
 * Consolidate game-by-game JSON files into single player-history file
 * Input: data/nba/boxscores-raw/{season}/{gameId}.json
 * Output: data/nba/player-history-2024-2026.json
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🏀 Consolidating Boxscore Data');
console.log('=' . repeat(60));

const SEASONS = ['2024-25', '2025-26'];
const INPUT_DIR = path.join(__dirname, '../../data/nba/boxscores-raw');
const OUTPUT_FILE = path.join(__dirname, '../../data/nba/player-history-2024-2026.json');

const allBoxscores = [];
let gamesProcessed = 0;
let errors = 0;

for (const season of SEASONS) {
  const seasonDir = path.join(INPUT_DIR, season);
  console.log(`\n📅 Processing ${season} season...`);
  
  const gameFiles = readdirSync(seasonDir).filter(f => f.endsWith('.json'));
  console.log(`   Found ${gameFiles.length} games`);
  
  let seasonGames = 0;
  
  for (const gameFile of gameFiles) {
    try {
      const gamePath = path.join(seasonDir, gameFile);
      const gameData = JSON.parse(readFileSync(gamePath, 'utf-8'));
      
      const gameDate = gameData.gameDate;
      const gameId = gameData.gameId;
      
      // Process home team players
      if (gameData.home && gameData.home.players) {
        for (const player of gameData.home.players) {
          allBoxscores.push({
            playerName: player.name,
            playerId: player.playerId,
            gameDate: gameDate,
            gameId: gameId,
            season: season,
            teamTricode: gameData.home.teamTricode || 'UNK',
            opponentTricode: gameData.away.teamTricode || 'UNK',
            isHome: true,
            minutes: player.stats.min || 0,
            points: player.stats.pts || 0,
            rebounds: player.stats.reb || 0,
            assists: player.stats.ast || 0,
            steals: player.stats.stl || 0,
            blocks: player.stats.blk || 0,
            turnovers: player.stats.tov || 0,
            fouls: player.stats.pf || 0,
            fgMade: player.stats.fgm || 0,
            fgAtt: player.stats.fga || 0,
            fg3Made: player.stats.fg3m || 0,
            fg3Att: player.stats.fg3a || 0,
            ftMade: player.stats.ftm || 0,
            ftAtt: player.stats.fta || 0,
            oreb: player.stats.oreb || 0,
            dreb: player.stats.dreb || 0
          });
        }
      }
      
      // Process away team players
      if (gameData.away && gameData.away.players) {
        for (const player of gameData.away.players) {
          allBoxscores.push({
            playerName: player.name,
            playerId: player.playerId,
            gameDate: gameDate,
            gameId: gameId,
            season: season,
            teamTricode: gameData.away.teamTricode || 'UNK',
            opponentTricode: gameData.home.teamTricode || 'UNK',
            isHome: false,
            minutes: player.stats.min || 0,
            points: player.stats.pts || 0,
            rebounds: player.stats.reb || 0,
            assists: player.stats.ast || 0,
            steals: player.stats.stl || 0,
            blocks: player.stats.blk || 0,
            turnovers: player.stats.tov || 0,
            fouls: player.stats.pf || 0,
            fgMade: player.stats.fgm || 0,
            fgAtt: player.stats.fga || 0,
            fg3Made: player.stats.fg3m || 0,
            fg3Att: player.stats.fg3a || 0,
            ftMade: player.stats.ftm || 0,
            ftAtt: player.stats.fta || 0,
            oreb: player.stats.oreb || 0,
            dreb: player.stats.dreb || 0
          });
        }
      }
      
      seasonGames++;
      gamesProcessed++;
      
      if (gamesProcessed % 100 === 0) {
        process.stdout.write(`\r   Progress: ${gamesProcessed} games processed...`);
      }
      
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error(`\n   ⚠️  Error processing ${gameFile}: ${err.message}`);
      }
    }
  }
  
  console.log(`\n   ✅ ${season}: ${seasonGames} games, ${allBoxscores.length} total player-games`);
}

console.log('\n' + '='.repeat(60));
console.log('📊 Consolidation Complete');
console.log('='.repeat(60));
console.log(`Total games processed: ${gamesProcessed}`);
console.log(`Total player-game records: ${allBoxscores.length}`);
console.log(`Errors: ${errors}`);

// Sort by date (most recent first)
console.log('\n📋 Sorting by date...');
allBoxscores.sort((a, b) => b.gameDate.localeCompare(a.gameDate));

// Get date range
const dates = allBoxscores.map(b => b.gameDate).sort();
const dateRange = {
  earliest: dates[0],
  latest: dates[dates.length - 1]
};
console.log(`   Date range: ${dateRange.earliest} → ${dateRange.latest}`);

// Verify data quality with sample
console.log('\n🔍 Sample record (most recent):');
const sample = allBoxscores[0];
console.log(`   Player: ${sample.playerName}`);
console.log(`   Date: ${sample.gameDate}`);
console.log(`   Stats: ${sample.points}p / ${sample.rebounds}r / ${sample.assists}a`);
console.log(`   Minutes: ${sample.minutes}`);

// Save
console.log(`\n💾 Saving to ${OUTPUT_FILE}...`);
writeFileSync(OUTPUT_FILE, JSON.stringify(allBoxscores, null, 2));

const fileSizeMB = (JSON.stringify(allBoxscores).length / (1024 * 1024)).toFixed(1);
console.log(`   ✅ Saved ${allBoxscores.length} records (${fileSizeMB} MB)`);

console.log('\n✅ COMPLETE - Ready for Phase 3.5!');
console.log('='.repeat(60));
