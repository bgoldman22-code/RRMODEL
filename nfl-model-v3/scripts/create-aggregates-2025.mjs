#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = './data/nflverse';

function parseCSVLine(line, headers) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  
  const obj = {};
  headers.forEach((header, index) => {
    obj[header] = values[index] || null;
  });
  return obj;
}

async function createGameAggregates() {
  console.log('📊 Creating game aggregates for 2025...');
  
  const pbpFile = path.join(OUTPUT_DIR, 'pbp_2025.csv');
  const pbpData = await fs.readFile(pbpFile, 'utf-8');
  const lines = pbpData.split('\n');
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const gameStats = {};
  
  console.log(`   Processing ${lines.length.toLocaleString()} plays...`);
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const play = parseCSVLine(lines[i], headers);
    const gameId = play.game_id;
    
    if (!gameId) continue;
    
    if (!gameStats[gameId]) {
      gameStats[gameId] = {
        game_id: gameId,
        season: play.season,
        week: play.week,
        home_team: play.home_team,
        away_team: play.away_team,
        home_score: 0,
        away_score: 0,
        plays: 0,
        home_epa: 0,
        away_epa: 0,
        home_success_plays: 0,
        away_success_plays: 0,
        home_explosive_plays: 0,
        away_explosive_plays: 0
      };
    }
    
    const stats = gameStats[gameId];
    stats.plays++;
    
    if (play.total_home_score) stats.home_score = parseInt(play.total_home_score);
    if (play.total_away_score) stats.away_score = parseInt(play.total_away_score);
    
    const epa = parseFloat(play.epa) || 0;
    const yards = parseFloat(play.yards_gained) || 0;
    
    if (play.posteam === play.home_team) {
      stats.home_epa += epa;
      if (play.success === '1') stats.home_success_plays++;
      if (yards >= 20) stats.home_explosive_plays++;
    } else if (play.posteam === play.away_team) {
      stats.away_epa += epa;
      if (play.success === '1') stats.away_success_plays++;
      if (yards >= 20) stats.away_explosive_plays++;
    }
  }
  
  const games = Object.values(gameStats).map(g => ({
    ...g,
    home_epa_per_play: g.home_epa / (g.plays / 2),
    away_epa_per_play: g.away_epa / (g.plays / 2),
    home_success_rate: g.home_success_plays / (g.plays / 2),
    away_success_rate: g.away_success_plays / (g.plays / 2),
    home_explosive_rate: g.home_explosive_plays / (g.plays / 2),
    away_explosive_rate: g.away_explosive_plays / (g.plays / 2)
  }));
  
  // Sort by week
  games.sort((a, b) => parseInt(a.week) - parseInt(b.week));
  
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'game_aggregates_2025.json'),
    JSON.stringify(games, null, 2)
  );
  
  const weeks = games.map(g => parseInt(g.week));
  console.log(`✅ Created ${games.length} game aggregates`);
  console.log(`   Weeks: ${Math.min(...weeks)}-${Math.max(...weeks)}`);
}

await createGameAggregates();
