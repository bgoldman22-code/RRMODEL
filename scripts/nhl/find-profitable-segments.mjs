#!/usr/bin/env node

/**
 * FIND PROFITABLE SEGMENTS
 * 
 * The overall model is -2.62% ROI, but are there specific segments that ARE profitable?
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const analysisPath = path.join(REPO_ROOT, 'data/nhl/calibrated_bet_analysis.json');
const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║       🔍 FIND PROFITABLE SEGMENTS                                  ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

const bets = analysis.bets;

// Test various filters
function testFilter(name, filterFn) {
  const filtered = bets.filter(filterFn);
  if (filtered.length === 0) return null;
  
  const wins = filtered.filter(b => b.won).length;
  const winRate = (wins / filtered.length * 100).toFixed(1);
  const profit = filtered.reduce((sum, b) => sum + b.profit, 0);
  const roi = (profit / filtered.length * 100).toFixed(1);
  
  return {
    name,
    bets: filtered.length,
    wins,
    winRate: parseFloat(winRate),
    profit,
    roi: parseFloat(roi)
  };
}

const segments = [
  // Bet type filters
  testFilter('All Under Bets', b => b.betSide === 'under'),
  testFilter('Under 2.5 line', b => b.betSide === 'under' && b.line === 2.5),
  testFilter('Under 3.5 line', b => b.betSide === 'under' && b.line === 3.5),
  
  // Edge-based filters  
  testFilter('Low edge Under (<0.5)', b => b.betSide === 'under' && Math.abs(b.predicted - b.line) < 0.5),
  testFilter('Medium edge Under (0.5-1.0)', b => b.betSide === 'under' && Math.abs(b.predicted - b.line) >= 0.5 && Math.abs(b.predicted - b.line) < 1.0),
  
  // Prediction range filters
  testFilter('Pred < 2.5 (under only)', b => b.betSide === 'under' && b.predicted < 2.5),
  testFilter('Pred 2.5-3.0 (under only)', b => b.betSide === 'under' && b.predicted >= 2.5 && b.predicted < 3.0),
  
  // Combined filters
  testFilter('Under 2.5, pred < 2.3', b => b.betSide === 'under' && b.line === 2.5 && b.predicted < 2.3),
  testFilter('Under 3.5, pred < 3.0', b => b.betSide === 'under' && b.line === 3.5 && b.predicted < 3.0),
  
  // Over filters (for comparison)
  testFilter('Over 1.5 line', b => b.betSide === 'over' && b.line === 1.5),
  testFilter('Over, low edge (<0.3)', b => b.betSide === 'over' && Math.abs(b.predicted - b.line) < 0.3),
].filter(s => s !== null);

// Sort by ROI
segments.sort((a, b) => b.roi - a.roi);

console.log('Segment                           | Bets | Wins | Win% |  ROI  | Profit');
console.log('----------------------------------|------|------|------|-------|--------');

segments.forEach(s => {
  const roiColor = s.roi > 5 ? '🟢' : s.roi > 0 ? '🟡' : '🔴';
  console.log(
    `${s.name.padEnd(34)}| ${s.bets.toString().padStart(4)} | ${s.wins.toString().padStart(4)} | ${s.winRate.toFixed(1).padStart(4)}% | ${s.roi > 0 ? '+' : ''}${s.roi.toFixed(1).padStart(5)}% | ${roiColor} ${s.profit > 0 ? '+' : ''}${s.profit.toFixed(2)}`
  );
});

// Find the best segment
const best = segments[0];

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('🎯 BEST SEGMENT');
console.log('═══════════════════════════════════════════════════════════════════\n');

if (best.roi > 3) {
  console.log(`✅ Found profitable segment: ${best.name}`);
  console.log(`   Bets: ${best.bets}`);
  console.log(`   Win Rate: ${best.winRate}%`);
  console.log(`   ROI: ${best.roi > 0 ? '+' : ''}${best.roi}%`);
  console.log(`   Total Profit: ${best.profit > 0 ? '+' : ''}${best.profit.toFixed(2)} units\n`);
  
  console.log('💡 This segment could be profitable at scale (Pass 2)!\n');
} else if (best.roi > 0) {
  console.log(`⚠️  Marginal segment: ${best.name}`);
  console.log(`   ROI: ${best.roi}% is barely profitable`);
  console.log(`   Sample size: ${best.bets} bets (may not hold at scale)\n`);
} else {
  console.log(`❌ No profitable segments found`);
  console.log(`   Best ROI: ${best.roi}%`);
  console.log(`   Market appears too efficient to beat with current model\n`);
}
