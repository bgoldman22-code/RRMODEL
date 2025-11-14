import https from 'https';
import fs from 'fs';

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
  const picksData = JSON.parse(fs.readFileSync('./data/nhl/sog_picks_tonight.json', 'utf8'));
  const picks = picksData.picks;
  
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
    
    const payout = won ? (units * (odds / 100)) : -units;
    
    return {
      ...pick,
      actualSOG,
      won,
      payout,
      projection,
      edge,
      units,
      odds
    };
  }).filter(r => r !== null);
  
  console.log('🎯 TOP 25 PICKS + PLUS ODDS ONLY');
  console.log('=' .repeat(70));
  console.log('');
  
  // Filter: Top 25 picks (by edge, already sorted)
  const top25 = results.slice(0, 25);
  
  // Further filter: Plus odds only
  const top25PlusOdds = top25.filter(r => r.odds > 0);
  
  console.log('Original top 25 picks:', top25.length);
  console.log('Top 25 with plus odds:', top25PlusOdds.length);
  console.log('');
  console.log('=' .repeat(70));
  console.log('RESULTS:');
  console.log('=' .repeat(70));
  console.log('');
  
  let wins = 0;
  let losses = 0;
  let totalUnits = 0;
  let profitLoss = 0;
  
  top25PlusOdds.forEach((pick, i) => {
    const result = pick.won ? '✅' : '❌';
    if (pick.won) wins++;
    else losses++;
    
    totalUnits += pick.units;
    profitLoss += pick.payout;
    
    console.log(`${i+1}. ${result} ${pick.playerName} (${pick.team})`);
    console.log(`   ${pick.direction} ${pick.line} @ +${pick.odds}`);
    console.log(`   Projected: ${pick.projection.toFixed(2)} | Actual: ${pick.actualSOG}`);
    console.log(`   Edge: ${pick.edge}% | Units: ${pick.units}`);
    console.log(`   P/L: ${pick.won ? '+' : ''}${pick.payout.toFixed(2)} units`);
    console.log('');
  });
  
  console.log('=' .repeat(70));
  console.log('📊 SUMMARY:');
  console.log('=' .repeat(70));
  console.log(`Total Picks: ${top25PlusOdds.length}`);
  console.log(`Wins: ${wins}`);
  console.log(`Losses: ${losses}`);
  console.log(`Win Rate: ${(wins / (wins + losses) * 100).toFixed(1)}%`);
  console.log('');
  console.log(`Total Units Bet: ${totalUnits.toFixed(2)}`);
  console.log(`Profit/Loss: ${profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(2)} units`);
  console.log(`ROI: ${(profitLoss / totalUnits * 100).toFixed(1)}%`);
  console.log('');
  console.log(`At $10/unit: ${profitLoss > 0 ? '+' : ''}$${(profitLoss * 10).toFixed(2)}`);
  console.log('');
  console.log('=' .repeat(70));
  console.log('💡 COMPARISON:');
  console.log('=' .repeat(70));
  console.log('All 83 picks:    -58.94 units (-43.0% ROI) | $-589.37');
  console.log(`Top 25 + Plus:   ${profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(2)} units (${(profitLoss / totalUnits * 100).toFixed(1)}% ROI) | ${profitLoss > 0 ? '+' : ''}$${(profitLoss * 10).toFixed(2)}`);
  console.log('');
  const improvement = profitLoss - (-58.94);
  console.log(`Improvement: ${improvement > 0 ? '+' : ''}${improvement.toFixed(2)} units (${profitLoss > 0 ? '✅ PROFITABLE' : '❌ Still losing but better'})`);
  console.log('=' .repeat(70));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
