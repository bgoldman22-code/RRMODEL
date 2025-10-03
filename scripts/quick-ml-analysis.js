#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function quickAnalysis() {
  console.log('🔍 Quick ML Analysis\n');
  
  // Load unified results
  const csv = await fs.readFile(
    path.join(__dirname, '..', 'backtest-results', 'nfl-2024-unified-predictions.csv'),
    'utf-8'
  );
  
  const lines = csv.split('\n').slice(1).filter(l => l.trim());
  
  let upsets = 0;
  let favorites = 0;
  let mlBets = 0;
  
  // Load Vegas lines to see who was favorite
  const vegasContent = await fs.readFile(
    path.join(__dirname, '..', 'data', 'nfl', '2024-vegas-lines.txt'),
    'utf-8'
  );
  
  const vegasMap = new Map();
  const vegasLines = vegasContent.split('\n');
  let week = 0;
  
  for (const line of vegasLines) {
    if (line.includes('Week ')) {
      const m = line.match(/Week (\d+)/);
      if (m) week = parseInt(m[1]);
      continue;
    }
    
    const parts = line.split('\t');
    if (parts.length < 11) continue;
    
    const fav = parts[4]?.trim();
    const dog = parts[8]?.trim();
    const spreadStr = parts[6]?.trim();
    
    if (!fav || !dog || !spreadStr) continue;
    
    const spreadMatch = spreadStr.match(/[WLP]\s+(-?\d+\.?\d*)/);
    if (!spreadMatch) continue;
    
    const spread = Math.abs(parseFloat(spreadMatch[1]));
    
    // Store who was favorite
    vegasMap.set(`${week}_${fav}_${dog}`, { favorite: fav, spread });
    vegasMap.set(`${week}_${dog}_${fav}`, { favorite: fav, spread });
  }
  
  console.log(`📊 Analyzing ${lines.length} games...\n`);
  
  for (const line of lines) {
    const parts = line.split(',');
    const week = parts[0];
    const homeTeam = parts[1];
    const awayTeam = parts[2];
    const predictedWinner = parts[3];
    const mlBet = parts[11] === 'true';
    const mlCorrect = parts[12] === 'true';
    
    if (!mlBet) continue;
    
    mlBets++;
    
    // Find Vegas favorite
    const key = `${week}_${homeTeam}_${awayTeam}`;
    const vegasInfo = vegasMap.get(key);
    
    if (!vegasInfo) continue;
    
    const vegasFavorite = vegasInfo.favorite;
    const spread = vegasInfo.spread;
    
    // Did we pick the underdog?
    const pickedUnderdog = predictedWinner !== vegasFavorite;
    
    if (pickedUnderdog && mlCorrect) {
      upsets++;
      console.log(`✅ UPSET: Week ${week} - Picked ${predictedWinner} (dog by ${spread}) over ${vegasFavorite}`);
    } else if (!pickedUnderdog) {
      favorites++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 ML BET BREAKDOWN');
  console.log('='.repeat(60));
  console.log(`Total ML Bets: ${mlBets}`);
  console.log(`Picked Favorites: ${favorites} (${(favorites/mlBets*100).toFixed(1)}%)`);
  console.log(`Picked Underdogs: ${mlBets - favorites} (${((mlBets-favorites)/mlBets*100).toFixed(1)}%)`);
  console.log(`Successful Upsets: ${upsets}`);
  console.log('='.repeat(60));
  
  console.log('\n⚠️  NOTE: Current backtest assumes:');
  console.log('   - All ML bets risked 1 unit to win 1 unit');
  console.log('   - Does NOT account for actual ML odds');
  console.log('   - Favorites require risking MORE to win less');
  console.log('   - Real profit would be LOWER\n');
}

quickAnalysis();
