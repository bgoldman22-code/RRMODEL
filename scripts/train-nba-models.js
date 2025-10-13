#!/usr/bin/env node

/**
 * NBA Model Training Script
 * 
 * Run this to train the ensemble models on historical data
 * Usage: node scripts/train-nba-models.js
 */

import { runFullTrainingPipeline } from '../netlify/functions/_lib/nba/models/training.mjs';

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🏀  NBA ELITE MODEL TRAINING PIPELINE                      ║
║                                                               ║
║   Training ensemble models on historical NBA data            ║
║   - 83 team-level features                                   ║
║   - XGBoost + Neural Network + Bayesian Ridge                ║
║   - Cross-validation & walk-forward testing                  ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

// Parse command line arguments
const args = process.argv.slice(2);
const seasons = args.length > 0 ? args : ['2023-24', '2024-25'];

console.log(`\n📅 Training on seasons: ${seasons.join(', ')}\n`);

// Run training
try {
  const result = await runFullTrainingPipeline(seasons);
  
  if (result) {
    console.log('\n' + '═'.repeat(60));
    console.log('✅ TRAINING COMPLETE!');
    console.log('═'.repeat(60));
    console.log(`\nModels trained on ${result.stats.games} games`);
    console.log(`Using ${result.stats.features} features per game`);
    console.log('\n📦 Models saved to Netlify Blobs:');
    console.log('   - models/nba_spread_model');
    console.log('   - models/nba_total_model');
    console.log('\n🚀 Ready to generate predictions!');
    console.log('   Run: netlify dev');
    console.log('   Then: http://localhost:8888/.netlify/functions/nba-predictions-generate\n');
  } else {
    console.log('\n⚠️  Training skipped - no historical data available');
    console.log('Please collect historical game data first.');
    console.log('See NBA-ELITE-SYSTEM-README.md for instructions.\n');
  }
  
} catch (error) {
  console.error('\n❌ Training failed:', error);
  process.exit(1);
}
