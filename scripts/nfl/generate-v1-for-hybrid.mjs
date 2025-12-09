#!/usr/bin/env node
/**
 * Generate V1 predictions for hybrid system
 * This script calls the production V1 API and saves output for hybrid to use
 * 
 * Usage: node scripts/nfl/generate-v1-for-hybrid.mjs [season] [week]
 * Example: node scripts/nfl/generate-v1-for-hybrid.mjs 2025 15
 */

import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const season = process.argv[2] || '2025';
const week = process.argv[3] || '15';

console.log(`\n🏈 Generating V1 Predictions for Hybrid System`);
console.log(`Season: ${season}, Week: ${week}\n`);

try {
  // Call production V1 API (same as PHI approach)
  const url = `https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?season=${season}&week=${week}&_t=${Date.now()}`;
  
  console.log('📡 Fetching from production API...');
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (!data.predictions || data.predictions.length === 0) {
    throw new Error('No predictions received from API');
  }
  
  console.log(`✅ Received ${data.predictions.length} predictions from V1`);
  
  // Save to output file for hybrid to read
  const outputPath = join(__dirname, `../../output/v1_for_hybrid_${season}_week${week}.json`);
  await writeFile(outputPath, JSON.stringify(data, null, 2));
  
  console.log(`💾 Saved to: ${outputPath}`);
  console.log(`\n✅ V1 data ready for hybrid system\n`);
  
} catch (error) {
  console.error(`\n❌ Error generating V1 predictions: ${error.message}\n`);
  process.exit(1);
}
