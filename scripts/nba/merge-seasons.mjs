#!/usr/bin/env node
/**
 * Merge 2024-25 + 2025-26 boxscores into single chronological file
 * Normalizes date format to YYYY-MM-DD for proper sorting/filtering
 */

import { readFileSync, writeFileSync } from 'fs';

console.log('🔄 Merging NBA Boxscore Data');
console.log('=' .repeat(70));

// Load both seasons
console.log('\n📥 Loading data files...');
const season2024 = JSON.parse(readFileSync('data/nba/player-boxscores-2024-25.json', 'utf-8'));
const season2025 = JSON.parse(readFileSync('data/nba/player-boxscores-2025-26.json', 'utf-8'));

console.log(`   ✅ 2024-25: ${season2024.length} records`);
console.log(`   ✅ 2025-26: ${season2025.length} records`);

// Normalize date format: "Oct 31, 2025" → "2025-10-31"
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Convert "Oct 31, 2025" to "2025-10-31"
  try {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    console.warn(`⚠️  Invalid date: ${dateStr}`);
    return null;
  }
}

// Normalize and add 'date' field for Phase 3.5 compatibility
console.log('\n🔧 Normalizing date formats...');
const allBoxscores = [...season2024, ...season2025].map(g => {
  const normalizedDate = normalizeDate(g.gameDate);
  return {
    ...g,
    date: normalizedDate,  // Add 'date' field for Phase 3.5
    gameDate: g.gameDate   // Keep original for reference
  };
}).filter(g => g.date !== null); // Remove any with invalid dates

console.log(`   ✅ Normalized ${allBoxscores.length} records`);

// Sort by date (oldest to newest for chronological order)
console.log('\n📋 Sorting chronologically...');
allBoxscores.sort((a, b) => a.date.localeCompare(b.date));

// Get date range
const dates = allBoxscores.map(g => g.date);
const dateRange = {
  earliest: dates[0],
  latest: dates[dates.length - 1]
};

console.log(`   ✅ Date range: ${dateRange.earliest} → ${dateRange.latest}`);

// Verify data quality
console.log('\n🔍 Data quality check...');
const recentGames = allBoxscores.filter(g => g.date >= '2025-11-01');
console.log(`   November 2025 games: ${recentGames.length}`);

const todayGames = allBoxscores.filter(g => g.date === '2025-11-26');
console.log(`   Today (Nov 26): ${todayGames.length} player-games`);

// Sample recent game
if (recentGames.length > 0) {
  const sample = recentGames[recentGames.length - 1];
  console.log(`   Most recent: ${sample.playerName} on ${sample.date}`);
  console.log(`      Stats: ${sample.points}p / ${sample.rebounds}r / ${sample.assists}a`);
}

// Check data completeness
const gamesWithPoints = allBoxscores.filter(g => g.points > 0).length;
const pctComplete = (gamesWithPoints / allBoxscores.length * 100).toFixed(1);
console.log(`   Games with points: ${gamesWithPoints}/${allBoxscores.length} (${pctComplete}%)`);

if (pctComplete < 70) {
  console.warn('   ⚠️  WARNING: Data may be incomplete (< 70% have points)');
} else {
  console.log('   ✅ Data quality looks good');
}

// Save merged file
console.log('\n💾 Saving merged file...');
const outputPath = 'data/nba/player-history-2024-2026.json';
writeFileSync(outputPath, JSON.stringify(allBoxscores, null, 2));

const sizeMB = (JSON.stringify(allBoxscores).length / (1024 * 1024)).toFixed(1);
console.log(`   ✅ Saved to ${outputPath}`);
console.log(`   File size: ${sizeMB} MB`);

console.log('\n' + '='.repeat(70));
console.log('✅ MERGE COMPLETE - Ready for Phase 3.5!');
console.log('='.repeat(70));
console.log(`\nTotal records: ${allBoxscores.length}`);
console.log(`Date range: ${dateRange.earliest} → ${dateRange.latest}`);
console.log(`\nPhase 3.5 will now have:`);
console.log(`  • Full 2024-25 season (historical context)`);
console.log(`  • Full 2025-26 season through today`);
console.log(`  • Proper chronological ordering`);
console.log(`  • Normalized date field for filtering`);
