#!/usr/bin/env node

/**
 * NHL Picks Grader - Generate Report Card
 * 
 * Fetches actual SOG results from NHL API and grades your picks
 */

import fs from 'fs';
import path from 'path';

// Your picks from last night (Oct 23, 2025)
const PICKS = [
  { player: 'Marco Kasper', team: 'DET', matchup: 'DET @ NYI', market: 'UNDER', line: 1.5, odds: -105, projection: 0.5, edge: '+99.8%', units: 7.5 },
  { player: 'Erik Karlsson', team: 'PIT', matchup: 'PIT @ FLA', market: 'UNDER', line: 1.5, odds: +100, projection: 0.7, edge: '+86.6%', units: 7.5 },
  { player: 'Gustav Forsling', team: 'FLA', matchup: 'FLA @ PIT', market: 'UNDER', line: 1.5, odds: +105, projection: 0.9, edge: '+73.8%', units: 7.5 },
  { player: 'Morgan Geekie', team: 'BOS', matchup: 'BOS @ ANA', market: 'UNDER', line: 1.5, odds: +135, projection: 1.4, edge: '+68.8%', units: 7.5 },
  { player: 'Oliver Bjorkstrand', team: 'TBL', matchup: 'TBL @ CHI', market: 'UNDER', line: 1.5, odds: +105, projection: 1.0, edge: '+65.7%', units: 7.5 },
  { player: 'Macklin Celebrini', team: 'SJS', matchup: 'SJS @ NYR', market: 'UNDER', line: 2.5, odds: +115, projection: 2.1, edge: '+58.7%', units: 7.5 },
  { player: 'Eetu Luostarinen', team: 'FLA', matchup: 'FLA @ PIT', market: 'UNDER', line: 1.5, odds: -130, projection: 0.7, edge: '+58.3%', units: 7.5 },
  { player: 'Sam Bennett', team: 'FLA', matchup: 'FLA @ PIT', market: 'UNDER', line: 2.5, odds: -105, projection: 2.0, edge: '+53.9%', units: 7.5 },
  { player: 'Emmitt Finnie', team: 'DET', matchup: 'DET @ NYI', market: 'UNDER', line: 1.5, odds: +105, projection: 1.3, edge: '+47.2%', units: 7.5 },
  { player: 'Viktor Arvidsson', team: 'BOS', matchup: 'BOS @ ANA', market: 'UNDER', line: 2.5, odds: -162, projection: 1.1, edge: '+46.6%', units: 7.5 },
  { player: 'Bo Horvat', team: 'NYI', matchup: 'NYI @ DET', market: 'OVER', line: 3.5, odds: +132, projection: 5.6, edge: '+42.4%', units: 7.5 },
  { player: 'Aaron Ekblad', team: 'FLA', matchup: 'FLA @ PIT', market: 'UNDER', line: 1.5, odds: +105, projection: 1.5, edge: '+40.4%', units: 7.5 },
  { player: 'Sidney Crosby', team: 'PIT', matchup: 'PIT @ FLA', market: 'UNDER', line: 2.5, odds: -175, projection: 1.3, edge: '+40.1%', units: 7.5 },
  { player: 'Victor Hedman', team: 'TBL', matchup: 'TBL @ CHI', market: 'UNDER', line: 2.5, odds: -154, projection: 1.4, edge: '+40.0%', units: 7.5 },
  { player: 'Jackson LaCombe', team: 'ANA', matchup: 'ANA @ BOS', market: 'UNDER', line: 1.5, odds: -120, projection: 1.3, edge: '+33.7%', units: 7.5 },
  { player: 'Mathew Barzal', team: 'NYI', matchup: 'NYI @ DET', market: 'UNDER', line: 2.5, odds: -125, projection: 2.2, edge: '+32.6%', units: 7.5 },
  { player: 'Alex DeBrincat', team: 'DET', matchup: 'DET @ NYI', market: 'UNDER', line: 3.5, odds: -154, projection: 2.8, edge: '+24.6%', units: 7.5 },
  { player: 'Mason McTavish', team: 'ANA', matchup: 'ANA @ BOS', market: 'UNDER', line: 2.5, odds: -154, projection: 2.1, edge: '+18.3%', units: 7.5 },
  { player: 'Cutter Gauthier', team: 'ANA', matchup: 'ANA @ BOS', market: 'OVER', line: 3.5, odds: +135, projection: 4.3, edge: '+18.2%', units: 2.8 },
  { player: 'Anders Lee', team: 'NYI', matchup: 'NYI @ DET', market: 'UNDER', line: 2.5, odds: -168, projection: 2.2, edge: '+16.5%', units: 5.4 },
  { player: 'Jake Guentzel', team: 'TBL', matchup: 'TBL @ CHI', market: 'OVER', line: 2.5, odds: -142, projection: 5.4, edge: '+16.2%', units: 7.5 },
  { player: 'Justin Brazeau', team: 'PIT', matchup: 'PIT @ FLA', market: 'UNDER', line: 1.5, odds: -154, projection: 1.4, edge: '+14.1%', units: 4.8 },
  { player: 'Elias Lindholm', team: 'BOS', matchup: 'BOS @ ANA', market: 'UNDER', line: 2.5, odds: -168, projection: 2.1, edge: '+12.0%', units: 7.0 },
  { player: 'J.T. Miller', team: 'NYR', matchup: 'NYR @ SJS', market: 'OVER', line: 2.5, odds: +100, projection: 3.4, edge: '+10.8%', units: 0.0 },
  { player: 'Alexis Lafrenière', team: 'NYR', matchup: 'NYR @ SJS', market: 'UNDER', line: 2.5, odds: -148, projection: 2.4, edge: '+10.5%', units: 4.5 },
  { player: 'Will Cuvile', team: 'NYR', matchup: 'NYR @ SJS', market: 'UNDER', line: 2.5, odds: -168, projection: 2.2, edge: '+8.6%', units: 5.2 },
  { player: 'Anton Lundell', team: 'FLA', matchup: 'FLA @ PIT', market: 'UNDER', line: 2.5, odds: -188, projection: 2.4, edge: '+7.9%', units: 0.0 },
  { player: 'Adam Fox', team: 'NYR', matchup: 'NYR @ SJS', market: 'OVER', line: 2.5, odds: +120, projection: 2.8, edge: '+7.3%', units: 0.0 },
  { player: 'Artemi Panarin', team: 'NYR', matchup: 'NYR @ SJS', market: 'UNDER', line: 3.5, odds: -148, projection: 3.5, edge: '+6.4%', units: 3.5 }
];

