/**
 * Quick Test - NHL Elite Training (Small Sample)
 * 
 * Tests the training pipeline on a small dataset (~100 players)
 * Use this to verify everything works before running full 1-2 hour pipeline
 * 
 * Run: node scripts/nhl/quick-test-training.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NHL_API_BASE = 'https://api-web.nhle.com/v1';
const DELAY_MS = 100;
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Test with just a few top players
const TEST_PLAYERS = [
  8478402, // Connor McDavid
  8479318, // Auston Matthews
  8476453, // Nathan MacKinnon
  8477492, // Leon Draisaitl
  8478483, // Mikko Rantanen
  8480012, // Cale Makar
  8478550, // David Pastrnak
  8479325, // Mitch Marner
  8476881, // Nikita Kucherov
  8478427, // Matthew Tkachuk
  8479407, // Jack Hughes
  8479344, // Elias Pettersson
  8480069, // Quinn Hughes
  8475791, // Roman Josi
  8476891, // Victor Hedman
  8478458, // Kirill Kaprizov
  8479337, // Tim Stutzle
  8476459, // Johnny Gaudreau
  8477934, // Sebastian Aho
  8477933, // Timo Meier
];

const SEASONS = ['20232024', '20242025'];

/**
 * Fetch player info
 */
async function fetchPlayerInfo(playerId) {
  const url = `${NHL_API_BASE}/player/${playerId}/landing`;
  
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    
    const data = await resp.json();
    return {
      id: playerId,
      name: `${data.firstName?.default || ''} ${data.lastName?.default || ''}`.trim(),
      position: data.position,
      teamAbbrev: data.currentTeamAbbrev
    };
  } catch (error) {
    return null;
  }
}

/**
 * Fetch game log
 */
async function fetchPlayerGameLog(playerId, season) {
  const url = `${NHL_API_BASE}/player/${playerId}/game-log/${season}/2`;
  
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    
    const data = await resp.json();
    return data.gameLog || [];
  } catch (error) {
    return [];
  }
}

/**
 * Parse TOI
 */
function parseToiMinutes(toiString) {
  if (!toiString || toiString === '0:00') return 0;
  const [mins, secs] = toiString.split(':').map(Number);
  return mins + (secs / 60);
}

/**
 * Process game log
 */
function processGameLog(playerId, playerInfo, gameLog) {
  return gameLog.map(game => {
    const isHome = game.homeRoadFlag === 'H';
    
    return {
      playerId,
      playerName: playerInfo?.name || 'Unknown',
      position: playerInfo?.position || 'Unknown',
      team: game.teamAbbrev,
      gameId: game.gameId,
      gameDate: game.gameDate,
      season: game.season,
      opponent: game.opponentAbbrev,
      isHome,
      shots: game.shots || 0,
      goals: game.goals || 0,
      assists: game.assists || 0,
      points: game.points || 0,
      toi: game.toi || '0:00',
      toiMinutes: parseToiMinutes(game.toi),
      ppGoals: game.powerPlayGoals || 0,
      ppPoints: game.powerPlayPoints || 0,
      ppToi: game.ppToi || '0:00',
      plusMinus: game.plusMinus || 0,
      teamGoalsFor: isHome ? game.homeScore : game.awayScore,
      teamGoalsAgainst: isHome ? game.awayScore : game.homeScore,
      gameResult: game.gameResult
    };
  });
}

/**
 * Main test
 */
