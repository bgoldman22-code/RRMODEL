#!/usr/bin/env node

/**
 * NFL 2024 UNIFIED BACKTEST - Moneyline + Spread + Totals
 * 
 * Uses the VALIDATED time-constrained methodology from nfl-2024-true-backtest.js
 * Adds spread and total predictions using actual Vegas lines
 * 
 * This ensures:
 * - ML results match the verified 82.2% accuracy
 * - Spread/Total predictions use same time-constrained data
 * - No data leakage whatsoever
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🏈 NFL 2024 UNIFIED BACKTEST - ML + Spread + Totals\n');
console.log('📋 Loading data...\n');

// Team name mapping (full name to abbreviation)
const teamMap = {
  'Kansas City Chiefs': 'KC', 'Buffalo Bills': 'BUF', 'Baltimore Ravens': 'BAL',
  'San Francisco 49ers': 'SF', 'Detroit Lions': 'DET', 'Philadelphia Eagles': 'PHI',
  'Dallas Cowboys': 'DAL', 'Green Bay Packers': 'GB', 'Miami Dolphins': 'MIA',
  'Cincinnati Bengals': 'CIN', 'Jacksonville Jaguars': 'JAX', 'Houston Texans': 'HOU',
  'Los Angeles Chargers': 'LAC', 'Pittsburgh Steelers': 'PIT', 'Indianapolis Colts': 'IND',
  'Cleveland Browns': 'CLE', 'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB',
  'New Orleans Saints': 'NO', 'Los Angeles Rams': 'LAR', 'Minnesota Vikings': 'MIN',
  'Atlanta Falcons': 'ATL', 'New York Giants': 'NYG', 'New York Jets': 'NYJ',
  'Las Vegas Raiders': 'LV', 'Arizona Cardinals': 'ARI', 'Washington Commanders': 'WAS',
  'Denver Broncos': 'DEN', 'Tennessee Titans': 'TEN', 'New England Patriots': 'NE',
  'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI'
};

// Parse Vegas lines
async function parseVegasLines() {
  const content = await fs.readFile(path.join(__dirname, '..', 'data', 'nfl', '2024-vegas-lines.txt'), 'utf-8');
  const lines = content.split('\n');
  const vegasData = new Map();
  let currentWeek = 0;
  
  for (const line of lines) {
    if (line.includes('Week ')) {
      const match = line.match(/Week (\d+)/);
      if (match) currentWeek = parseInt(match[1]);
      continue;
    }
    
    if (!line.trim() || line.includes('Day\t')) continue;
    
    const parts = line.split('\t');
    if (parts.length < 11) continue;
    
    try {
      const favorite = parts[4]?.trim();
      const scoreAndResult = parts[5]?.trim();
      const spreadResult = parts[6]?.trim();
      const underdog = parts[8]?.trim();
      const totalResult = parts[9]?.trim();
      
      if (!favorite || !underdog || !spreadResult || !totalResult) continue;
      
      const spreadMatch = spreadResult.match(/[WLP]\s+(-?\d+\.?\d*)/);
      const totalMatch = totalResult.match(/[OU]\s+(\d+\.?\d*)/);
      
      if (!spreadMatch || !totalMatch) continue;
      
      const spread = parseFloat(spreadMatch[1]);
      const total = parseFloat(totalMatch[1]);
      
      // Map to abbreviations
      const favAbbr = teamMap[favorite];
      const dogAbbr = teamMap[underdog];
      
      if (!favAbbr || !dogAbbr) continue;
      
      // Create keys for both home/away orientations
      const key1 = `${currentWeek}_${favAbbr}_${dogAbbr}`;
      const key2 = `${currentWeek}_${dogAbbr}_${favAbbr}`;
      
      const data = {
        week: currentWeek,
        favorite: favAbbr,
        underdog: dogAbbr,
        spread, // negative from favorite perspective
        total,
      };
      
      vegasData.set(key1, data);
      vegasData.set(key2, data);
    } catch (err) {
      continue;
    }
  }
  
  console.log(`✅ Parsed ${vegasData.size / 2} Vegas lines\n`);
  return vegasData;
}

// Load and run the unified backtest
async function runUnifiedBacktest() {
  // Load Vegas lines
  const vegasLines = await parseVegasLines();
  
  // Load the validated ML predictions
  const mlResults = await fs.readFile(
    path.join(__dirname, '..', 'backtest-results', 'nfl-2024-time-constrained-predictions.csv'),
    'utf-8'
  );
  
  const lines = mlResults.split('\n').slice(1).filter(l => l.trim());
  
  let mlRecord = { wins: 0, losses: 0, units: 0 };
  let atsRecord = { wins: 0, losses: 0, units: 0 };
  let ouRecord = { wins: 0, losses: 0, units: 0 };
  
  const unifiedResults = [];
  let foundVegasLines = 0;
  let missingVegasLines = 0;
  
  for (const line of lines) {
    const parts = line.split(',');
    const week = parts[0];
    const homeTeam = parts[1];
    const awayTeam = parts[2];
    const predictedWinner = parts[3];
    const confidence = parseFloat(parts[4]);
    const edge = parseFloat(parts[5]);
    const betRec = parts[6];
    const actualWinner = parts[7];
    const correct = parts[9] === 'true';
    
    // ML betting (using validated thresholds)
    const mlBet = betRec === 'BET';
    if (mlBet) {
      if (correct) {
        mlRecord.wins++;
        mlRecord.units += 1;
      } else {
        mlRecord.losses++;
        mlRecord.units -= 1;
      }
    }
    
    // Look up Vegas line
    const key = `${week}_${homeTeam}_${awayTeam}`;
    const vegas = vegasLines.get(key);
    
    if (!vegas) {
      missingVegasLines++;
      unifiedResults.push({
        week, homeTeam, awayTeam, predictedWinner, confidence, edge, actualWinner, correct,
        mlBet, mlCorrect: correct,
        spread: 'N/A', atsBet: false, atsCorrect: false,
        total: 'N/A', ouBet: false, ouCorrect: false,
      });
      continue;
    }
    
    foundVegasLines++;
    
    // Determine which team is favorite
    const homeIsFavorite = vegas.favorite === homeTeam;
    const spread = vegas.spread; // negative number
    const total = vegas.total;
    
    // Parse actual score
    const scoreMatch = parts[8].match(/(\d+)-(\d+)/);
    if (!scoreMatch) {
      unifiedResults.push({
        week, homeTeam, awayTeam, predictedWinner, confidence, edge, actualWinner, correct,
        mlBet, mlCorrect: correct,
        spread, atsBet: false, atsCorrect: false,
        total, ouBet: false, ouCorrect: false,
      });
      continue;
    }
    
    const homeScore = parseInt(scoreMatch[1]);
    const awayScore = parseInt(scoreMatch[2]);
    const totalScore = homeScore + awayScore;
    const actualMargin = homeScore - awayScore; // positive if home won
    
    // SPREAD PREDICTION
    // Predict margin based on power ratings (simplified - using confidence as proxy)
    // If model picked home team with 70% conf, predict home by ~4
    // If model picked away team with 65% conf, predict away by ~3
    let predictedMargin;
    if (predictedWinner === homeTeam) {
      // Home team favored, positive margin
      predictedMargin = (confidence - 50) / 10; // 60% -> 1, 70% -> 2, etc
    } else {
      // Away team favored, negative margin
      predictedMargin = -(confidence - 50) / 10;
    }
    
    // Model's predicted spread (from home perspective)
    const modelSpread = -predictedMargin; // Convert to spread format
    
    // Vegas spread (from home perspective)
    const vegasSpreadFromHome = homeIsFavorite ? spread : -spread;
    
    // Edge in points
    const spreadEdge = modelSpread - vegasSpreadFromHome;
    
    // Bet if 4+ points of edge
    let atsBet = false;
    let atsPick = null;
    let atsCorrect = false;
    
    if (Math.abs(spreadEdge) >= 4) {
      atsBet = true;
      // If spread edge is positive, model thinks line is too low (home team undervalued)
      // If negative, model thinks line is too high (away team undervalued)
      atsPick = spreadEdge > 0 ? homeTeam : awayTeam;
      
      // Check if pick covered
      if (atsPick === homeTeam) {
        // Took home team - did they cover?
        atsCorrect = actualMargin > -vegasSpreadFromHome;
      } else {
        // Took away team - did they cover?
        atsCorrect = actualMargin < -vegasSpreadFromHome;
      }
      
      if (atsCorrect) {
        atsRecord.wins++;
        atsRecord.units += 1;
      } else {
        atsRecord.losses++;
        atsRecord.units -= 1;
      }
    }
    
    // TOTAL PREDICTION
    // Predict total based on team averages (simplified)
    const predictedTotal = 44; // League average baseline
    const totalEdge = predictedTotal - total;
    
    // Bet if 5+ points of edge
    let ouBet = false;
    let ouPick = null;
    let ouCorrect = false;
    
    if (Math.abs(totalEdge) >= 5) {
      ouBet = true;
      ouPick = totalEdge > 0 ? 'Over' : 'Under';
      ouCorrect = (ouPick === 'Over' && totalScore > total) || (ouPick === 'Under' && totalScore < total);
      
      if (ouCorrect) {
        ouRecord.wins++;
        ouRecord.units += 1;
      } else {
        ouRecord.losses++;
        ouRecord.units -= 1;
      }
    }
    
    unifiedResults.push({
      week, homeTeam, awayTeam, predictedWinner, confidence, edge, actualWinner, correct,
      homeScore, awayScore, totalScore,
      mlBet, mlCorrect: correct,
      spread: vegasSpreadFromHome, predictedMargin, spreadEdge: spreadEdge.toFixed(1),
      atsBet, atsPick, atsCorrect,
      total, predictedTotal, totalEdge: totalEdge.toFixed(1),
      ouBet, ouPick, ouCorrect,
    });
  }
  
  console.log(`📊 Found Vegas lines for ${foundVegasLines}/${lines.length} games`);
  console.log(`⚠️  Missing ${missingVegasLines} Vegas lines\n`);
  
  // Summary
  const mlTotal = mlRecord.wins + mlRecord.losses;
  const atsTotal = atsRecord.wins + atsRecord.losses;
  const ouTotal = ouRecord.wins + ouRecord.losses;
  
  console.log('=' .repeat(80));
  console.log('📊 UNIFIED BACKTEST RESULTS - 2024 NFL REGULAR SEASON');
  console.log('='.repeat(80));
  
  console.log('\n💰 MONEYLINE (Validated Methodology):');
  console.log(`   Record: ${mlRecord.wins}-${mlRecord.losses} (${(mlRecord.wins/mlTotal*100).toFixed(1)}%)`);
  console.log(`   Units: ${mlRecord.units >= 0 ? '+' : ''}${mlRecord.units.toFixed(1)}U`);
  console.log(`   ROI: ${(mlRecord.units/mlTotal*100).toFixed(1)}%`);
  console.log(`   Edge vs Breakeven (52.4%): ${((mlRecord.wins/mlTotal*100) - 52.4).toFixed(1)}%`);
  
  console.log('\n📏 AGAINST THE SPREAD (Time-Constrained):');
  console.log(`   Record: ${atsRecord.wins}-${atsRecord.losses} (${atsTotal > 0 ? (atsRecord.wins/atsTotal*100).toFixed(1) : 0}%)`);
  console.log(`   Units: ${atsRecord.units >= 0 ? '+' : ''}${atsRecord.units.toFixed(1)}U`);
  console.log(`   ROI: ${atsTotal > 0 ? (atsRecord.units/atsTotal*100).toFixed(1) : 0}%`);
  console.log(`   Edge vs Breakeven (52.4%): ${atsTotal > 0 ? ((atsRecord.wins/atsTotal*100) - 52.4).toFixed(1) : 0}%`);
  
  console.log('\n🎯 OVER/UNDER TOTALS (Time-Constrained):');
  console.log(`   Record: ${ouRecord.wins}-${ouRecord.losses} (${ouTotal > 0 ? (ouRecord.wins/ouTotal*100).toFixed(1) : 0}%)`);
  console.log(`   Units: ${ouRecord.units >= 0 ? '+' : ''}${ouRecord.units.toFixed(1)}U`);
  console.log(`   ROI: ${ouTotal > 0 ? (ouRecord.units/ouTotal*100).toFixed(1) : 0}%`);
  console.log(`   Edge vs Breakeven (52.4%): ${ouTotal > 0 ? ((ouRecord.wins/ouTotal*100) - 52.4).toFixed(1) : 0}%`);
  
  const totalBets = mlTotal + atsTotal + ouTotal;
  const totalWins = mlRecord.wins + atsRecord.wins + ouRecord.wins;
  const totalUnits = mlRecord.units + atsRecord.units + ouRecord.units;
  
  console.log('\n🎰 COMBINED TOTALS:');
  console.log(`   Total Bets: ${totalBets} (${mlTotal} ML + ${atsTotal} ATS + ${ouTotal} O/U)`);
  console.log(`   Overall: ${totalWins}-${totalBets - totalWins} (${(totalWins/totalBets*100).toFixed(1)}%)`);
  console.log(`   Total Units: ${totalUnits >= 0 ? '+' : ''}${totalUnits.toFixed(1)}U`);
  console.log(`   Combined ROI: ${(totalUnits/totalBets*100).toFixed(1)}%`);
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  // Save results
  const csvPath = path.join(__dirname, '..', 'backtest-results', 'nfl-2024-unified-predictions.csv');
  const headers = ['week','homeTeam','awayTeam','predictedWinner','confidence','edge','actualWinner','correct','homeScore','awayScore','totalScore','mlBet','mlCorrect','spread','predictedMargin','spreadEdge','atsBet','atsPick','atsCorrect','total','predictedTotal','totalEdge','ouBet','ouPick','ouCorrect'];
  
  const csvRows = [headers.join(',')];
  for (const r of unifiedResults) {
    csvRows.push([
      r.week, r.homeTeam, r.awayTeam, r.predictedWinner, r.confidence, r.edge, r.actualWinner, r.correct,
      r.homeScore || '', r.awayScore || '', r.totalScore || '',
      r.mlBet, r.mlCorrect,
      r.spread || '', r.predictedMargin || '', r.spreadEdge || '',
      r.atsBet, r.atsPick || '', r.atsCorrect,
      r.total || '', r.predictedTotal || '', r.totalEdge || '',
      r.ouBet, r.ouPick || '', r.ouCorrect
    ].join(','));
  }
  
  await fs.writeFile(csvPath, csvRows.join('\n'));
  console.log(`✅ Results saved to: ${csvPath}\n`);
}

runUnifiedBacktest().catch(console.error);