/**
 * Fetch NHL games for a date
 */
async function fetchNHLGames(date) {
  try {
    const url = `https://api-web.nhle.com/v1/score/${date}`;
    console.log(`Fetching NHL schedule for ${date}...`);
    const response = await fetch(url);
    const data = await response.json();
    return data.games || [];
  } catch (error) {
    console.error(`❌ Failed to fetch NHL schedule:`, error.message);
    return [];
  }
}

/**
 * Fetch box score for a game
 */
async function fetchBoxScore(gameId) {
  try {
    const url = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error(`❌ Failed to fetch box score for game ${gameId}:`, error.message);
    return null;
  }
}

/**
 * Extract player SOG and ice time from box score
 */
function extractPlayerStats(boxScore) {
  const playerStats = new Map();

  // Process home team
  if (boxScore.playerByGameStats?.homeTeam) {
    for (const [position, players] of Object.entries(boxScore.playerByGameStats.homeTeam)) {
      for (const player of players) {
        const fullName = player.name?.default || `${player.firstName?.default} ${player.lastName?.default}`;
        playerStats.set(fullName.toLowerCase(), {
          playerId: player.playerId,
          name: fullName,
          sog: player.sog || 0,
          toi: player.toi || '0:00',
          toiSeconds: convertToiToSeconds(player.toi || '0:00')
        });
      }
    }
  }

  // Process away team
  if (boxScore.playerByGameStats?.awayTeam) {
    for (const [position, players] of Object.entries(boxScore.playerByGameStats.awayTeam)) {
      for (const player of players) {
        const fullName = player.name?.default || `${player.firstName?.default} ${player.lastName?.default}`;
        playerStats.set(fullName.toLowerCase(), {
          playerId: player.playerId,
          name: fullName,
          sog: player.sog || 0,
          toi: player.toi || '0:00',
          toiSeconds: convertToiToSeconds(player.toi || '0:00')
        });
      }
    }
  }

  return playerStats;
}