async function quickTest() {
  console.log('🧪 QUICK TEST - NHL Elite Training');
  console.log('='.repeat(70));
  console.log(`Testing with ${TEST_PLAYERS.length} elite players`);
  console.log(`Seasons: ${SEASONS.join(', ')}`);
  console.log('This should take ~5 minutes...\n');
  
  const allGameData = [];
  let totalGames = 0;
  
  for (const season of SEASONS) {
    console.log(`\n📅 Season: ${season}`);
    
    for (const playerId of TEST_PLAYERS) {
      try {
        const playerInfo = await fetchPlayerInfo(playerId);
        await wait(DELAY_MS);
        
        if (!playerInfo) continue;
        
        const gameLog = await fetchPlayerGameLog(playerId, season);
        await wait(DELAY_MS);
        
        if (gameLog.length === 0) continue;
        
        const gameData = processGameLog(playerId, playerInfo, gameLog);
        allGameData.push(...gameData);
        totalGames += gameData.length;
        
        console.log(`  ✓ ${playerInfo.name}: ${gameData.length} games`);
        
      } catch (error) {
        console.error(`  ✗ Error with player ${playerId}:`, error.message);
      }
    }
  }
  
  console.log(`\n✅ Collected ${totalGames.toLocaleString()} total games`);
  
  // Quick analysis
  console.log('\n📊 Quick Analysis:');
  console.log('-'.repeat(70));
  
  const avgShots = allGameData.reduce((sum, g) => sum + g.shots, 0) / allGameData.length;
  const avgToi = allGameData.reduce((sum, g) => sum + g.toiMinutes, 0) / allGameData.length;
  
  const homeGames = allGameData.filter(g => g.isHome);
  const awayGames = allGameData.filter(g => !g.isHome);
  
  const homeAvgShots = homeGames.reduce((sum, g) => sum + g.shots, 0) / homeGames.length;
  const awayAvgShots = awayGames.reduce((sum, g) => sum + g.shots, 0) / awayGames.length;
  const homeAwayRatio = homeAvgShots / awayAvgShots;
  
  console.log(`  Overall avg: ${avgShots.toFixed(2)} shots, ${avgToi.toFixed(1)} min TOI`);
  console.log(`  Home games: ${homeAvgShots.toFixed(2)} shots (n=${homeGames.length})`);
  console.log(`  Away games: ${awayAvgShots.toFixed(2)} shots (n=${awayGames.length})`);
  console.log(`  Home advantage: ${homeAwayRatio.toFixed(3)}x`);
  
  // TOI buckets
  const highToi = allGameData.filter(g => g.toiMinutes > 20);
  const medToi = allGameData.filter(g => g.toiMinutes >= 15 && g.toiMinutes <= 20);
  const lowToi = allGameData.filter(g => g.toiMinutes < 15 && g.toiMinutes > 5);
  
  console.log(`\n  TOI vs Shots:`);
  console.log(`    High TOI (>20 min): ${(highToi.reduce((s, g) => s + g.shots, 0) / highToi.length).toFixed(2)} shots (n=${highToi.length})`);
  console.log(`    Med TOI (15-20 min): ${(medToi.reduce((s, g) => s + g.shots, 0) / medToi.length).toFixed(2)} shots (n=${medToi.length})`);
  console.log(`    Low TOI (<15 min): ${(lowToi.reduce((s, g) => s + g.shots, 0) / lowToi.length).toFixed(2)} shots (n=${lowToi.length})`);
  
  // Save sample data
  const output = {
    generatedAt: new Date().toISOString(),
    testMode: true,
    seasons: SEASONS,
    totalGames: totalGames,
    uniquePlayers: TEST_PLAYERS.length,
    games: allGameData
  };
  
  const outputPath = path.join(__dirname, '../../data/nhl/test_game_data.json');
  const outputDir = path.dirname(outputPath);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  
  console.log(`\n💾 Saved to: ${outputPath}`);
  console.log(`File size: ${Math.round(fs.statSync(outputPath).size / 1024)} KB`);
  
  console.log('\n✅ Quick test complete!');
  console.log('\n💡 Next steps:');
  console.log('   1. Run full pipeline: node scripts/nhl/train-elite-model.mjs');
  console.log('   2. Or run steps manually:');
  console.log('      - node scripts/nhl/historical-data-fetcher.mjs');
  console.log('      - node scripts/nhl/fit-parameters.mjs');
  console.log('      - node scripts/nhl/backtest-engine.mjs');
  
  return output;
}

// Run
quickTest()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
