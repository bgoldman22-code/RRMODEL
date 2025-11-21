#!/usr/bin/env node
/**
 * Collect Opponent Defense Stats
 * 
 * Aggregates opponent defense stats from data/nba/opponent-defense/2025-26.json
 * and creates data/nba/opponent-defense-stats.json for easy consumption
 * by the prediction generator
 * 
 * Usage: node scripts/nba/collect-opponent-defense.mjs
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_FILE = join(__dirname, '../../data/nba/opponent-defense/2025-26.json');
const OUTPUT_FILE = join(__dirname, '../../data/nba/opponent-defense-stats.json');

async function main() {
  console.log('🏀 Collecting Opponent Defense Stats');
  console.log('=====================================\n');
  
  // Check if source file exists
  if (!existsSync(SOURCE_FILE)) {
    console.error(`❌ Source file not found: ${SOURCE_FILE}`);
    console.error('   Run the Python script first: python3 scripts/nba/update-opponent-defense.py');
    process.exit(1);
  }
  
  // Load source data
  const sourceContent = await readFile(SOURCE_FILE, 'utf-8');
  const sourceData = JSON.parse(sourceContent);
  
  console.log(`✅ Loaded opponent defense data for ${sourceData._metadata.season}`);
  console.log(`   Teams: ${Object.keys(sourceData.teams).length}`);
  console.log(`   Source: ${sourceData._metadata.source}`);
  console.log(`   Last updated: ${sourceData._metadata.lastUpdated}`);
  
  // Create simplified output format
  const outputData = {
    season: sourceData._metadata.season,
    lastUpdated: sourceData._metadata.lastUpdated,
    teams: sourceData.teams
  };
  
  // Save to output file
  await writeFile(OUTPUT_FILE, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`\n💾 Saved consolidated opponent defense stats to:`);
  console.log(`   ${OUTPUT_FILE}`);
  console.log(`\n✅ Complete!`);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
