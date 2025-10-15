/**
 * Update Prediction Results
 * 
 * Fetches game results from ESPN API and updates prediction log with actual outcomes.
 * Run this daily to keep predictions up to date.
 * 
 * Usage:
 *   node scripts/nba/update-results.mjs [date]
 * 
 * Examples:
 *   node scripts/nba/update-results.mjs                    # Update yesterday's games
 *   node scripts/nba/update-results.mjs 2025-10-22         # Update specific date
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEASON = '2025-26';
const LOG_FILE = path.join(__dirname, `../../data/nba/logs/predictions_${SEASON}.csv`);

// ============================================================================
// Fetch Game Results from ESPN
// ============================================================================

async function fetchGameResults(date) {
  const dateStr = date.replace(/-/g, '');  // Format: 20251022
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
  
  console.log(`📡 Fetching results for ${date}...`);
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.events || data.events.length === 0) {
      console.log(`   No games found for ${date}`);
      return [];
    }

    const results = [];
    
    for (const event of data.events) {
      const game = event.competitions[0];
      
      // Only process completed games
      if (game.status.type.completed !== true) {
        continue;
      }

      const homeTeam = game.competitors.find(c => c.homeAway === 'home');
      const awayTeam = game.competitors.find(c => c.homeAway === 'away');
      
      const homeScore = parseInt(homeTeam.score);
      const awayScore = parseInt(awayTeam.score);
      const actualSpread = homeScore - awayScore;  // Positive = home won by more
      
      results.push({
        date,
        gameId: event.id,
        homeTeam: homeTeam.team.abbreviation,
        awayTeam: awayTeam.team.abbreviation,
        homeScore,
        awayScore,
        actualSpread
      });
    }

    console.log(`   ✅ Found ${results.length} completed games`);
    return results;
    
  } catch (error) {
    console.error(`   ❌ Error fetching results: ${error.message}`);
    return [];
  }
}

// ============================================================================
// Update CSV with Results
// ============================================================================

function updatePredictionLog(results) {
  if (!fs.existsSync(LOG_FILE)) {
    console.error(`❌ Log file not found: ${LOG_FILE}`);
    return { updated: 0, errors: [] };
  }

  const content = fs.readFileSync(LOG_FILE, 'utf8');
  const lines = content.split('\n');
  
  if (lines.length <= 1) {
    console.log('⚠️ No predictions in log file');
    return { updated: 0, errors: [] };
  }

  const headers = lines[0].split(',');
  const dateIdx = headers.indexOf('date');
  const gameIdIdx = headers.indexOf('game_id');
  const teamIdx = headers.indexOf('team');
  const actualSpreadIdx = headers.indexOf('actual_spread');
  const baselineSpreadIdx = headers.indexOf('baseline_spread');
  const rciSpreadIdx = headers.indexOf('rci_spread');
  const baselineErrorIdx = headers.indexOf('baseline_error');
  const rciErrorIdx = headers.indexOf('rci_error');
  const improvementIdx = headers.indexOf('improvement');
  const baselineCorrectIdx = headers.indexOf('baseline_correct');
  const rciCorrectIdx = headers.indexOf('rci_correct');
  const roiBaselineIdx = headers.indexOf('roi_baseline');
  const roiRciIdx = headers.indexOf('roi_rci');

  let updatedCount = 0;
  const errors = [];

  // Process each line
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = lines[i].split(',');
    const predDate = values[dateIdx];
    const predTeam = values[teamIdx];

    // Find matching result
    const result = results.find(r => 
      r.date === predDate && 
      (r.homeTeam === predTeam || r.awayTeam === predTeam)
    );

    if (!result) continue;

    // Determine spread from team perspective
    const isHome = (result.homeTeam === predTeam);
    const actualSpread = isHome ? result.actualSpread : -result.actualSpread;

    // Skip if already has result
    if (values[actualSpreadIdx] && values[actualSpreadIdx].trim() !== '') {
      continue;
    }

    // Get predictions
    const baselineSpread = parseFloat(values[baselineSpreadIdx]);
    const rciSpread = parseFloat(values[rciSpreadIdx]);

    // Calculate errors
    const baselineError = Math.abs(baselineSpread - actualSpread);
    const rciError = Math.abs(rciSpread - actualSpread);
    const improvement = ((baselineError - rciError) / baselineError * 100);

    // Calculate correct picks
    const baselineCorrect = (baselineSpread * actualSpread > 0) ? 1 : 0;
    const rciCorrect = (rciSpread * actualSpread > 0) ? 1 : 0;

    // Calculate ROI (assuming -110 odds)
    const roiBaseline = baselineCorrect ? 0.909 : -1.0;
    const roiRci = rciCorrect ? 0.909 : -1.0;

    // Update values
    values[actualSpreadIdx] = actualSpread.toFixed(1);
    values[baselineErrorIdx] = baselineError.toFixed(2);
    values[rciErrorIdx] = rciError.toFixed(2);
    values[improvementIdx] = improvement.toFixed(2);
    values[baselineCorrectIdx] = baselineCorrect;
    values[rciCorrectIdx] = rciCorrect;
    values[roiBaselineIdx] = roiBaseline.toFixed(3);
    values[roiRciIdx] = roiRci.toFixed(3);

    lines[i] = values.join(',');
    updatedCount++;
  }

  // Write back to file
  if (updatedCount > 0) {
    fs.writeFileSync(LOG_FILE, lines.join('\n'), 'utf8');
    console.log(`✅ Updated ${updatedCount} predictions`);
  } else {
    console.log('⚠️ No predictions needed updating');
  }

  return { updated: updatedCount, errors };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  // Default to yesterday if no date provided
  let targetDate;
  if (args.length > 0) {
    targetDate = args[0];
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    targetDate = yesterday.toISOString().split('T')[0];
  }

  console.log('\n🔄 Updating NBA Prediction Results\n');
  console.log(`Target Date: ${targetDate}`);
  console.log(`Log File: ${LOG_FILE}\n`);

  // Fetch results
  const results = await fetchGameResults(targetDate);
  
  if (results.length === 0) {
    console.log('\n⚠️ No results to update\n');
    return;
  }

  // Update log
  const summary = updatePredictionLog(results);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Update Complete');
  console.log('='.repeat(60));
  console.log(`Predictions updated: ${summary.updated}`);
  console.log(`Errors: ${summary.errors.length}\n`);

  if (summary.errors.length > 0) {
    console.log('Errors encountered:');
    summary.errors.forEach(err => console.log(`  - ${err}`));
    console.log();
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
