/**
 * Analyze NBA Picks Results - Oct 30, 2025
 * 
 * Fetches actual game results from NBA CDN and compares to predictions
 * to identify trends and calibration issues
 */

import { readFile } from 'fs/promises';
import fetch from 'node-fetch';

const PICKS_DATE = '2025-10-30';
const PICKS_CSV = '/Users/brentgoldman/Downloads/nba-picks-2025-10-30.csv';

async function fetchBoxscore(gameId) {
  const url = `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch (error) {
    return null;
  }
}

async function fetchScoreboard(date) {
  // Fetch the scoreboard to get actual game IDs for the date
  const url = `https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    
    // Check if this scoreboard is for our target date
    if (data.scoreboard.gameDate === date) {
      return data.scoreboard.games.map(g => g.gameId);
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching scoreboard:', error.message);
    return [];
  }
}

function extractPlayerStats(game) {
  const players = [];
  
  // Handle different possible structures
  const gameData = game.game || game;
  const homeTeam = gameData.homeTeam;
  const awayTeam = gameData.awayTeam;
  
  if (!homeTeam || !awayTeam) {
    return players;
  }
  
  const processPlayers = (teamPlayers, team) => {
    if (!teamPlayers || !Array.isArray(teamPlayers)) return;
    
    for (const player of teamPlayers) {
      if (player.played === '1' || player.oncourt === '1') {
        players.push({
          name: player.name || `${player.firstName} ${player.familyName}`,
          team: team.teamTricode,
          rebounds: parseInt(player.statistics?.reboundsTotal) || 0,
          assists: parseInt(player.statistics?.assists) || 0,
          points: parseInt(player.statistics?.points) || 0,
          minutes: player.statistics?.minutesCalculated || player.statistics?.minutes || '0'
        });
      }
    }
  };
  
  processPlayers(homeTeam.players, homeTeam);
  processPlayers(awayTeam.players, awayTeam);
  
  return players;
}

