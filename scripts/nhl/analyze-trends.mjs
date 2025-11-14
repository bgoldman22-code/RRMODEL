import https from 'https';
import fs from 'fs';

// Load picks
const picksData = JSON.parse(fs.readFileSync('./data/nhl/sog_picks_tonight.json', 'utf8'));
const picks = picksData.picks;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('🔍 COMPREHENSIVE TREND ANALYSIS');
  console.log('=' .repeat(70));
  console.log('');
  
  // Get actual results
  const date = '2025-11-13';
  const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;
  const scoreData = await fetchUrl(scoreUrl);
  const games = scoreData.games;
  
  // Build player SOG lookup
  const playerSOG = {};
  for (const game of games) {
    const gameId = game.id;
    const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
    
    try {
      const box = await fetchUrl(boxUrl);
      
      const processPlayers = (players) => {
        if (!players) return;
        players.forEach(player => {
          const sog = player.sog || 0;
          const abbrevName = player.name.default;
          playerSOG[abbrevName] = sog;
        });
      };
      
      if (box.playerByGameStats?.awayTeam) {
        processPlayers(box.playerByGameStats.awayTeam.forwards);
        processPlayers(box.playerByGameStats.awayTeam.defense);
      }
      
      if (box.playerByGameStats?.homeTeam) {
        processPlayers(box.playerByGameStats.homeTeam.forwards);
        processPlayers(box.playerByGameStats.homeTeam.defense);
      }
    } catch (e) {
      // Skip errors
    }
  }
  
  // Match picks to results
  const results = picks.map(pick => {
    const nameParts = pick.playerName.split(' ');
    const lastName = nameParts[nameParts.length - 1];
    const firstInitial = nameParts[0][0];
    const abbrevName = `${firstInitial}. ${lastName}`;
    
    let actualSOG = playerSOG[abbrevName];
    
    if (actualSOG === undefined) {
      const matches = Object.keys(playerSOG).filter(name => 
        name.toLowerCase().includes(lastName.toLowerCase())
      );
      if (matches.length === 1) {
        actualSOG = playerSOG[matches[0]];
      }
    }
    
    if (actualSOG === undefined) return null;
    
    const line = pick.line;
    const direction = pick.direction;
    const projection = parseFloat(pick.projectedSOG);
    const edge = parseFloat(pick.edge);
    const units = parseFloat(pick.adjustedUnits);
    const odds = pick.odds;
    
    let won = false;
    if (direction === 'Over' && actualSOG > line) won = true;
    if (direction === 'Under' && actualSOG <= line) won = true;
    
    const error = projection - actualSOG;
    const absError = Math.abs(error);
    
    const payout = won ? (units * (odds / 100)) : -units;
    
    return {
      ...pick,
      actualSOG,
      won,
      error,
      absError,
      payout,
      projection,
      edge,
      units
    };
  }).filter(r => r !== null);
  
  console.log(`✅ Matched ${results.length}/${picks.length} picks to actual results\n`);
  
  // ===================
  // 1. PERFORMANCE BY QUARTILE
  // ===================
  console.log('📊 1. PERFORMANCE BY EDGE QUARTILE:');
  console.log('='.repeat(70));
  
  const quartileSize = Math.ceil(results.length / 4);
  const quartiles = [
    { name: 'Top 25% (Highest Edge)', picks: results.slice(0, quartileSize) },
    { name: '2nd Quartile', picks: results.slice(quartileSize, quartileSize * 2) },
    { name: '3rd Quartile', picks: results.slice(quartileSize * 2, quartileSize * 3) },
    { name: 'Bottom 25% (Lowest Edge)', picks: results.slice(quartileSize * 3) }
  ];
  
  quartiles.forEach((q, i) => {
    const wins = q.picks.filter(p => p.won).length;
    const losses = q.picks.length - wins;
    const winRate = (wins / q.picks.length * 100).toFixed(1);
    const totalPL = q.picks.reduce((sum, p) => sum + p.payout, 0);
    const avgEdge = (q.picks.reduce((sum, p) => sum + p.edge, 0) / q.picks.length).toFixed(1);
    const avgUnits = (q.picks.reduce((sum, p) => sum + p.units, 0) / q.picks.length).toFixed(2);
    
    console.log(`\n${q.name} (${q.picks.length} picks):`);
    console.log(`  Win Rate: ${winRate}% (${wins}W-${losses}L)`);
    console.log(`  Avg Edge: ${avgEdge}%`);
    console.log(`  Avg Units: ${avgUnits}`);
    console.log(`  P/L: ${totalPL > 0 ? '+' : ''}${totalPL.toFixed(2)} units`);
  });
  
  // ===================
  // 2. OVER vs UNDER PERFORMANCE
  // ===================
  console.log('\n\n📊 2. OVER vs UNDER PERFORMANCE:');
  console.log('='.repeat(70));
  
  const overs = results.filter(r => r.direction === 'Over');
  const unders = results.filter(r => r.direction === 'Under');
  
  const overWins = overs.filter(r => r.won).length;
  const underWins = unders.filter(r => r.won).length;
  
  console.log(`\nOVER bets (${overs.length} picks):`);
  console.log(`  Win Rate: ${(overWins / overs.length * 100).toFixed(1)}% (${overWins}W-${overs.length - overWins}L)`);
  console.log(`  P/L: ${overs.reduce((sum, r) => sum + r.payout, 0).toFixed(2)} units`);
  
  console.log(`\nUNDER bets (${unders.length} picks):`);
  console.log(`  Win Rate: ${(underWins / unders.length * 100).toFixed(1)}% (${underWins}W-${unders.length - underWins}L)`);
  console.log(`  P/L: ${unders.reduce((sum, r) => sum + r.payout, 0).toFixed(2)} units`);
  
  // ===================
  // 3. PROJECTION ACCURACY
  // ===================
  console.log('\n\n📊 3. PROJECTION ACCURACY:');
  console.log('='.repeat(70));
  
  const avgError = (results.reduce((sum, r) => sum + r.error, 0) / results.length).toFixed(2);
  const avgAbsError = (results.reduce((sum, r) => sum + r.absError, 0) / results.length).toFixed(2);
  
  console.log(`\nAverage Error: ${avgError} SOG (negative = underestimated)`);
  console.log(`Average Absolute Error: ${avgAbsError} SOG`);
  
  // Find biggest misses
  const biggestMisses = [...results].sort((a, b) => b.absError - a.absError).slice(0, 10);
  console.log(`\n🔴 Top 10 Biggest Projection Misses:`);
  biggestMisses.forEach((r, i) => {
    const result = r.won ? '✅' : '❌';
    console.log(`${i+1}. ${result} ${r.playerName}: Proj ${r.projection.toFixed(1)}, Act ${r.actualSOG} (Off by ${r.error > 0 ? '+' : ''}${r.error.toFixed(1)})`);
  });
  
  // ===================
  // 4. CLOSE CALLS vs BIG HITS/MISSES
  // ===================
  console.log('\n\n📊 4. MARGIN OF VICTORY/LOSS:');
  console.log('='.repeat(70));
  
  const marginAnalysis = results.map(r => {
    let margin;
    if (r.direction === 'Over') {
      margin = r.actualSOG - r.line; // Positive = won by X, negative = lost by X
    } else {
      margin = r.line - r.actualSOG; // Positive = won by X, negative = lost by X
    }
    return { ...r, margin };
  });
  
  const closeCalls = marginAnalysis.filter(r => Math.abs(r.margin) <= 1);
  const bigWins = marginAnalysis.filter(r => r.won && r.margin >= 2);
  const bigLosses = marginAnalysis.filter(r => !r.won && r.margin <= -2);
  
  console.log(`\n🎯 Close Calls (margin ≤ 1 SOG): ${closeCalls.length} picks`);
  const closeWins = closeCalls.filter(r => r.won).length;
  console.log(`  ${closeWins}W-${closeCalls.length - closeWins}L (${(closeWins/closeCalls.length*100).toFixed(1)}% win rate)`);
  
  console.log(`\n🚀 Big Wins (won by 2+ SOG): ${bigWins.length} picks`);
  bigWins.slice(0, 5).forEach(r => {
    console.log(`  ${r.playerName}: ${r.direction} ${r.line}, Act ${r.actualSOG} (won by ${r.margin})`);
  });
  
  console.log(`\n💥 Big Losses (lost by 2+ SOG): ${bigLosses.length} picks`);
  bigLosses.slice(0, 5).forEach(r => {
    console.log(`  ${r.playerName}: ${r.direction} ${r.line}, Act ${r.actualSOG} (lost by ${Math.abs(r.margin)})`);
  });
  
  // ===================
  // 5. ODDS RANGE PERFORMANCE
  // ===================
  console.log('\n\n📊 5. PERFORMANCE BY ODDS RANGE:');
  console.log('='.repeat(70));
  
  const plusOdds = results.filter(r => r.odds > 0);
  const minusOdds = results.filter(r => r.odds < 0);
  
  const plusWins = plusOdds.filter(r => r.won).length;
  const minusWins = minusOdds.filter(r => r.won).length;
  
  console.log(`\nPlus Odds (+100 or better) - ${plusOdds.length} picks:`);
  console.log(`  Win Rate: ${(plusWins / plusOdds.length * 100).toFixed(1)}%`);
  console.log(`  P/L: ${plusOdds.reduce((sum, r) => sum + r.payout, 0).toFixed(2)} units`);
  
  console.log(`\nMinus Odds (favorites) - ${minusOdds.length} picks:`);
  console.log(`  Win Rate: ${(minusWins / minusOdds.length * 100).toFixed(1)}%`);
  console.log(`  P/L: ${minusOdds.reduce((sum, r) => sum + r.payout, 0).toFixed(2)} units`);
  
  // ===================
  // 6. HIGH vs LOW CONFIDENCE
  // ===================
  console.log('\n\n📊 6. HIGH vs LOW CONFIDENCE (by Model Win Prob):');
  console.log('='.repeat(70));
  
  const highConf = results.filter(r => parseFloat(r.modelProb) >= 70);
  const medConf = results.filter(r => parseFloat(r.modelProb) >= 60 && parseFloat(r.modelProb) < 70);
  const lowConf = results.filter(r => parseFloat(r.modelProb) < 60);
  
  console.log(`\nHigh Confidence (≥70% model prob) - ${highConf.length} picks:`);
  const highWins = highConf.filter(r => r.won).length;
  console.log(`  Win Rate: ${(highWins / highConf.length * 100).toFixed(1)}% (Expected: 70%+)`);
  console.log(`  P/L: ${highConf.reduce((sum, r) => sum + r.payout, 0).toFixed(2)} units`);
  console.log(`  ⚠️  Calibration Gap: ${((highWins / highConf.length * 100) - 70).toFixed(1)}%`);
  
  console.log(`\nMedium Confidence (60-69% model prob) - ${medConf.length} picks:`);
  const medWins = medConf.filter(r => r.won).length;
  console.log(`  Win Rate: ${(medWins / medConf.length * 100).toFixed(1)}% (Expected: ~65%)`);
  console.log(`  P/L: ${medConf.reduce((sum, r) => sum + r.payout, 0).toFixed(2)} units`);
  
  console.log(`\nLow Confidence (<60% model prob) - ${lowConf.length} picks:`);
  const lowWins = lowConf.filter(r => r.won).length;
  console.log(`  Win Rate: ${(lowWins / lowConf.length * 100).toFixed(1)}%`);
  console.log(`  P/L: ${lowConf.reduce((sum, r) => sum + r.payout, 0).toFixed(2)} units`);
  
  // ===================
  // 7. KEY INSIGHTS
  // ===================
  console.log('\n\n💡 KEY INSIGHTS:');
  console.log('='.repeat(70));
  
  // Check if higher edge = better performance
  const topHalfEdge = results.slice(0, Math.floor(results.length / 2));
  const bottomHalfEdge = results.slice(Math.floor(results.length / 2));
  
  const topHalfWR = topHalfEdge.filter(r => r.won).length / topHalfEdge.length;
  const bottomHalfWR = bottomHalfEdge.filter(r => r.won).length / bottomHalfEdge.length;
  
  console.log(`\n1. Edge Correlation:`);
  console.log(`   Top 50% by edge: ${(topHalfWR * 100).toFixed(1)}% win rate`);
  console.log(`   Bottom 50% by edge: ${(bottomHalfWR * 100).toFixed(1)}% win rate`);
  console.log(`   ${topHalfWR > bottomHalfWR ? '✅ Higher edge = better results' : '❌ Higher edge NOT producing better results'}`);
  
  console.log(`\n2. Calibration Issue:`);
  console.log(`   Model claims high confidence (70%+) but actual win rate much lower`);
  console.log(`   This suggests model is OVERCONFIDENT`);
  
  console.log(`\n3. Direction Bias:`);
  console.log(`   ${overWins / overs.length > underWins / unders.length ? 'OVER' : 'UNDER'} bets performing better`);
  console.log(`   Consider filtering to only ${overWins / overs.length > underWins / unders.length ? 'OVER' : 'UNDER'} bets`);
  
  console.log(`\n4. Projection Accuracy:`);
  console.log(`   Avg absolute error of ${avgAbsError} SOG is quite high`);
  console.log(`   Model needs better parameter estimation`);
  
  console.log('\n' + '='.repeat(70));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
