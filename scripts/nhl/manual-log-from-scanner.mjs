#!/usr/bin/env node
/**
 * NHL Manual Logger - Converts scanner JSON output to CSV
 * 
 * Usage:
 *   # From scanner JSON file
 *   node scripts/nhl/manual-log-from-scanner.mjs scanner-output.json
 * 
 *   # From stdin (pipe from curl)
 *   curl https://your-site/.netlify/functions/nhl-sog-scanner-v3-optimized | \
 *     node scripts/nhl/manual-log-from-scanner.mjs
 * 
 * Automatically logs to: data/nhl/logs/predictions_2024-25.csv
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import existing logger
import NHLPredictionLogger from './log-prediction.mjs';

/**
 * Read JSON from file or stdin
 */
async function readInput(args) {
  if (args[0] && args[0] !== '-') {
    // Read from file
    const content = fs.readFileSync(args[0], 'utf-8');
    return JSON.parse(content);
  } else {
    // Read from stdin
    return new Promise((resolve, reject) => {
      let data = '';
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
  }
}

/**
 * Transform scanner opportunity to prediction format
 */
function transformOpportunity(opp, date) {
  return {
    date: date || new Date().toISOString().split('T')[0],
    gameId: opp.gameId || `${opp.team}_${opp.opponent}_${date}`,
    player: opp.playerName || opp.player,
    team: opp.team,
    opponent: opp.opponent,
    position: opp.position,
    line: opp.line,
    direction: opp.direction?.toUpperCase() || 'OVER',
    predictedSOG: opp.projection || opp.projectedSOG || opp.pred,
    edge: opp.edge,
    edgePercent: opp.edge, // Already a percentage
    odds: opp.odds,
    book: opp.bookmaker || opp.oddsSource || 'Average',
    modelProb: opp.confidence ? opp.confidence / 100 : null,
    impliedProb: opp.odds ? oddsToImpliedProb(opp.odds) : null,
    gameStartTime: opp.gameTime || opp.gameStartTime,
    isHome: opp.isHome || false,
    ppUnit: opp.ppUnit || null,
    iceTimeL5: opp.iceTimeL5 || null
  };
}

/**
 * Convert American odds to implied probability
 */
function oddsToImpliedProb(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  
  try {
    console.log('🏒 NHL Scanner → CSV Logger\n');
    
    // Read scanner output
    const scannerOutput = await readInput(args);
    
    // Extract opportunities array
    let opportunities = [];
    if (Array.isArray(scannerOutput)) {
      opportunities = scannerOutput;
    } else if (scannerOutput.opportunities) {
      opportunities = scannerOutput.opportunities;
    } else if (scannerOutput.body) {
      const body = JSON.parse(scannerOutput.body);
      opportunities = body.opportunities || [];
    } else {
      console.error('❌ Could not find opportunities in scanner output');
      process.exit(1);
    }
    
    if (opportunities.length === 0) {
      console.log('ℹ️  No opportunities to log');
      return;
    }
    
    console.log(`📊 Found ${opportunities.length} opportunities\n`);
    
    // Transform and log
    const logger = new NHLPredictionLogger('2024-25');
    const date = new Date().toISOString().split('T')[0];
    
    const predictions = opportunities.map(opp => transformOpportunity(opp, date));
    logger.logPredictions(predictions);
    
    console.log('\n✅ Successfully logged to CSV');
    console.log(`   File: data/nhl/logs/predictions_2024-25.csv\n`);
    
    // Show sample
    console.log('📋 Sample logged prediction:');
    const sample = predictions[0];
    console.log(`   ${sample.player} ${sample.direction} ${sample.line}`);
    console.log(`   Edge: ${sample.edgePercent}%, Odds: ${sample.odds}`);
    console.log(`   Book: ${sample.book}\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
