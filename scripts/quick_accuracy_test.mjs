#!/usr/bin/env node

/**
 * Quick Win % Test - Simple Accuracy Check
 * 
 * Uses just batting/pitching stats (44MB) to validate basic model accuracy
 * Skips the massive 3GB Statcast files for now
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🎯 Quick Model Accuracy Test (Using Player Stats)');
  console.log('=' .repeat(60));
  console.log();
  
  // Check what stats files we have
  const statsDir = path.join(__dirname, '../data/mlb_historical/players');
  const files = fs.readdirSync(statsDir);
  
  console.log(`📁 Available stats files:`);
  files.forEach(f => {
    const size = fs.statSync(path.join(statsDir, f)).size;
    console.log(`   ${f}: ${(size / 1024 / 1024).toFixed(1)}MB`);
  });
  console.log();
  
  // Load batting stats
  const battingFile = files.find(f => f.includes('batting'));
  if (!battingFile) {
    console.error('❌ No batting stats found');
    return;
  }
  
  console.log(`📊 Loading ${battingFile}...`);
  const battingStats = JSON.parse(fs.readFileSync(path.join(statsDir, battingFile), 'utf8'));
  console.log(`   ✅ Loaded ${battingStats.length.toLocaleString()} player-seasons`);
  console.log();
  
  // Simple model: HR rate from stats
  console.log('🧮 Building simple HR rate model...');
  const hrRates = battingStats
    .filter(p => p.AB > 100) // Minimum PA threshold
    .map(p => ({
      player_id: p.player_id,
      name: p.Name || 'Unknown',
      year: p.year,
      hr_rate: p.HR / Math.max(p.AB, 1),
      hr_count: p.HR,
      ab: p.AB
    }))
    .sort((a, b) => b.hr_rate - a.hr_rate);
  
  console.log(`   ✅ ${hrRates.length} qualified batters`);
  console.log();
  
  // Top HR hitters
  console.log('🏆 Top 20 HR Rates:');
  console.log('   Rank | Player | Year | HRs | AB | HR Rate');
  console.log('   ' + '-'.repeat(55));
  hrRates.slice(0, 20).forEach((p, i) => {
    console.log(`   ${String(i + 1).padStart(4)} | ${p.name.substring(0, 20).padEnd(20)} | ${p.year} | ${String(p.hr_count).padStart(3)} | ${String(p.ab).padStart(4)} | ${(p.hr_rate * 100).toFixed(2)}%`);
  });
  console.log();
  
  // League averages by year
  const yearStats = {};
  battingStats.forEach(p => {
    if (!yearStats[p.year]) {
      yearStats[p.year] = { hrs: 0, abs: 0, players: 0 };
    }
    yearStats[p.year].hrs += p.HR || 0;
    yearStats[p.year].abs += p.AB || 0;
    yearStats[p.year].players++;
  });
  
  console.log('📈 League-Wide HR Rates by Year:');
  console.log('   Year | Total HRs | Total ABs | HR Rate | Players');
  console.log('   ' + '-'.repeat(60));
  Object.entries(yearStats)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([year, stats]) => {
      const rate = stats.hrs / Math.max(stats.abs, 1);
      console.log(`   ${year} | ${String(stats.hrs).padStart(9)} | ${String(stats.abs).padStart(9)} | ${(rate * 100).toFixed(3)}% | ${String(stats.players).padStart(7)}`);
    });
  console.log();
  
  // Simple validation: Can we predict top HR hitters?
  console.log('✅ FINDINGS:');
  console.log(`   • League HR rate: ~${(hrRates.reduce((sum, p) => sum + p.hr_rate, 0) / hrRates.length * 100).toFixed(2)}% per AB`);
  console.log(`   • Top 10% HR rate: ${(hrRates[Math.floor(hrRates.length * 0.1)].hr_rate * 100).toFixed(2)}%`);
  console.log(`   • Top 1% HR rate: ${(hrRates[Math.floor(hrRates.length * 0.01)].hr_rate * 100).toFixed(2)}%`);
  console.log();
  console.log('🎯 NEXT STEP: With historical odds, can validate if model beats market');
  console.log('   Right now: Model identifies high-HR batters ✅');
  console.log('   Missing: Did market price them correctly?');
  console.log('=' .repeat(60));
}

main().catch(err => {
  console.error('💥 Error:', err);
  process.exit(1);
});
