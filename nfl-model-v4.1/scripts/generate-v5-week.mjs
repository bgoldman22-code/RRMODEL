#!/usr/bin/env node
/**
 * Generate V5 Weekly Predictions - Orchestration Script
 * 
 * High-level wrapper around v5-ensemble.mjs for weekly prediction generation.
 * Handles argument parsing, file path resolution, and error reporting.
 * 
 * USAGE:
 * ======
 *   # Current week (2025 Week 11)
 *   node scripts/generate-v5-week.mjs --season 2025 --week 11
 * 
 *   # Historical week with validation
 *   node scripts/generate-v5-week.mjs --season 2024 --week 10 --historical
 * 
 *   # Custom output path
 *   node scripts/generate-v5-week.mjs --season 2025 --week 11 --output /path/to/bundle.json
 * 
 * EXIT CODES:
 * ===========
 *   0: Success
 *   1: Invalid arguments or ensemble generation failed
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    season: null,
    week: null,
    output: null,
    historical: false
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      parsed.season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--week' && args[i + 1]) {
      parsed.week = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      parsed.output = args[i + 1];
      i++;
    } else if (args[i] === '--historical') {
      parsed.historical = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  
  // Validate required args
  if (!parsed.season || !parsed.week) {
    console.error('❌ Error: --season and --week are required');
    console.error('');
    printHelp();
    process.exit(1);
  }
  
  // Validate ranges
  if (parsed.season < 2020 || parsed.season > 2030) {
    console.error(`❌ Error: Invalid season ${parsed.season} (must be 2020-2030)`);
    process.exit(1);
  }
  
  if (parsed.week < 1 || parsed.week > 18) {
    console.error(`❌ Error: Invalid week ${parsed.week} (must be 1-18 for regular season)`);
    process.exit(1);
  }
  
  // Set default output path
  if (!parsed.output) {
    parsed.output = path.join(__dirname, '..', 'output', `bundle_v5_${parsed.season}_week${parsed.week}.json`);
  }
  
  return parsed;
}

function printHelp() {
  console.log(`
V5 Weekly Prediction Generator
===============================

Generate NFL predictions for a specific week using frozen V5 models.

USAGE:
  node scripts/generate-v5-week.mjs --season YYYY --week W [OPTIONS]

REQUIRED ARGUMENTS:
  --season YYYY       Season year (e.g., 2025)
  --week W            Week number (1-18 for regular season)

OPTIONAL ARGUMENTS:
  --historical        Include actual results for validation (if available)
  --output PATH       Custom output file path
  --help, -h          Show this help message

EXAMPLES:
  # Generate predictions for 2025 Week 11
  node scripts/generate-v5-week.mjs --season 2025 --week 11

  # Validate against historical results
  node scripts/generate-v5-week.mjs --season 2024 --week 10 --historical

  # Custom output path
  node scripts/generate-v5-week.mjs --season 2025 --week 11 --output ./predictions.json

OUTPUT:
  Default: output/bundle_v5_<season>_week<week>.json
  Format: JSON bundle with spread and total predictions for all games
`);
}

async function main() {
  console.log('🏈 V5 Weekly Prediction Generator');
  console.log('');
  
  const args = parseArgs();
  
  console.log(`📅 Season: ${args.season}`);
  console.log(`📆 Week: ${args.week}`);
  console.log(`📁 Output: ${args.output}`);
  console.log(`📊 Mode: ${args.historical ? 'Historical (with validation)' : 'Live predictions'}`);
  console.log('');
  
  // Build command arguments for v5-ensemble.mjs
  const ensembleScript = path.join(__dirname, 'v5-ensemble.mjs');
  const ensembleArgs = [
    ensembleScript,
    '--season', args.season.toString(),
    '--week', args.week.toString(),
    '--output', args.output
  ];
  
  if (args.historical) {
    ensembleArgs.push('--historical');
  }
  
  // Execute v5-ensemble.mjs
  console.log('🔧 Executing v5-ensemble.mjs...');
  console.log('');
  
  return new Promise((resolve, reject) => {
    const child = spawn('node', ensembleArgs, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    child.on('error', (error) => {
      console.error('');
      console.error('❌ Failed to execute v5-ensemble.mjs:', error.message);
      reject(error);
    });
    
    child.on('exit', (code) => {
      if (code === 0) {
        console.log('');
        console.log('✅ Generation complete!');
        console.log(`📦 Bundle saved to: ${args.output}`);
        resolve();
      } else {
        console.error('');
        console.error(`❌ v5-ensemble.mjs exited with code ${code}`);
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

// Run main
main().catch(error => {
  console.error('');
  console.error('❌ Generation failed:', error.message);
  process.exit(1);
});