/**
 * Convert TOI string (MM:SS) to seconds
 */
function convertToiToSeconds(toi) {
  const parts = toi.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
}

/**
 * Team abbreviation mapping
 */
const TEAM_MAP = {
  'DET': 'Detroit Red Wings', 'NYI': 'New York Islanders',
  'PIT': 'Pittsburgh Penguins', 'FLA': 'Florida Panthers',
  'BOS': 'Boston Bruins', 'ANA': 'Anaheim Ducks',
  'TBL': 'Tampa Bay Lightning', 'CHI': 'Chicago Blackhawks',
  'SJS': 'San Jose Sharks', 'NYR': 'New York Rangers'
};

/**
 * Grade all picks
 */
async function gradePicks(date) {
  console.log('🏒 NHL PICKS GRADER - REPORT CARD\n');
  console.log(`Date: ${date}`);
  console.log('='.repeat(80) + '\n');

  const games = await fetchNHLGames(date);
  const finishedGames = games.filter(g => g.gameState === 'FINAL' || g.gameState === 'OFF');

  console.log(`✅ Found ${finishedGames.length} finished games\n`);

  // Fetch all box scores
  const allPlayerStats = new Map();
  const gameInfo = new Map();

  for (const game of finishedGames) {
    const gameId = game.id;
    const matchup = `${game.awayTeam.abbrev} @ ${game.homeTeam.abbrev}`;
    const wentOT = game.periodDescriptor?.number > 3;
    
    console.log(`📊 Processing: ${matchup}${wentOT ? ' (OT)' : ''}`);
    
    gameInfo.set(matchup, { gameId, wentOT, awayTeam: game.awayTeam.abbrev, homeTeam: game.homeTeam.abbrev });

    const boxScore = await fetchBoxScore(gameId);
    if (boxScore) {
      const players = extractPlayerStats(boxScore);
      for (const [name, stats] of players.entries()) {
        allPlayerStats.set(name, stats);
      }
    }
  }

  console.log(`\n✅ Extracted stats for ${allPlayerStats.size} players\n`);
  console.log('='.repeat(80) + '\n');

  // Grade each pick
  const results = [];
  let totalPicks = 0;
  let hits = 0;
  let misses = 0;
  let pushes = 0;
  let voids = 0;
  let totalError = 0;
  let overHits = 0;
  let overTotal = 0;
  let underHits = 0;
  let underTotal = 0;

  for (const pick of PICKS) {
    const playerNameLower = pick.player.toLowerCase();
    
    // Find player in results (fuzzy match by last name)
    const lastName = pick.player.split(' ').pop().toLowerCase();
    let playerStat = allPlayerStats.get(playerNameLower);
    
    if (!playerStat) {
      // Fuzzy match by last name
      const matches = Array.from(allPlayerStats.entries()).filter(([name, stat]) => 
        name.includes(lastName)
      );
      
      if (matches.length === 1) {
        playerStat = matches[0][1];
      }
    }

    if (!playerStat) {
      console.log(`⚠️  ${pick.player} - NO DATA (DNP or not found)`);
      results.push({ ...pick, actual: 'DNP', result: 'VOID', error: null });
      voids++;
      continue;
    }

    const actualSOG = playerStat.sog;
    const icetime = (playerStat.toiSeconds / 60).toFixed(1);
    const isOver = pick.market === 'OVER';
    
    let result;
    if (actualSOG === pick.line) {
      result = 'PUSH';
      pushes++;
    } else if (isOver && actualSOG > pick.line) {
      result = 'HIT ✅';
      hits++;
      overHits++;
    } else if (!isOver && actualSOG < pick.line) {
      result = 'HIT ✅';
      hits++;
      underHits++;
    } else {
      result = 'MISS ❌';
      misses++;
    }

    if (isOver) overTotal++;
    else underTotal++;

    const error = Math.abs(actualSOG - pick.projection);
    totalError += error;
    totalPicks++;

    results.push({
      ...pick,
      actual: actualSOG,
      icetime: icetime,
      result,
      error: error.toFixed(1)
    });

    const icon = result === 'PUSH' ? '⚫' : result.includes('HIT') ? '✅' : '❌';
    console.log(`${icon} ${pick.player.padEnd(25)} ${pick.market.padEnd(6)} ${pick.line} → ${actualSOG} SOG (${icetime} min) | Proj: ${pick.projection} | ${result}`);
  }

  // Calculate metrics
  const winRate = totalPicks > 0 ? ((hits / totalPicks) * 100).toFixed(1) : '0.0';
  const mae = totalPicks > 0 ? (totalError / totalPicks).toFixed(2) : '0.00';
  const overWinRate = overTotal > 0 ? ((overHits / overTotal) * 100).toFixed(1) : '0.0';
  const underWinRate = underTotal > 0 ? ((underHits / underTotal) * 100).toFixed(1) : '0.0';

  // Generate report
  console.log('\n' + '='.repeat(80));
  console.log('📊 PERFORMANCE SUMMARY');
  console.log('='.repeat(80));
  console.log(`\nTotal Picks: ${totalPicks}`);
  console.log(`Hits: ${hits} ✅`);
  console.log(`Misses: ${misses} ❌`);
  console.log(`Pushes: ${pushes} ⚫`);
  console.log(`Voids/DNP: ${voids} ⚪`);
  console.log(`\n📈 Win Rate: ${winRate}%`);
  console.log(`📏 Mean Absolute Error (MAE): ${mae} SOG`);
  console.log(`\n🔼 Overs: ${overWinRate}% (${overHits}/${overTotal})`);
  console.log(`🔽 Unders: ${underWinRate}% (${underHits}/${underTotal})`);

  // Edge calibration
  console.log('\n' + '='.repeat(80));
  console.log('🎯 EDGE CALIBRATION');
  console.log('='.repeat(80));

  const edgeBuckets = {
    'Elite (50%+)': results.filter(r => parseFloat(r.edge) >= 50 && r.result !== 'VOID'),
    'High (30-50%)': results.filter(r => parseFloat(r.edge) >= 30 && parseFloat(r.edge) < 50 && r.result !== 'VOID'),
    'Med (15-30%)': results.filter(r => parseFloat(r.edge) >= 15 && parseFloat(r.edge) < 30 && r.result !== 'VOID'),
    'Low (<15%)': results.filter(r => parseFloat(r.edge) < 15 && r.result !== 'VOID')
  };

  for (const [bucket, picks] of Object.entries(edgeBuckets)) {
    if (picks.length === 0) continue;
    const bucketHits = picks.filter(p => p.result.includes('HIT')).length;
    const bucketWinRate = ((bucketHits / picks.length) * 100).toFixed(1);
    console.log(`${bucket.padEnd(15)} - ${bucketWinRate}% (${bucketHits}/${picks.length})`);
  }

  // Best and worst picks
  console.log('\n' + '='.repeat(80));
  console.log('⭐ BEST PICKS (Lowest Error)');
  console.log('='.repeat(80));
  
  const bestPicks = results
    .filter(r => r.result.includes('HIT'))
    .sort((a, b) => parseFloat(a.error) - parseFloat(b.error))
    .slice(0, 5);

  for (const pick of bestPicks) {
    console.log(`✅ ${pick.player} ${pick.market} ${pick.line} → ${pick.actual} SOG | Error: ${pick.error} | Edge: ${pick.edge}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('💀 WORST MISSES (Highest Error)');
  console.log('='.repeat(80));

  const worstPicks = results
    .filter(r => r.result.includes('MISS'))
    .sort((a, b) => parseFloat(b.error) - parseFloat(a.error))
    .slice(0, 5);

  for (const pick of worstPicks) {
    console.log(`❌ ${pick.player} ${pick.market} ${pick.line} → ${pick.actual} SOG | Error: ${pick.error} | Edge: ${pick.edge}`);
  }

  // Save report to markdown
  const reportPath = path.join(process.cwd(), `NHL_PICKS_REPORT_${date}.md`);
  const markdown = generateMarkdownReport(date, results, {
    totalPicks,
    hits,
    misses,
    pushes,
    voids,
    winRate,
    mae,
    overWinRate,
    overHits,
    overTotal,
    underWinRate,
    underHits,
    underTotal,
    edgeBuckets,
    bestPicks,
    worstPicks
  });

  fs.writeFileSync(reportPath, markdown);
  console.log(`\n✅ Report saved to: ${reportPath}`);
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(date, results, metrics) {
  return `# 🏒 NHL SOG Picks Report Card
**Date:** ${date}
**Generated:** ${new Date().toISOString()}

---

## 📊 Performance Summary

| Metric | Value |
|--------|-------|
| **Total Picks** | ${metrics.totalPicks} |
| **Hits** | ${metrics.hits} ✅ |
| **Misses** | ${metrics.misses} ❌ |
| **Pushes** | ${metrics.pushes} ⚫ |
| **Voids/DNP** | ${metrics.voids} ⚪ |
| **Win Rate** | **${metrics.winRate}%** |
| **MAE (Mean Absolute Error)** | ${metrics.mae} SOG |

### Direction-Specific Performance
- **Overs:** ${metrics.overWinRate}% (${metrics.overHits}/${metrics.overTotal})
- **Unders:** ${metrics.underWinRate}% (${metrics.underHits}/${metrics.underTotal})

---

## 🎯 Edge Calibration

| Edge Bucket | Win Rate | Picks |
|-------------|----------|-------|
${Object.entries(metrics.edgeBuckets).map(([bucket, picks]) => {
  if (picks.length === 0) return '';
  const bucketHits = picks.filter(p => p.result.includes('HIT')).length;
  const bucketWinRate = ((bucketHits / picks.length) * 100).toFixed(1);
  return `| ${bucket} | ${bucketWinRate}% | ${bucketHits}/${picks.length} |`;
}).filter(Boolean).join('\n')}

---

## ⭐ Best Picks (Lowest Error)

| Player | Market | Line | Actual | Error | Edge | Result |
|--------|--------|------|--------|-------|------|--------|
${metrics.bestPicks.map(p => 
  `| ${p.player} | ${p.market} ${p.line} | → | ${p.actual} | ${p.error} | ${p.edge} | ${p.result} |`
).join('\n')}

---

## 💀 Worst Misses (Highest Error)

| Player | Market | Line | Actual | Error | Edge | Result |
|--------|--------|------|--------|-------|------|--------|
${metrics.worstPicks.map(p => 
  `| ${p.player} | ${p.market} ${p.line} | → | ${p.actual} | ${p.error} | ${p.edge} | ${p.result} |`
).join('\n')}

---

## 📋 Complete Pick-by-Pick Results

| # | Player | Market | Line | Proj | Actual | TOI | Error | Edge | Result |
|---|--------|--------|------|------|--------|-----|-------|------|--------|
${results.map((p, i) => 
  `| ${i+1} | ${p.player} | ${p.market} ${p.line} | ${p.projection} | ${p.actual} | ${p.icetime || 'DNP'} | ${p.error || 'N/A'} | ${p.edge} | ${p.result} |`
).join('\n')}

---

## 💡 Key Insights

${metrics.winRate >= 60 ? '✅ **EXCELLENT PERFORMANCE** - Win rate above 60%!' : ''}
${metrics.winRate < 50 ? '⚠️ **BELOW BREAKEVEN** - Model may need recalibration.' : ''}
${parseFloat(metrics.mae) < 1.0 ? '✅ **ELITE ACCURACY** - MAE under 1.0 SOG!' : ''}
${parseFloat(metrics.mae) > 2.0 ? '⚠️ **HIGH ERROR** - Projections significantly off actual results.' : ''}
${Math.abs(parseFloat(metrics.overWinRate) - parseFloat(metrics.underWinRate)) > 15 ? '⚠️ **DIRECTIONAL BIAS** - Significant difference between over/under performance.' : ''}

---

*Report generated by NHL Picks Grader v1.0*
`;
}

// Run grader
const date = process.argv[2] || '2025-10-23';
gradePicks(date).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
