import https from 'https';

// Nov 16, 2025 prop bets to grade
const props = [
  { player: 'Terance Mann', prop: 'rebounds', line: 3.5, pick: 'under', stake: 1.8 },
  { player: 'Kristaps Porzingis', prop: 'assists', line: 2.5, pick: 'over', stake: 0.5 },
  { player: 'Matas Buzelis', prop: 'rebounds', line: 4.5, pick: 'over', stake: 1.3 },
  { player: 'Max Christie', prop: 'rebounds', line: 3.5, pick: 'over', stake: 3.0 },
  { player: 'Keldon Johnson', prop: 'rebounds', line: 4.5, pick: 'over', stake: 2.3 },
  { player: 'Dyson Daniels', prop: 'assists', line: 5.5, pick: 'over', stake: 3.0 },
  { player: 'Anfernee Simons', prop: 'assists', line: 2.5, pick: 'over', stake: 1.9 },
  { player: 'Naji Marshall', prop: 'rebounds', line: 4.5, pick: 'over', stake: 2.5 },
  { player: 'Stephon Castle', prop: 'assists', line: 7.5, pick: 'over', stake: 3.0 },
  { player: 'Derrick White', prop: 'assists', line: 4.5, pick: 'over', stake: 2.1 },
  { player: 'Stephen Curry', prop: 'assists', line: 4.5, pick: 'under', stake: 2.5 },
  { player: 'Trey Murphy III', prop: 'rebounds', line: 5.5, pick: 'over', stake: 3.0 },
  { player: 'Bogdan Bogdanovic', prop: 'assists', line: 2.5, pick: 'over', stake: 0.5 },
  { player: 'Brook Lopez', prop: 'rebounds', line: 2.5, pick: 'under', stake: 2.4 },
  { player: 'Sam Hauser', prop: 'rebounds', line: 2.5, pick: 'over', stake: 1.7 },
  { player: 'Reed Sheppard', prop: 'rebounds', line: 2.5, pick: 'under', stake: 0.9 },
  { player: 'Luke Kennard', prop: 'assists', line: 2.5, pick: 'under', stake: 1.1 },
  { player: 'Khris Middleton', prop: 'rebounds', line: 3.5, pick: 'under', stake: 3.0 },
  { player: 'Franz Wagner', prop: 'rebounds', line: 5.5, pick: 'over', stake: 2.6 },
  { player: 'Desmond Bane', prop: 'assists', line: 4.5, pick: 'over', stake: 2.3 }
];

// NBA.com Stats API - player game logs for Nov 16, 2025
async function fetchNBAStats(date = '2025-11-16') {
  // This would normally use NBA.com's stats API but it requires more complex setup
  // For now, let's try a simpler approach using ESPN's scoreboard
  return new Promise((resolve, reject) => {
    const dateFormatted = date.replace(/-/g, '');
    https.get(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateFormatted}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const gameIds = json.events?.map(e => e.id) || [];
          resolve(gameIds);
        } catch(e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchGameBoxScore(gameId) {
  return new Promise((resolve, reject) => {
    https.get(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function getAllPlayerStats() {
  console.log('Fetching Nov 16, 2025 games...\n');
  
  const gameIds = await fetchNBAStats();
  console.log(`Found ${gameIds.length} games\n`);
  
  const playerStats = {};
  
  for (const gameId of gameIds) {
    try {
      console.log(`Fetching game ${gameId}...`);
      const boxscore = await fetchGameBoxScore(gameId);
      
      if (boxscore.boxscore?.players) {
        for (const team of boxscore.boxscore.players) {
          if (team.statistics?.[0]?.athletes) {
            for (const playerData of team.statistics[0].athletes) {
              const name = playerData.athlete.displayName;
              const stats = {};
              
              playerData.stats.forEach((val, idx) => {
                stats[team.statistics[0].labels[idx]] = val;
              });
              
              playerStats[name] = {
                rebounds: parseInt(stats['REB']) || 0,
                assists: parseInt(stats['AST']) || 0,
                points: parseInt(stats['PTS']) || 0,
                minutes: stats['MIN'] || '0'
              };
            }
          }
        }
      }
      
      // Be nice to the API
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch(e) {
      console.error(`Error fetching game ${gameId}:`, e.message);
    }
  }
  
  return playerStats;
}

async function gradeProps() {
  const playerStats = await getAllPlayerStats();
  
  console.log('\n=== GRADING NOV 16, 2025 PROP BETS ===\n');
  
  let wins = 0;
  let losses = 0;
  let totalStaked = 0;
  let totalReturns = 0;
  
  const reboundPicks = [];
  const assistPicks = [];
  
  for (const bet of props) {
    totalStaked += bet.stake;
    
    const stats = playerStats[bet.player];
    
    if (!stats) {
      console.log(`❌ ${bet.player}: NO STATS FOUND`);
      losses++;
      continue;
    }
    
    const actual = bet.prop === 'rebounds' ? stats.rebounds : stats.assists;
    const line = bet.line;
    const pick = bet.pick;
    
    let won = false;
    if (pick === 'over' && actual > line) won = true;
    if (pick === 'under' && actual < line) won = true;
    
    const result = won ? '✅ WIN' : '❌ LOSS';
    
    if (won) {
      wins++;
      totalReturns += bet.stake * 1.91; // Typical -110 odds return
    } else {
      losses++;
    }
    
    console.log(`${result} | ${bet.player} ${bet.prop.toUpperCase()} ${pick.toUpperCase()} ${line} | Actual: ${actual} | Stake: ${bet.stake}U | ${stats.minutes} mins`);
    
    if (bet.prop === 'rebounds') {
      reboundPicks.push({ won, stake: bet.stake });
    } else {
      assistPicks.push({ won, stake: bet.stake });
    }
  }
  
  const netProfit = totalReturns - totalStaked;
  const roi = ((netProfit / totalStaked) * 100).toFixed(1);
  const winRate = ((wins / (wins + losses)) * 100).toFixed(1);
  
  console.log('\n=== SUMMARY ===');
  console.log(`Record: ${wins}-${losses} (${winRate}%)`);
  console.log(`Total Staked: ${totalStaked.toFixed(1)}U`);
  console.log(`Total Returns: ${totalReturns.toFixed(2)}U`);
  console.log(`Net Profit: ${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)}U`);
  console.log(`ROI: ${roi}%`);
  
  const rebWins = reboundPicks.filter(p => p.won).length;
  const rebTotal = reboundPicks.length;
  const rebWinRate = ((rebWins / rebTotal) * 100).toFixed(1);
  
  const astWins = assistPicks.filter(p => p.won).length;
  const astTotal = assistPicks.length;
  const astWinRate = ((astWins / astTotal) * 100).toFixed(1);
  
  console.log(`\nRebounds: ${rebWins}-${rebTotal - rebWins} (${rebWinRate}%) [Expected: 62.5%]`);
  console.log(`Assists: ${astWins}-${astTotal - astWins} (${astWinRate}%) [Expected: 66.7%]`);
  
  // Not found players
  const notFound = props.filter(p => !playerStats[p.player]).map(p => p.player);
  if (notFound.length > 0) {
    console.log(`\n⚠️  Players not found in box scores: ${notFound.join(', ')}`);
  }
}

gradeProps().catch(console.error);
