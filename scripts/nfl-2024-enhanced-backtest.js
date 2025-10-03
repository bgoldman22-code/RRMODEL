#!/usr/bin/env node

/**
 * NFL 2024 Enhanced Backtest with Spread and Totals
 * 
 * Time-Constrained Methodology:
 * - Week N predictions use ONLY data from Weeks 1 through N-1
 * - Team stats updated AFTER each week completes
 * - NO future knowledge allowed
 * 
 * Three Bet Types:
 * 1. Moneyline (ML) - Pick straight winner
 * 2. Against The Spread (ATS) - Beat the Vegas line
 * 3. Over/Under (O/U) - Total points vs Vegas total
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize team stats with 2023-based preseason expectations
function initializeTeamStats() {
  return {
    // Elite tier
    'Kansas City Chiefs': { power: 92, offEPA: 0.15, defEPA: -0.08, wins: 0, losses: 0, avgScore: 24, avgAllowed: 20 },
    'San Francisco 49ers': { power: 90, offEPA: 0.13, defEPA: -0.10, wins: 0, losses: 0, avgScore: 26, avgAllowed: 19 },
    'Baltimore Ravens': { power: 88, offEPA: 0.14, defEPA: -0.06, wins: 0, losses: 0, avgScore: 27, avgAllowed: 21 },
    
    // Strong contenders
    'Buffalo Bills': { power: 86, offEPA: 0.11, defEPA: -0.05, wins: 0, losses: 0, avgScore: 25, avgAllowed: 21 },
    'Detroit Lions': { power: 85, offEPA: 0.12, defEPA: -0.04, wins: 0, losses: 0, avgScore: 26, avgAllowed: 22 },
    'Philadelphia Eagles': { power: 84, offEPA: 0.10, defEPA: -0.06, wins: 0, losses: 0, avgScore: 25, avgAllowed: 21 },
    'Dallas Cowboys': { power: 82, offEPA: 0.09, defEPA: -0.04, wins: 0, losses: 0, avgScore: 24, avgAllowed: 21 },
    'Miami Dolphins': { power: 81, offEPA: 0.12, defEPA: 0.02, wins: 0, losses: 0, avgScore: 27, avgAllowed: 24 },
    
    // Playoff hopefuls
    'Cincinnati Bengals': { power: 80, offEPA: 0.09, defEPA: 0.00, wins: 0, losses: 0, avgScore: 25, avgAllowed: 23 },
    'Houston Texans': { power: 79, offEPA: 0.07, defEPA: -0.02, wins: 0, losses: 0, avgScore: 23, avgAllowed: 22 },
    'Green Bay Packers': { power: 78, offEPA: 0.06, defEPA: -0.03, wins: 0, losses: 0, avgScore: 23, avgAllowed: 21 },
    'Los Angeles Chargers': { power: 77, offEPA: 0.05, defEPA: -0.02, wins: 0, losses: 0, avgScore: 22, avgAllowed: 21 },
    'Jacksonville Jaguars': { power: 76, offEPA: 0.04, defEPA: 0.01, wins: 0, losses: 0, avgScore: 22, avgAllowed: 23 },
    'Cleveland Browns': { power: 75, offEPA: 0.03, defEPA: -0.05, wins: 0, losses: 0, avgScore: 21, avgAllowed: 20 },
    
    // Middle tier
    'Seattle Seahawks': { power: 74, offEPA: 0.04, defEPA: 0.02, wins: 0, losses: 0, avgScore: 23, avgAllowed: 23 },
    'Los Angeles Rams': { power: 73, offEPA: 0.05, defEPA: 0.03, wins: 0, losses: 0, avgScore: 22, avgAllowed: 23 },
    'Tampa Bay Buccaneers': { power: 72, offEPA: 0.04, defEPA: 0.02, wins: 0, losses: 0, avgScore: 22, avgAllowed: 23 },
    'Pittsburgh Steelers': { power: 71, offEPA: 0.02, defEPA: -0.04, wins: 0, losses: 0, avgScore: 20, avgAllowed: 20 },
    'Atlanta Falcons': { power: 70, offEPA: 0.03, defEPA: 0.04, wins: 0, losses: 0, avgScore: 22, avgAllowed: 24 },
    'New Orleans Saints': { power: 69, offEPA: 0.02, defEPA: 0.03, wins: 0, losses: 0, avgScore: 21, avgAllowed: 23 },
    
    // Below average
    'Minnesota Vikings': { power: 68, offEPA: 0.03, defEPA: 0.04, wins: 0, losses: 0, avgScore: 22, avgAllowed: 24 },
    'Indianapolis Colts': { power: 67, offEPA: 0.01, defEPA: 0.03, wins: 0, losses: 0, avgScore: 20, avgAllowed: 23 },
    'Las Vegas Raiders': { power: 66, offEPA: 0.00, defEPA: 0.04, wins: 0, losses: 0, avgScore: 20, avgAllowed: 24 },
    'New York Jets': { power: 65, offEPA: 0.01, defEPA: -0.01, wins: 0, losses: 0, avgScore: 20, avgAllowed: 21 },
    'Tennessee Titans': { power: 64, offEPA: -0.01, defEPA: 0.05, wins: 0, losses: 0, avgScore: 19, avgAllowed: 24 },
    'Chicago Bears': { power: 63, offEPA: -0.02, defEPA: 0.04, wins: 0, losses: 0, avgScore: 19, avgAllowed: 24 },
    
    // Rebuilding
    'Washington Commanders': { power: 62, offEPA: 0.00, defEPA: 0.06, wins: 0, losses: 0, avgScore: 21, avgAllowed: 25 },
    'Denver Broncos': { power: 61, offEPA: -0.03, defEPA: 0.05, wins: 0, losses: 0, avgScore: 18, avgAllowed: 24 },
    'New York Giants': { power: 60, offEPA: -0.04, defEPA: 0.06, wins: 0, losses: 0, avgScore: 18, avgAllowed: 25 },
    'Arizona Cardinals': { power: 59, offEPA: -0.03, defEPA: 0.07, wins: 0, losses: 0, avgScore: 19, avgAllowed: 26 },
    'New England Patriots': { power: 58, offEPA: -0.05, defEPA: 0.05, wins: 0, losses: 0, avgScore: 17, avgAllowed: 24 },
    'Carolina Panthers': { power: 57, offEPA: -0.06, defEPA: 0.08, wins: 0, losses: 0, avgScore: 17, avgAllowed: 27 },
  };
}

// Parse Vegas lines from the data file
async function parseVegasLines() {
  const filePath = path.join(__dirname, '..', 'data', 'nfl', '2024-vegas-lines.txt');
  const content = await fs.readFile(filePath, 'utf-8');
  
  const lines = content.split('\n');
  const games = [];
  let currentWeek = 0;
  
  for (const line of lines) {
    // Detect week headers
    if (line.includes('Week ')) {
      const match = line.match(/Week (\d+)/);
      if (match) {
        currentWeek = parseInt(match[1]);
        console.log(`📖 Parsing Week ${currentWeek}...`);
      }
      continue;
    }
    
    // Skip header rows and empty lines
    if (!line.trim() || line.includes('Day\t') || line.includes('Favorite')) continue;
    
    // Split by tabs (keep empty strings to preserve column positions)
    const parts = line.split('\t');
    if (parts.length < 11) continue;
    
    try {
      // Column indices (0-based):
      // 0: Day (Thu, Sun, etc.)
      // 1: Date (Sep 5, 2024)
      // 2: Time (8:20)
      // 3: Location (@, N, or empty)
      // 4: Favorite team name
      // 5: Score with result (W 27-20)
      // 6: Spread with result (W -3)
      // 7: Empty or @
      // 8: Underdog team name
      // 9: Over/Under with result (O 46)
      // 10: Notes (optional)
      
      const favorite = parts[4]?.trim();
      const scoreAndResult = parts[5]?.trim(); // e.g., "W 27-20" or "L 10-18"
      const spreadResult = parts[6]?.trim(); // e.g., "W -3" or "L -4" or "P -3"
      const underdog = parts[8]?.trim();
      const totalResult = parts[9]?.trim(); // e.g., "O 46" or "U 43"
      
      if (!favorite || !scoreAndResult || !spreadResult || !underdog || !totalResult) {
        continue;
      }
      
      // Extract score
      const scoreMatch = scoreAndResult.match(/[WLP]\s+(\d+)-(\d+)/);
      if (!scoreMatch) {
        continue;
      }
      
      let favScore = parseInt(scoreMatch[1]);
      let dogScore = parseInt(scoreMatch[2]);
      
      // Check if favorite lost - if so, swap scores
      if (scoreAndResult.startsWith('L')) {
        [favScore, dogScore] = [dogScore, favScore];
      }
      
      // Extract spread (always from favorite perspective, negative)
      const spreadMatch = spreadResult.match(/[WLP]\s+(-?\d+\.?\d*)/);
      if (!spreadMatch) {
        continue;
      }
      
      const spread = parseFloat(spreadMatch[1]);
      
      // Extract total
      const totalMatch = totalResult.match(/[OU]\s+(\d+\.?\d*)/);
      if (!totalMatch) {
        continue;
      }
      
      const total = parseFloat(totalMatch[1]);
      
      // Determine actual winner
      const actualWinner = favScore > dogScore ? favorite : underdog;
      const totalScore = favScore + dogScore;
      
      // Determine if favorite covered
      // Spread is negative (e.g., -3 means favorite by 3)
      // Favorite covers if they win by MORE than the spread
      const margin = favScore - dogScore;
      const favoriteCovered = margin > Math.abs(spread);
      
      // Determine if over hit
      const overHit = totalScore > total;
      
      games.push({
        week: currentWeek,
        favorite,
        underdog,
        spread, // negative number (e.g., -3 means favorite by 3)
        total,
        actualWinner,
        favScore,
        dogScore,
        totalScore,
        favoriteCovered,
        overHit,
      });
    } catch (err) {
      continue;
    }
  }
  
  console.log(`\n✅ Parsed ${games.length} games total\n`);
  return games;
}

// Make predictions for a single game
function predictGame(home, away, week, teamStats) {
  const homeStats = teamStats[home];
  const awayStats = teamStats[away];
  
  if (!homeStats || !awayStats) {
    throw new Error(`Missing stats for ${home} or ${away} in week ${week}`);
  }
  
  // Power rating difference (with home field advantage)
  const homeFieldAdvantage = 2.5;
  const powerDiff = homeStats.power - awayStats.power + homeFieldAdvantage;
  
  // EPA-based metrics
  const epaAdvantage = (homeStats.offEPA - awayStats.defEPA) - (awayStats.offEPA - homeStats.defEPA);
  
  // Predicted margin (positive = home favored)
  const predictedMargin = (powerDiff * 0.15) + (epaAdvantage * 10);
  
  // Predicted total (based on average scoring + pace)
  const predictedTotal = homeStats.avgScore + awayStats.avgScore + 
                         (homeStats.offEPA * 15) + (awayStats.offEPA * 15);
  
  // Moneyline prediction
  const mlPrediction = predictedMargin > 0 ? home : away;
  const mlConfidence = 50 + Math.min(Math.abs(predictedMargin) * 2, 30);
  
  return {
    mlPrediction,
    mlConfidence,
    predictedMargin, // positive = home favored
    predictedTotal,
  };
}

// Update team stats after a week completes
function updateTeamStats(weekResults, teamStats) {
  const learningRate = 0.15;
  
  for (const game of weekResults) {
    const { favorite, underdog, favScore, dogScore } = game;
    
    const favStats = teamStats[favorite];
    const dogStats = teamStats[underdog];
    
    if (!favStats || !dogStats) continue;
    
    // Update records
    if (favScore > dogScore) {
      favStats.wins++;
      dogStats.losses++;
    } else {
      favStats.losses++;
      dogStats.wins++;
    }
    
    // Update scoring averages
    const gamesPlayed = favStats.wins + favStats.losses;
    favStats.avgScore = (favStats.avgScore * (gamesPlayed - 1) + favScore) / gamesPlayed;
    favStats.avgAllowed = (favStats.avgAllowed * (gamesPlayed - 1) + dogScore) / gamesPlayed;
    
    dogStats.avgScore = (dogStats.avgScore * (gamesPlayed - 1) + dogScore) / gamesPlayed;
    dogStats.avgAllowed = (dogStats.avgAllowed * (gamesPlayed - 1) + favScore) / gamesPlayed;
    
    // Update power ratings based on actual performance vs expectation
    const expectedMargin = (favStats.power - dogStats.power) * 0.15;
    const actualMargin = favScore - dogScore;
    const surprise = actualMargin - expectedMargin;
    
    favStats.power += surprise * learningRate;
    dogStats.power -= surprise * learningRate;
    
    // Clamp power ratings
    favStats.power = Math.max(50, Math.min(100, favStats.power));
    dogStats.power = Math.max(50, Math.min(100, dogStats.power));
  }
}

// Run the full backtest
async function runEnhancedBacktest() {
  console.log('🏈 NFL 2024 Enhanced Backtest - Moneyline, Spread & Totals\n');
  console.log('⏳ Parsing Vegas lines...\n');
  
  const allGames = await parseVegasLines();
  const teamStats = initializeTeamStats();
  
  // Group games by week
  const gamesByWeek = {};
  for (const game of allGames) {
    if (!gamesByWeek[game.week]) {
      gamesByWeek[game.week] = [];
    }
    gamesByWeek[game.week].push(game);
  }
  
  const results = [];
  let mlRecord = { wins: 0, losses: 0, pushes: 0 };
  let atsRecord = { wins: 0, losses: 0, pushes: 0 };
  let ouRecord = { wins: 0, losses: 0, pushes: 0 };
  
  let mlUnits = 0;
  let atsUnits = 0;
  let ouUnits = 0;
  
  // Process each week sequentially
  for (let week = 1; week <= 18; week++) {
    const weekGames = gamesByWeek[week] || [];
    if (weekGames.length === 0) continue;
    
    console.log(`\n📅 Week ${week} - Using data from weeks 1-${week - 1 || 'preseason'}`);
    
    for (const game of weekGames) {
      const { favorite, underdog, spread, total, actualWinner, favScore, dogScore, totalScore, favoriteCovered, overHit } = game;
      
      // Determine home/away (favorite is usually home if @ not present, but we'll use favorite as "home" for power calc)
      // For simplicity, treat favorite as home team
      const prediction = predictGame(favorite, underdog, week, teamStats);
      
      // MONEYLINE BET
      const mlCorrect = prediction.mlPrediction === actualWinner;
      // Calculate edge the same way as true backtest
      const powerDiff = Math.abs(prediction.predictedMargin);
      const mlEdge = powerDiff * 10; // Edge calculation matching true backtest
      // Use EXACT same threshold as validated backtest: confidence >= 60 AND edge >= 5
      const mlBet = prediction.mlConfidence >= 60 && mlEdge >= 5;
      const mlUnitsRisked = mlBet ? Math.min(mlEdge / 10, 3) : 0;
      
      if (mlBet) {
        if (mlCorrect) {
          mlRecord.wins++;
          mlUnits += mlUnitsRisked;
        } else {
          mlRecord.losses++;
          mlUnits -= mlUnitsRisked;
        }
      }
      
      // SPREAD BET (ATS)
      // Model's predicted margin vs Vegas spread
      const modelMargin = prediction.predictedMargin; // positive = favorite favored
      const vegasLine = spread; // negative number (e.g., -3)
      
      // Model's edge vs Vegas (in points)
      // If model predicts favorite -7 and Vegas has -3, that's 4 points of value on favorite
      // spreadEdge = modelMargin - vegasLine = -7 - (-3) = -4 (negative = take favorite)
      const spreadEdge = modelMargin - vegasLine;
      
      let atsPick = null;
      let atsCorrect = false;
      let atsBet = false;
      let atsUnitsRisked = 0;
      
      if (Math.abs(spreadEdge) >= 3.5) { // 3.5+ point edge required (higher bar than ML)
        atsBet = true;
        
        // If spreadEdge is negative, model predicts bigger favorite win than Vegas
        // Example: model -7, Vegas -3, edge = -4, take FAVORITE
        // If spreadEdge is positive, model predicts smaller favorite win (or underdog win)
        // Example: model -2, Vegas -6, edge = +4, take UNDERDOG
        atsPick = spreadEdge < 0 ? favorite : underdog;
        atsUnitsRisked = Math.min(Math.abs(spreadEdge) / 4, 2.5);
        
        // Check if pick covered
        if (atsPick === favorite) {
          atsCorrect = favoriteCovered;
        } else {
          atsCorrect = !favoriteCovered;
        }
        
        if (atsCorrect) {
          atsRecord.wins++;
          atsUnits += atsUnitsRisked;
        } else {
          atsRecord.losses++;
          atsUnits -= atsUnitsRisked;
        }
      }
      
      // TOTAL BET (O/U)
      const modelTotal = prediction.predictedTotal;
      const totalEdge = modelTotal - total; // Positive = model predicts higher
      
      let ouPick = null;
      let ouCorrect = false;
      let ouBet = false;
      let ouUnitsRisked = 0;
      
      if (Math.abs(totalEdge) >= 4.0) { // 4+ point edge required (higher bar than ML)
        ouBet = true;
        ouPick = totalEdge > 0 ? 'Over' : 'Under';
        ouUnitsRisked = Math.min(Math.abs(totalEdge) / 5, 2);
        
        if (ouPick === 'Over') {
          ouCorrect = overHit;
        } else {
          ouCorrect = !overHit;
        }
        
        if (ouCorrect) {
          ouRecord.wins++;
          ouUnits += ouUnitsRisked;
        } else {
          ouRecord.losses++;
          ouUnits -= ouUnitsRisked;
        }
      }
      
      // Store result
      results.push({
        week,
        favorite,
        underdog,
        spread,
        total,
        actualWinner,
        score: `${favScore}-${dogScore}`,
        totalScore,
        
        // ML
        mlPrediction: prediction.mlPrediction,
        mlConfidence: prediction.mlConfidence.toFixed(1),
        mlBet,
        mlCorrect,
        mlUnits: mlBet ? (mlCorrect ? `+${mlUnitsRisked.toFixed(1)}` : `-${mlUnitsRisked.toFixed(1)}`) : '-',
        
        // ATS
        modelMargin: prediction.predictedMargin.toFixed(1),
        spreadEdge: spreadEdge.toFixed(1),
        atsPick: atsBet ? atsPick : '-',
        atsBet,
        atsCorrect,
        atsUnits: atsBet ? (atsCorrect ? `+${atsUnitsRisked.toFixed(1)}` : `-${atsUnitsRisked.toFixed(1)}`) : '-',
        
        // O/U
        modelTotal: prediction.predictedTotal.toFixed(1),
        totalEdge: totalEdge.toFixed(1),
        ouPick: ouBet ? ouPick : '-',
        ouBet,
        ouCorrect,
        ouUnits: ouBet ? (ouCorrect ? `+${ouUnitsRisked.toFixed(1)}` : `-${ouUnitsRisked.toFixed(1)}`) : '-',
      });
    }
    
    // CRITICAL: Update stats AFTER all predictions for the week are made
    updateTeamStats(weekGames, teamStats);
  }
  
  // Calculate summary stats
  const mlTotal = mlRecord.wins + mlRecord.losses;
  const mlWinPct = mlTotal > 0 ? (mlRecord.wins / mlTotal * 100).toFixed(1) : 0;
  const mlROI = mlTotal > 0 ? (mlUnits / (mlRecord.wins + mlRecord.losses) * 100).toFixed(1) : 0;
  
  const atsTotal = atsRecord.wins + atsRecord.losses;
  const atsWinPct = atsTotal > 0 ? (atsRecord.wins / atsTotal * 100).toFixed(1) : 0;
  const atsROI = atsTotal > 0 ? (atsUnits / (atsRecord.wins + atsRecord.losses) * 100).toFixed(1) : 0;
  
  const ouTotal = ouRecord.wins + ouRecord.losses;
  const ouWinPct = ouTotal > 0 ? (ouRecord.wins / ouTotal * 100).toFixed(1) : 0;
  const ouROI = ouTotal > 0 ? (ouUnits / (ouRecord.wins + ouRecord.losses) * 100).toFixed(1) : 0;
  
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 ENHANCED BACKTEST RESULTS - 2024 NFL REGULAR SEASON');
  console.log('='.repeat(80));
  
  console.log('\n💰 MONEYLINE BETTING:');
  console.log(`   Record: ${mlRecord.wins}-${mlRecord.losses} (${mlWinPct}%)`);
  console.log(`   Total Units: ${mlUnits >= 0 ? '+' : ''}${mlUnits.toFixed(1)}U`);
  console.log(`   ROI: ${mlROI}%`);
  console.log(`   Breakeven: 52.4% (with -110 odds)`);
  console.log(`   Edge: ${(parseFloat(mlWinPct) - 52.4).toFixed(1)}%`);
  
  console.log('\n📏 AGAINST THE SPREAD (ATS):');
  console.log(`   Record: ${atsRecord.wins}-${atsRecord.losses} (${atsWinPct}%)`);
  console.log(`   Total Units: ${atsUnits >= 0 ? '+' : ''}${atsUnits.toFixed(1)}U`);
  console.log(`   ROI: ${atsROI}%`);
  console.log(`   Breakeven: 52.4% (with -110 odds)`);
  console.log(`   Edge: ${(parseFloat(atsWinPct) - 52.4).toFixed(1)}%`);
  
  console.log('\n🎯 OVER/UNDER TOTALS:');
  console.log(`   Record: ${ouRecord.wins}-${ouRecord.losses} (${ouWinPct}%)`);
  console.log(`   Total Units: ${ouUnits >= 0 ? '+' : ''}${ouUnits.toFixed(1)}U`);
  console.log(`   ROI: ${ouROI}%`);
  console.log(`   Breakeven: 52.4% (with -110 odds)`);
  console.log(`   Edge: ${(parseFloat(ouWinPct) - 52.4).toFixed(1)}%`);
  
  console.log('\n🎰 COMBINED TOTALS:');
  const totalBets = mlTotal + atsTotal + ouTotal;
  const totalWins = mlRecord.wins + atsRecord.wins + ouRecord.wins;
  const totalUnits = mlUnits + atsUnits + ouUnits;
  const combinedWinPct = (totalWins / totalBets * 100).toFixed(1);
  const combinedROI = (totalUnits / totalBets * 100).toFixed(1);
  
  console.log(`   Total Bets: ${totalBets} (${mlTotal} ML + ${atsTotal} ATS + ${ouTotal} O/U)`);
  console.log(`   Overall Win Rate: ${totalWins}-${totalBets - totalWins} (${combinedWinPct}%)`);
  console.log(`   Total Units: ${totalUnits >= 0 ? '+' : ''}${totalUnits.toFixed(1)}U`);
  console.log(`   Combined ROI: ${combinedROI}%`);
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  // Save detailed results to CSV
  const csvPath = path.join(__dirname, '..', 'backtest-results', 'nfl-2024-enhanced-predictions.csv');
  const headers = [
    'week', 'favorite', 'underdog', 'spread', 'total', 'actualWinner', 'score', 'totalScore',
    'mlPrediction', 'mlConfidence', 'mlBet', 'mlCorrect', 'mlUnits',
    'modelMargin', 'spreadEdge', 'atsPick', 'atsBet', 'atsCorrect', 'atsUnits',
    'modelTotal', 'totalEdge', 'ouPick', 'ouBet', 'ouCorrect', 'ouUnits'
  ];
  
  const csvRows = [headers.join(',')];
  for (const r of results) {
    csvRows.push([
      r.week, r.favorite, r.underdog, r.spread, r.total, r.actualWinner, r.score, r.totalScore,
      r.mlPrediction, r.mlConfidence, r.mlBet, r.mlCorrect, r.mlUnits,
      r.modelMargin, r.spreadEdge, r.atsPick, r.atsBet, r.atsCorrect, r.atsUnits,
      r.modelTotal, r.totalEdge, r.ouPick, r.ouBet, r.ouCorrect, r.ouUnits
    ].join(','));
  }
  
  await fs.writeFile(csvPath, csvRows.join('\n'));
  console.log(`✅ Detailed results saved to: ${csvPath}\n`);
  
  // Save summary JSON
  const summaryPath = path.join(__dirname, '..', 'backtest-results', 'nfl-2024-enhanced-summary.json');
  const summary = {
    generatedAt: new Date().toISOString(),
    methodology: 'Time-constrained backtest with NO future knowledge. Week N predictions use only Weeks 1 through N-1 data.',
    moneyline: {
      record: `${mlRecord.wins}-${mlRecord.losses}`,
      winPct: mlWinPct + '%',
      units: mlUnits.toFixed(1) + 'U',
      roi: mlROI + '%',
      edge: (parseFloat(mlWinPct) - 52.4).toFixed(1) + '%',
    },
    spread: {
      record: `${atsRecord.wins}-${atsRecord.losses}`,
      winPct: atsWinPct + '%',
      units: atsUnits.toFixed(1) + 'U',
      roi: atsROI + '%',
      edge: (parseFloat(atsWinPct) - 52.4).toFixed(1) + '%',
    },
    totals: {
      record: `${ouRecord.wins}-${ouRecord.losses}`,
      winPct: ouWinPct + '%',
      units: ouUnits.toFixed(1) + 'U',
      roi: ouROI + '%',
      edge: (parseFloat(ouWinPct) - 52.4).toFixed(1) + '%',
    },
    combined: {
      totalBets,
      totalWins,
      winPct: combinedWinPct + '%',
      units: totalUnits.toFixed(1) + 'U',
      roi: combinedROI + '%',
    },
  };
  
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`✅ Summary saved to: ${summaryPath}\n`);
}

// Run the backtest
runEnhancedBacktest().catch(console.error);
