#!/usr/bin/env node
/**
 * Merge multiseason historical data with current season data
 * Creates a complete dataset for Phase 3.5 predictions
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('📦 Merging boxscore datasets...');

// Load multiseason data (historical)
const multiSeasonPath = path.join(__dirname, '../../data/nba/boxscores_multiseason_2022_26_v1.json');
const multiSeasonData = JSON.parse(readFileSync(multiSeasonPath, 'utf-8'));
const historicalGames = multiSeasonData.games || [];
console.log(`✅ Loaded ${historicalGames.length} historical games (ends ${multiSeasonData.date_range?.latest})`);

// Load current season data
const currentPath = path.join(__dirname, '../../data/nba/player-boxscores-2025-26.json');
const currentGames = JSON.parse(readFileSync(currentPath, 'utf-8'));
console.log(`✅ Loaded ${currentGames.length} current season games`);

// Normalize current season to historical format
const normalizedCurrent = currentGames.map(g => ({
  player_name: g.playerName,
  date: g.gameDate,
  points: g.pts,
  rebounds: g.reb,
  assists: g.ast,
  steals: g.stl,
  blocks: g.blk,
  turnovers: g.tov,
  minutes: parseFloat(g.min) || 0,
  fga: g.fga,
  fgm: g.fgm,
  fg_pct: g.fg_pct,
  fg3a: g.fg3a,
  fg3m: g.fg3m,
  fg3_pct: g.fg3_pct,
  fta: g.fta,
  ftm: g.ftm,
  ft_pct: g.ft_pct,
  oreb: g.oreb,
  dreb: g.dreb,
  fouls: g.pf,
  plus_minus: g.plus_minus,
  team: g.teamAbbreviation,
  opponent: g.matchup?.includes('@') ? g.matchup.split('@')[1].trim() : g.matchup?.split('vs.')[1]?.trim(),
  home: g.matchup?.includes('vs.') || false,
  season: g.season || '2025-26',
  game_id: g.gameId
}));

// Find latest date in historical data
const latestHistorical = historicalGames.reduce((max, g) => 
  g.date > max ? g.date : max, '2000-01-01');

// Only add games newer than historical data
const newGames = normalizedCurrent.filter(g => g.date > latestHistorical);
console.log(`📊 Found ${newGames.length} new games after ${latestHistorical}`);

// Merge datasets
const mergedGames = [...historicalGames, ...newGames];
console.log(`✅ Merged total: ${mergedGames.length} games`);

// Find new date range
const dates = mergedGames.map(g => g.date).sort();
const dateRange = {
  earliest: dates[0],
  latest: dates[dates.length - 1]
};

// Create output
const output = {
  ...multiSeasonData,
  games: mergedGames,
  total_games: mergedGames.length,
  date_range: dateRange,
  last_updated: new Date().toISOString()
};

// Write merged file
const outputPath = path.join(__dirname, '../../data/nba/boxscores_merged.json');
writeFileSync(outputPath, JSON.stringify(output));
console.log(`✅ Wrote merged data to ${outputPath}`);
console.log(`📅 Date range: ${dateRange.earliest} to ${dateRange.latest}`);
