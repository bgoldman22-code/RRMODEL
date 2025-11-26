import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const boxscoresPath = path.join(__dirname, 'data/nba/boxscores_merged.json');
const multiSeasonData = JSON.parse(readFileSync(boxscoresPath, 'utf-8'));
const allBoxscores = multiSeasonData.games || multiSeasonData;

// Normalize
allBoxscores.forEach(g => {
  if (g.player_name && !g.playerName) g.playerName = g.player_name;
});

// Test lookup
const lebron = allBoxscores.filter(g => g.playerName === 'LeBron James');
console.log('LeBron James games found:', lebron.length);
const sorted = lebron.sort((a,b) => b.date.localeCompare(a.date));
console.log('Latest LeBron game:', sorted[0]);

// Test for today's players
const recent = allBoxscores.filter(g => g.date >= '2025-11-20');
console.log('\nRecent games (Nov 20+):', recent.length);
const recentPlayers = [...new Set(recent.map(g => g.playerName))].sort().slice(0, 10);
console.log('Recent player sample:', recentPlayers);

// Check a sample prop from recent data
const jalen = allBoxscores.filter(g => g.playerName === 'Jalen Johnson' && g.date >= '2025-11-20');
console.log('\nJalen Johnson recent games:', jalen.length);
jalen.forEach(g => console.log(`  ${g.date}: ${g.points}p ${g.rebounds}r ${g.assists}a`));
