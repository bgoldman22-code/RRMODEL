#!/usr/bin/env node
/**
 * Download boxscores from Netlify Blobs and generate tonight's picks
 * 
 * Usage: ODDS_API_KEY=xxx node scripts/nba/run-picks-tonight.mjs
 */

import { getStore } from '@netlify/blobs';
import { writeFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SITE_ID = 'bgroundrobin'; // Your Netlify site
const STORE_NAME = 'nba-data';
const HISTORICAL_KEY = 'player-boxscores-historical';
const CURRENT_KEY = 'player-boxscores-current';
const OUTPUT_PATH = '/tmp/player-boxscores-2024.json';

async function main() {
  console.log('🏀 NBA Picks Generator - Tonight');
  console.log('='.repeat(50));

  try {
    // Download boxscores from Netlify Blobs
    console.log('\n📥 Downloading boxscores from Netlify Blobs...');
    
    const store = getStore({
      name: STORE_NAME,
      siteID: SITE_ID
    });

    const [historical, current] = await Promise.all([
      store.get(HISTORICAL_KEY, { type: 'json' }),
      store.get(CURRENT_KEY, { type: 'json' })
    ]);

    if (!historical || !current) {
      throw new Error('Failed to fetch boxscores from Netlify Blobs');
    }

    // Merge both blobs
    const allBoxscores = [...historical, ...current];
    
    console.log(`✅ Downloaded ${historical.length} historical + ${current.length} current = ${allBoxscores.length} total entries`);

    // Save to /tmp for the generator script
    await writeFile(OUTPUT_PATH, JSON.stringify(allBoxscores, null, 2));
    console.log(`✅ Saved to ${OUTPUT_PATH}`);

    // Run the picks generator
    console.log('\n🎯 Generating picks...\n');
    console.log('='.repeat(50));
    
    const { stdout, stderr } = await execAsync(
      'ODDS_API_KEY=$ODDS_API_KEY node scripts/nba/generate-picks-local.mjs',
      { 
        cwd: process.cwd(),
        env: process.env 
      }
    );

    console.log(stdout);
    if (stderr) console.error(stderr);

    console.log('\n='.repeat(50));
    console.log('✅ DONE! Check your Downloads folder for the CSV.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    process.exit(1);
  }
}

main();
