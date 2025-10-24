#!/usr/bin/env node

/**
 * MERGE ODDS DATASETS
 * 
 * Combines historical_odds_data_v2.json (216 games) and 
 * historical_odds_data_7k.json (8,573 games) into a single
 * comprehensive dataset, removing duplicates by playerId+gameDate.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const v2Path = path.join(REPO_ROOT, 'data/nhl/historical_odds_data_v2.json');
const v7kPath = path.join(REPO_ROOT, 'data/nhl/7k_run/historical_odds_data_7k.json');
const outPath = path.join(REPO_ROOT, 'data/nhl/historical_odds_data_combined.json');

const v2 = JSON.parse(fs.readFileSync(v2Path, 'utf8'));
const v7k = JSON.parse(fs.readFileSync(v7kPath, 'utf8'));

console.log('📦 Merging odds datasets...');
console.log(`   v2 dataset:  ${v2.data.length.toLocaleString()} games (${v2.gamesWithOdds} with odds)`);
console.log(`   7k dataset:  ${v7k.data.length.toLocaleString()} games (${v7k.gamesWithOdds} with odds)`);

// Use Map to deduplicate by playerId|gameDate (7k takes precedence if overlap)
const merged = new Map();

// Add v2 first
for (const g of v2.data) {
  const key = `${g.playerId}|${g.gameDate}`;
  merged.set(key, g);
}

// Add 7k (overwrites any v2 duplicates)
let overwritten = 0;
for (const g of v7k.data) {
  const key = `${g.playerId}|${g.gameDate}`;
  if (merged.has(key)) overwritten++;
  merged.set(key, g);
}

const combined = Array.from(merged.values());
const withOdds = combined.filter(g => g.oddsAvailable && g.odds && g.odds.length > 0);

console.log(`\n✅ Combined dataset:`);
console.log(`   Total games:       ${combined.length.toLocaleString()}`);
console.log(`   With odds:         ${withOdds.length.toLocaleString()}`);
console.log(`   Duplicates merged: ${overwritten.toLocaleString()}`);

const output = {
  fetchedAt: new Date().toISOString(),
  sources: {
    v2: { file: 'historical_odds_data_v2.json', games: v2.data.length, gamesWithOdds: v2.gamesWithOdds },
    v7k: { file: 'historical_odds_data_7k.json', games: v7k.data.length, gamesWithOdds: v7k.gamesWithOdds }
  },
  totalGames: combined.length,
  gamesWithOdds: withOdds.length,
  duplicatesMerged: overwritten,
  data: combined
};

fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`\n💾 Saved to: ${outPath}`);
