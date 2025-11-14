#!/usr/bin/env node
/**
 * Fetch NFLverse Play-by-Play Data for V5 Reconstruction
 * 
 * Downloads PBP data from NFLverse for seasons 2020-2025 to rebuild
 * team-level EPA metrics needed for V5 model coefficient fitting.
 * 
 * Data source: https://github.com/nflverse/nflverse-data
 * 
 * This gives us the full training dataset (~1500+ games) to properly
 * fit the V5 spread and total models, not just the 87 games in the
 * output files or the 14 games in Week 10.
 */

import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const DATA_DIR = path.join(process.cwd(), 'nfl-model-v4.1', 'data', 'nflverse');
const SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];

/**
 * Download file from URL with streaming
 */
async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        https.get(response.headers.location, (redirectResponse) => {
          const fileStream = createWriteStream(outputPath);
          redirectResponse.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });
          fileStream.on('error', reject);
        }).on('error', reject);
      } else {
        const fileStream = createWriteStream(outputPath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
        fileStream.on('error', reject);
      }
    }).on('error', reject);
  });
}

/**
 * Fetch play-by-play data for a season
 * Using CSV format for easier processing in Node.js
 */
async function fetchSeasonPBP(season) {
  const url = `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
  const outputPath = path.join(DATA_DIR, `pbp_${season}.csv.gz`);
  
  console.log(`📥 Downloading ${season} PBP data (compressed CSV)...`);
  console.log(`   URL: ${url}`);
  
  try {
    await downloadFile(url, outputPath);
    const stats = await fs.stat(outputPath);
    console.log(`   ✅ Downloaded ${(stats.size / 1024 / 1024).toFixed(2)} MB (compressed)`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to download ${season}:`, error.message);
    return false;
  }
}

/**
 * Fetch weekly roster data (for injury/availability context)
 */
async function fetchWeeklyRosters(season) {
  const url = `https://github.com/nflverse/nflverse-data/releases/download/weekly/weekly_rosters_${season}.csv`;
  const outputPath = path.join(DATA_DIR, `weekly_rosters_${season}.csv`);
  
  console.log(`📥 Downloading ${season} weekly rosters...`);
  
  try {
    await downloadFile(url, outputPath);
    const stats = await fs.stat(outputPath);
    console.log(`   ✅ Downloaded ${(stats.size / 1024).toFixed(2)} KB`);
    return true;
  } catch (error) {
    console.warn(`   ⚠️  No roster data for ${season} (may not exist yet)`);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🏈 NFLverse Data Fetcher for V5 Reconstruction');
  console.log('='.repeat(70));
  console.log(`Seasons: ${SEASONS.join(', ')}`);
  console.log(`Output: ${DATA_DIR}`);
  console.log('='.repeat(70));
  console.log('');
  
  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  let successCount = 0;
  let rosterCount = 0;
  
  for (const season of SEASONS) {
    const pbpSuccess = await fetchSeasonPBP(season);
    if (pbpSuccess) successCount++;
    
    const rosterSuccess = await fetchWeeklyRosters(season);
    if (rosterSuccess) rosterCount++;
    
    console.log('');
  }
  
  console.log('='.repeat(70));
  console.log(`✅ Downloaded ${successCount}/${SEASONS.length} PBP datasets`);
  console.log(`✅ Downloaded ${rosterCount}/${SEASONS.length} roster datasets`);
  
  if (successCount < SEASONS.length) {
    console.log('');
    console.log('⚠️  Note: Some downloads failed. For 2025, the season is ongoing');
    console.log('   so data may only be available through the current week.');
  }
  
  console.log('');
  console.log('📝 Next step: Process the data to extract team-level metrics');
  console.log('   node nfl-model-v4.1/scripts/01-process-nflverse-to-metrics.mjs');
  console.log('');
  console.log('💡 Alternative: If you want to skip data processing, you can use');
  console.log('   the existing production metrics from Netlify Blobs via the V1 system.');
  console.log('');
}

main().catch(error => {
  console.error('\n❌ Fatal Error:', error);
  process.exit(1);
});
