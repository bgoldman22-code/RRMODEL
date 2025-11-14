import https from 'https';
import fs from 'fs';

// Load picks
const picksData = JSON.parse(fs.readFileSync('./data/nhl/sog_picks_tonight.json', 'utf8'));
const picks = picksData.picks;

console.log('🏒 NHL SOG PICKS VALIDATION');
console.log('=====================================');
console.log(`Date: November 13, 2025`);
console.log(`Total Picks: ${picks.length}`);
console.log('');

// Get games from November 13
const date = '2025-11-13';
const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;

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
  // Get game list
  const scoreData = await fetchUrl(scoreUrl);
  const games = scoreData.games;
  
  console.log(`✅ Found ${games.length} games\n`);
  
  // Create player SOG lookup by playerId and abbreviated name
  const playerSOG = {};
  const playerIdMap = {};
  
  // Fetch all box scores
  for (const game of games) {
    const gameId = game.id;
    const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
    
    try {
      const box = await fetchUrl(boxUrl);
      
      const processPlayers = (players) => {
        if (!players) return;
        players.forEach(player => {
          const playerId = player.playerId;
          const sog = player.sog || 0;
          const abbrevName = player.name.default; // e.g., "K. Connor"
          
          // Store by ID
          playerIdMap[playerId] = { name: abbrevName, sog };
          
          // Store by abbreviated name
          playerSOG[abbrevName] = sog;
        });
      };
      
      // Process all players
      if (box.playerByGameStats?.awayTeam) {
        processPlayers(box.playerByGameStats.awayTeam.forwards);
        processPlayers(box.playerByGameStats.awayTeam.defense);
      }
      
      if (box.playerByGameStats?.homeTeam) {
        processPlayers(box.playerByGameStats.homeTeam.forwards);
        processPlayers(box.playerByGameStats.homeTeam.defense);
      }
    } catch (e) {
      console.log(`⚠️  Error fetching box score for game ${gameId}`);
    }
  }
  
  console.log(`📊 Found SOG data for ${Object.keys(playerSOG).length} players\n`);
  console.log('=====================================');
  console.log('📈 RESULTS BY PICK:');
  console.log('=====================================\n');
  
  let wins = 0;
  let losses = 0;
  let notFound = 0;
  let totalUnits = 0;
  let profitLoss = 0;
  
  picks.forEach((pick, i) => {
    const playerName = pick.playerName; // e.g., "Kyle Connor"
    
    // Try to find match by converting to abbreviated format
    // "Kyle Connor" -> "K. Connor"
    const nameParts = playerName.split(' ');
    const lastName = nameParts[nameParts.length - 1];
    const firstInitial = nameParts[0][0];
    const abbrevName = `${firstInitial}. ${lastName}`;
    
    let actualSOG = playerSOG[abbrevName];
    
    // If not found, try alternative formats
    if (actualSOG === undefined) {
      // Try full last name search
      const matches = Object.keys(playerSOG).filter(name => 
        name.toLowerCase().includes(lastName.toLowerCase())
      );
      
      if (matches.length === 1) {
        actualSOG = playerSOG[matches[0]];
      }
    }
    
    if (actualSOG === undefined) {
      notFound++;
      console.log(`${i+1}. ❓ ${playerName} (tried: ${abbrevName}) - NO DATA FOUND`);
      return;
    }
    
    const line = pick.line;
    const direction = pick.direction;
    const odds = pick.odds;
    const units = parseFloat(pick.adjustedUnits);
    
    let won = false;
    if (direction === 'Over' && actualSOG > line) won = true;
    if (direction === 'Under' && actualSOG <= line) won = true;
    
    const result = won ? '✅ WIN' : '❌ LOSS';
    
    if (won) {
      wins++;
      const payout = units * (odds / 100);
      profitLoss += payout;
    } else {
      losses++;
      profitLoss -= units;
    }
    
    totalUnits += units;
    
    console.log(`${i+1}. ${result} - ${playerName} (${pick.team})`);
    console.log(`   Bet: ${direction} ${line} @ ${odds > 0 ? '+' : ''}${odds}`);
    console.log(`   Actual SOG: ${actualSOG} | Projected: ${pick.projectedSOG}`);
    console.log(`   Units: ${units} | P/L: ${won ? '+' : ''}${won ? (units * odds / 100).toFixed(2) : (-units).toFixed(2)}`);
    console.log('');
  });
  
  console.log('=====================================');
  console.log('📊 SUMMARY:');
  console.log('=====================================');
  console.log(`Total Picks: ${picks.length}`);
  console.log(`✅ Wins: ${wins}`);
  console.log(`❌ Losses: ${losses}`);
  console.log(`❓ Not Found: ${notFound}`);
  console.log(`Win Rate: ${((wins / (wins + losses)) * 100).toFixed(1)}%`);
  console.log('');
  console.log(`💰 Total Units Bet: ${totalUnits.toFixed(2)}`);
  console.log(`💰 Profit/Loss: ${profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(2)} units`);
  console.log(`💰 ROI: ${((profitLoss / totalUnits) * 100).toFixed(1)}%`);
  console.log('');
  console.log(`💵 At $10/unit: ${profitLoss > 0 ? '+' : ''}$${(profitLoss * 10).toFixed(2)}`);
  console.log('=====================================');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
