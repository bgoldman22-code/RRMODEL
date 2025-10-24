#!/usr/bin/env node

/**
 * COMPREHENSIVE PROFITABLE SEGMENT SEARCH
 * 
 * Test MANY combinations to find all profitable segments
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
console.log('║       🔍 COMPREHENSIVE SEGMENT SEARCH (UNDERS FOCUS)              ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

const bets = analysis.bets;

// Test function
function testFilter(name, filterFn, minBets = 5) {
  const filtered = bets.filter(filterFn);
  if (filtered.length < minBets) return null;
  
  const wins = filtered.filter(b => b.won).length;
  const winRate = (wins / filtered.length * 100);
  const profit = filtered.reduce((sum, b) => sum + b.profit, 0);
  const roi = (profit / filtered.length * 100);
  
  // Calculate breakeven win rate based on average odds
  const avgOdds = filtered.reduce((sum, b) => {
    const odds = b.betSide === 'over' ? filtered[0].betSide : b.betSide; // Simplified
    return sum + 1.8; // Approximate
  }, 0) / filtered.length;
  const breakevenRate = (1 / 1.8 * 100);
  const edge = winRate - breakevenRate;
  
  return {
    name,
    bets: filtered.length,
    wins,
    winRate,
    profit,
    roi,
    edge
  };
}

const segments = [];

// ============================================================================
// CATEGORY 1: BY LINE VALUE (UNDERS)
// ============================================================================
console.log('Testing by line value...');

segments.push(testFilter('Under 1.5', b => b.betSide === 'under' && b.line === 1.5));
segments.push(testFilter('Under 2.5', b => b.betSide === 'under' && b.line === 2.5));
segments.push(testFilter('Under 3.5', b => b.betSide === 'under' && b.line === 3.5));
segments.push(testFilter('Under 4.5', b => b.betSide === 'under' && b.line === 4.5));

// ============================================================================
// CATEGORY 2: BY PREDICTION RANGES (UNDERS)
// ============================================================================
console.log('Testing by prediction ranges...');

segments.push(testFilter('Under, pred < 1.5', b => b.betSide === 'under' && b.predicted < 1.5));
segments.push(testFilter('Under, pred 1.5-2.0', b => b.betSide === 'under' && b.predicted >= 1.5 && b.predicted < 2.0));
segments.push(testFilter('Under, pred 2.0-2.5', b => b.betSide === 'under' && b.predicted >= 2.0 && b.predicted < 2.5));
segments.push(testFilter('Under, pred 2.5-3.0', b => b.betSide === 'under' && b.predicted >= 2.5 && b.predicted < 3.0));
segments.push(testFilter('Under, pred 3.0-3.5', b => b.betSide === 'under' && b.predicted >= 3.0 && b.predicted < 3.5));
segments.push(testFilter('Under, pred 3.5-4.0', b => b.betSide === 'under' && b.predicted >= 3.5 && b.predicted < 4.0));

// ============================================================================
// CATEGORY 3: BY EDGE SIZE (UNDERS)
// ============================================================================
console.log('Testing by edge size...');

segments.push(testFilter('Under, edge < 0.2', b => b.betSide === 'under' && Math.abs(b.predicted - b.line) < 0.2));
segments.push(testFilter('Under, edge 0.2-0.4', b => b.betSide === 'under' && Math.abs(b.predicted - b.line) >= 0.2 && Math.abs(b.predicted - b.line) < 0.4));
segments.push(testFilter('Under, edge 0.4-0.6', b => b.betSide === 'under' && Math.abs(b.predicted - b.line) >= 0.4 && Math.abs(b.predicted - b.line) < 0.6));
segments.push(testFilter('Under, edge 0.6-0.8', b => b.betSide === 'under' && Math.abs(b.predicted - b.line) >= 0.6 && Math.abs(b.predicted - b.line) < 0.8));
segments.push(testFilter('Under, edge 0.8-1.0', b => b.betSide === 'under' && Math.abs(b.predicted - b.line) >= 0.8 && Math.abs(b.predicted - b.line) < 1.0));
segments.push(testFilter('Under, edge 1.0+', b => b.betSide === 'under' && Math.abs(b.predicted - b.line) >= 1.0));

// ============================================================================
// CATEGORY 4: COMBINED FILTERS (LINE + PREDICTION)
// ============================================================================
console.log('Testing combined filters...');

// Under 2.5 variations
segments.push(testFilter('U2.5, pred < 2.0', b => b.betSide === 'under' && b.line === 2.5 && b.predicted < 2.0));
segments.push(testFilter('U2.5, pred 2.0-2.3', b => b.betSide === 'under' && b.line === 2.5 && b.predicted >= 2.0 && b.predicted < 2.3));
segments.push(testFilter('U2.5, pred 2.3-2.5', b => b.betSide === 'under' && b.line === 2.5 && b.predicted >= 2.3 && b.predicted < 2.5));

// Under 3.5 variations
segments.push(testFilter('U3.5, pred < 2.5', b => b.betSide === 'under' && b.line === 3.5 && b.predicted < 2.5));
segments.push(testFilter('U3.5, pred 2.5-3.0', b => b.betSide === 'under' && b.line === 3.5 && b.predicted >= 2.5 && b.predicted < 3.0));
segments.push(testFilter('U3.5, pred 3.0-3.3', b => b.betSide === 'under' && b.line === 3.5 && b.predicted >= 3.0 && b.predicted < 3.3));

// Under 1.5 variations
segments.push(testFilter('U1.5, pred < 1.3', b => b.betSide === 'under' && b.line === 1.5 && b.predicted < 1.3));
segments.push(testFilter('U1.5, pred 1.3-1.5', b => b.betSide === 'under' && b.line === 1.5 && b.predicted >= 1.3 && b.predicted < 1.5));

// ============================================================================
// CATEGORY 5: COMBINED FILTERS (LINE + EDGE)
// ============================================================================
console.log('Testing line + edge combinations...');

segments.push(testFilter('U2.5, edge > 0.5', b => b.betSide === 'under' && b.line === 2.5 && Math.abs(b.predicted - b.line) > 0.5));
segments.push(testFilter('U3.5, edge > 0.5', b => b.betSide === 'under' && b.line === 3.5 && Math.abs(b.predicted - b.line) > 0.5));
segments.push(testFilter('U3.5, edge > 0.7', b => b.betSide === 'under' && b.line === 3.5 && Math.abs(b.predicted - b.line) > 0.7));

// ============================================================================
// CATEGORY 6: OPPOSITE (OVERS for comparison)
// ============================================================================
console.log('Testing overs for comparison...');

segments.push(testFilter('Over 1.5', b => b.betSide === 'over' && b.line === 1.5));
segments.push(testFilter('Over 1.5, pred > 2.0', b => b.betSide === 'over' && b.line === 1.5 && b.predicted > 2.0));
segments.push(testFilter('Over 1.5, edge < 0.5', b => b.betSide === 'over' && b.line === 1.5 && Math.abs(b.predicted - b.line) < 0.5));

// ============================================================================
// RESULTS
// ============================================================================

// Filter out nulls and sort by ROI
const validSegments = segments.filter(s => s !== null).sort((a, b) => b.roi - a.roi);

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('📊 ALL SEGMENTS (Sorted by ROI)');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log('Segment                           | Bets | Wins | Win% |  ROI  | Profit | Status');
console.log('----------------------------------|------|------|------|-------|--------|--------');

validSegments.forEach(s => {
  const status = s.roi > 10 ? '🟢🟢' : s.roi > 5 ? '🟢  ' : s.roi > 0 ? '🟡  ' : '🔴  ';
  console.log(
    `${s.name.padEnd(34)}| ${s.bets.toString().padStart(4)} | ${s.wins.toString().padStart(4)} | ${s.winRate.toFixed(1).padStart(4)}% | ${s.roi > 0 ? '+' : ''}${s.roi.toFixed(1).padStart(5)}% | ${s.profit > 0 ? '+' : ''}${s.profit.toFixed(2).padStart(6)} | ${status}`
  );
});

// ============================================================================
// PROFITABLE SEGMENTS SUMMARY
// ============================================================================

const profitable = validSegments.filter(s => s.roi > 5 && s.bets >= 5);

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('✅ PROFITABLE SEGMENTS (ROI > 5%, Min 5 bets)');
console.log('═══════════════════════════════════════════════════════════════════\n');

if (profitable.length === 0) {
  console.log('❌ No segments meet profitability criteria\n');
} else {
  profitable.forEach((s, i) => {
    console.log(`${i + 1}. ${s.name}`);
    console.log(`   Bets: ${s.bets} | Win Rate: ${s.winRate.toFixed(1)}% | ROI: +${s.roi.toFixed(1)}% | Profit: +${s.profit.toFixed(2)} units\n`);
  });
  
  // Calculate combined strategy
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📊 COMBINED STRATEGY (All Profitable Segments)');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  // Get unique bets (some segments may overlap)
  const uniqueBets = new Set();
  profitable.forEach(seg => {
    const segBets = bets.filter(b => {
      // Re-apply the filter logic
      const name = seg.name;
      if (name === 'Under 3.5') return b.betSide === 'under' && b.line === 3.5;
      if (name === 'U3.5, pred < 2.5') return b.betSide === 'under' && b.line === 3.5 && b.predicted < 2.5;
      if (name === 'U3.5, pred 2.5-3.0') return b.betSide === 'under' && b.line === 3.5 && b.predicted >= 2.5 && b.predicted < 3.0;
      if (name === 'U3.5, pred 3.0-3.3') return b.betSide === 'under' && b.line === 3.5 && b.predicted >= 3.0 && b.predicted < 3.3;
      if (name === 'U3.5, edge > 0.7') return b.betSide === 'under' && b.line === 3.5 && Math.abs(b.predicted - b.line) > 0.7;
      // Add more as needed
      return false;
    });
    segBets.forEach(b => uniqueBets.add(JSON.stringify({player: b.player, date: b.date})));
  });
  
  console.log(`Total unique betting opportunities: ${uniqueBets.size} bets`);
  console.log(`Percentage of total: ${(uniqueBets.size / bets.length * 100).toFixed(1)}%\n`);
  
  // Total profit if we bet all profitable segments
  const totalProfit = profitable.reduce((sum, s) => sum + s.profit, 0);
  const totalBets = profitable.reduce((sum, s) => sum + s.bets, 0);
  const avgROI = (totalProfit / totalBets * 100).toFixed(1);
  
  console.log(`Combined Performance (with overlaps):`);
  console.log(`  Total segment bets: ${totalBets}`);
  console.log(`  Total profit: +${totalProfit.toFixed(2)} units`);
  console.log(`  Average ROI: +${avgROI}%\n`);
}

// ============================================================================
// PASS 2 PROJECTION
// ============================================================================

if (profitable.length > 0) {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🎯 PASS 2 PROJECTION');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  const pass1Games = 170;
  const pass2Games = 490;
  const scaleFactor = pass2Games / pass1Games;
  
  console.log(`Pass 1: 170 games`);
  console.log(`Pass 2: 490 games (${scaleFactor.toFixed(1)}x scale)\n`);
  
  profitable.forEach((s, i) => {
    const projectedBets = Math.round(s.bets * scaleFactor);
    const projectedProfit = s.profit * scaleFactor;
    
    console.log(`${i + 1}. ${s.name}:`);
    console.log(`   Pass 1: ${s.bets} bets → +${s.profit.toFixed(2)} units`);
    console.log(`   Pass 2 projection: ${projectedBets} bets → +${projectedProfit.toFixed(2)} units\n`);
  });
  
  const totalPass1Profit = profitable.reduce((sum, s) => sum + s.profit, 0);
  const totalPass2Projection = totalPass1Profit * scaleFactor;
  
  console.log(`TOTAL PROJECTION:`);
  console.log(`  Pass 2 expected profit: +${totalPass2Projection.toFixed(2)} units`);
  console.log(`  Cost: 5,089 credits (36% of budget)`);
  console.log(`  Recommendation: ${totalPass2Projection > 10 ? '✅ PROCEED' : totalPass2Projection > 5 ? '⚠️  CAUTIOUS' : '❌ SKIP'}\n`);
}