async function main() {
  console.log('📊 Analyzing NBA Picks - Oct 30, 2025\n');
  
  // Read the picks CSV
  const csvData = await readFile(PICKS_CSV, 'utf-8');
  const lines = csvData.split('\n').slice(1); // Skip header
  
  const picks = lines.filter(l => l.trim()).map(line => {
    const parts = line.split(',');
    return {
      player: parts[0],
      prop: parts[1],
      line: parseFloat(parts[2]),
      pick: parts[3],
      predicted: parseFloat(parts[4]),
      odds: parseInt(parts[5]),
      edge: parseFloat(parts[6]),
      confidence: parseFloat(parts[7]),
      kelly: parseFloat(parts[8]),
      units: parseFloat(parts[9]),
      book: parts[10]
    };
  });
  
  console.log(`📋 Loaded ${picks.length} picks from CSV\n`);
  
  // First, get actual game IDs from the schedule
  console.log('🔍 Fetching game IDs from NBA schedule...\n');
  const gameIds = await fetchScoreboard('2025-10-30');
  
  if (gameIds.length === 0) {
    console.log('❌ No games found for Oct 30, 2025 in the schedule.');
    console.log('Note: The NBA CDN API may not have Oct 30, 2025 data available yet.');
    console.log('Alternative: Try again tomorrow after games have been processed.\n');
    return;
  }
  
  console.log(`✅ Found ${gameIds.length} scheduled games:`, gameIds);
  console.log('\n🔍 Fetching actual results from NBA CDN...\n');
  
  const actualStats = new Map();
  let gamesFound = 0;
  
  for (const gameId of gameIds) {
    const data = await fetchBoxscore(gameId);
    if (data && data.game?.gameStatus === 3) {
      gamesFound++;
      const players = extractPlayerStats(data);
      console.log(`✅ Game ${gameId}: ${data.game.awayTeam.teamTricode} @ ${data.game.homeTeam.teamTricode}`);
      
      for (const player of players) {
        actualStats.set(player.name, player);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n📊 Found ${gamesFound} completed games with ${actualStats.size} players\n`);
  console.log('=' .repeat(100));
  console.log('\n🎯 PICK ANALYSIS\n');
  
  const results = {
    wins: 0,
    losses: 0,
    pushes: 0,
    noData: 0,
    byEdge: {},
    byConfidence: {},
    byProp: { rebounds: { wins: 0, losses: 0 }, assists: { wins: 0, losses: 0 } },
    byUnits: {}
  };
  
  const detailedResults = [];
  
  for (const pick of picks) {
    const actual = actualStats.get(pick.player);
    
    if (!actual) {
      results.noData++;
      console.log(`⚠️  ${pick.player}: NO DATA`);
      continue;
    }
    
    const actualValue = pick.prop === 'rebounds' ? actual.rebounds : actual.assists;
    let result;
    
    if (pick.pick === 'Over') {
      if (actualValue > pick.line) result = 'WIN';
      else if (actualValue === pick.line) result = 'PUSH';
      else result = 'LOSS';
    } else { // Under
      if (actualValue < pick.line) result = 'WIN';
      else if (actualValue === pick.line) result = 'PUSH';
      else result = 'LOSS';
    }
    
    const icon = result === 'WIN' ? '✅' : result === 'LOSS' ? '❌' : '➖';
    const diff = actualValue - pick.line;
    
    console.log(`${icon} ${pick.player} ${pick.prop} ${pick.pick} ${pick.line} | Actual: ${actualValue} | Edge: ${pick.edge}% | Conf: ${pick.confidence}%`);
    
    detailedResults.push({
      ...pick,
      actual: actualValue,
      result,
      diff
    });
    
    // Aggregate stats
    if (result === 'WIN') results.wins++;
    else if (result === 'LOSS') results.losses++;
    else results.pushes++;
    
    // By prop type
    if (result !== 'PUSH') {
      results.byProp[pick.prop][result === 'WIN' ? 'wins' : 'losses']++;
    }
    
    // By edge buckets
    const edgeBucket = Math.floor(pick.edge / 5) * 5;
    if (!results.byEdge[edgeBucket]) results.byEdge[edgeBucket] = { wins: 0, losses: 0 };
    if (result !== 'PUSH') {
      results.byEdge[edgeBucket][result === 'WIN' ? 'wins' : 'losses']++;
    }
    
    // By confidence buckets
    const confBucket = Math.floor(pick.confidence / 10) * 10;
    if (!results.byConfidence[confBucket]) results.byConfidence[confBucket] = { wins: 0, losses: 0 };
    if (result !== 'PUSH') {
      results.byConfidence[confBucket][result === 'WIN' ? 'wins' : 'losses']++;
    }
    
    // By units
    const unitsBucket = Math.floor(pick.units);
    if (!results.byUnits[unitsBucket]) results.byUnits[unitsBucket] = { wins: 0, losses: 0 };
    if (result !== 'PUSH') {
      results.byUnits[unitsBucket][result === 'WIN' ? 'wins' : 'losses']++;
    }
  }
  
  console.log('\n' + '='.repeat(100));
  console.log('\n📈 SUMMARY STATISTICS\n');
  
  const totalDecided = results.wins + results.losses;
  const winRate = ((results.wins / totalDecided) * 100).toFixed(1);
  
  console.log(`Total Picks: ${picks.length}`);
  console.log(`Wins: ${results.wins} (${winRate}%)`);
  console.log(`Losses: ${results.losses} (${((results.losses / totalDecided) * 100).toFixed(1)}%)`);
  console.log(`Pushes: ${results.pushes}`);
  console.log(`No Data: ${results.noData}`);
  
  console.log('\n📊 BY PROP TYPE\n');
  for (const [prop, stats] of Object.entries(results.byProp)) {
    const total = stats.wins + stats.losses;
    if (total > 0) {
      const rate = ((stats.wins / total) * 100).toFixed(1);
      console.log(`${prop.toUpperCase()}: ${stats.wins}W-${stats.losses}L (${rate}%)`);
    }
  }
  
  console.log('\n📊 BY EDGE BUCKETS\n');
  const edgeBuckets = Object.keys(results.byEdge).sort((a, b) => parseInt(b) - parseInt(a));
  for (const bucket of edgeBuckets) {
    const stats = results.byEdge[bucket];
    const total = stats.wins + stats.losses;
    const rate = ((stats.wins / total) * 100).toFixed(1);
    console.log(`${bucket}-${parseInt(bucket) + 4}%: ${stats.wins}W-${stats.losses}L (${rate}%) [n=${total}]`);
  }
  
  console.log('\n📊 BY CONFIDENCE BUCKETS\n');
  const confBuckets = Object.keys(results.byConfidence).sort((a, b) => parseInt(b) - parseInt(a));
  for (const bucket of confBuckets) {
    const stats = results.byConfidence[bucket];
    const total = stats.wins + stats.losses;
    const rate = ((stats.wins / total) * 100).toFixed(1);
    console.log(`${bucket}-${parseInt(bucket) + 9}%: ${stats.wins}W-${stats.losses}L (${rate}%) [n=${total}]`);
  }
  
  console.log('\n📊 BY UNIT SIZE\n');
  const unitBuckets = Object.keys(results.byUnits).sort();
  for (const bucket of unitBuckets) {
    const stats = results.byUnits[bucket];
    const total = stats.wins + stats.losses;
    const rate = ((stats.wins / total) * 100).toFixed(1);
    console.log(`${bucket}U: ${stats.wins}W-${stats.losses}L (${rate}%) [n=${total}]`);
  }
  
  console.log('\n🔍 KEY INSIGHTS\n');
  
  // Analyze overs vs unders
  const overs = detailedResults.filter(r => r.pick === 'Over' && r.result !== 'PUSH');
  const unders = detailedResults.filter(r => r.pick === 'Under' && r.result !== 'PUSH');
  
  const oversWinRate = ((overs.filter(r => r.result === 'WIN').length / overs.length) * 100).toFixed(1);
  const undersWinRate = ((unders.filter(r => r.result === 'WIN').length / unders.length) * 100).toFixed(1);
  
  console.log(`Over Bets: ${overs.filter(r => r.result === 'WIN').length}W-${overs.filter(r => r.result === 'LOSS').length}L (${oversWinRate}%)`);
  console.log(`Under Bets: ${unders.filter(r => r.result === 'WIN').length}W-${unders.filter(r => r.result === 'LOSS').length}L (${undersWinRate}%)`);
  
  // High confidence misses
  const highConfMisses = detailedResults.filter(r => r.confidence >= 90 && r.result === 'LOSS');
  if (highConfMisses.length > 0) {
    console.log(`\n⚠️  High Confidence Misses (90%+): ${highConfMisses.length}`);
    highConfMisses.slice(0, 5).forEach(r => {
      console.log(`   ${r.player} ${r.prop} ${r.pick} ${r.line} | Actual: ${r.actual} | Conf: ${r.confidence}%`);
    });
  }
  
  // High edge misses
  const highEdgeMisses = detailedResults.filter(r => r.edge >= 20 && r.result === 'LOSS');
  if (highEdgeMisses.length > 0) {
    console.log(`\n⚠️  High Edge Misses (20%+): ${highEdgeMisses.length}`);
    highEdgeMisses.forEach(r => {
      console.log(`   ${r.player} ${r.prop} ${r.pick} ${r.line} | Actual: ${r.actual} | Edge: ${r.edge}%`);
    });
  }
  
  console.log('\n' + '='.repeat(100));
}

main().catch(console.error);
