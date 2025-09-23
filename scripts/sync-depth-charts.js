#!/usr/bin/env node

/**
 * DEPTH CHART SYNC SYSTEM
 * 
 * PURPOSE: Automatically sync the master depth chart file to all system locations
 * MASTER SOURCE: public/history/2025/weekN/depth-charts.json
 * 
 * Usage:
 *   node scripts/sync-depth-charts.js 4        # Sync week 4 data
 *   node scripts/sync-depth-charts.js         # Auto-detect current week
 */

const fs = require('fs');
const path = require('path');

// Get current week (default to week 4 for now, but can be auto-detected)
const week = process.argv[2] || '4';

// MASTER SOURCE - This is the single source of truth
const masterFile = `public/history/2025/week${week}/depth-charts.json`;

// TARGET LOCATIONS - All places that need the depth chart data
const targetLocations = [
    'netlify/functions/_data/nfl/2025/depth-charts.json',
    'netlify/functions/nfl-depthcharts-get/_data/nfl/depth-charts.json', 
    'public/data/nfl-td/depth-charts.json',
    // Add more locations here as needed
];

console.log(`🏈 DEPTH CHART SYNC SYSTEM`);
console.log(`📂 Master Source: ${masterFile}`);

// Check if master file exists
if (!fs.existsSync(masterFile)) {
    console.error(`❌ ERROR: Master file not found: ${masterFile}`);
    console.error(`   Please ensure the week ${week} depth chart exists at this location.`);
    process.exit(1);
}

// Read master file to validate it's proper JSON
let masterData;
try {
    const masterContent = fs.readFileSync(masterFile, 'utf8');
    masterData = JSON.parse(masterContent);
    console.log(`✅ Master file validated - ${Object.keys(masterData).length} teams loaded`);
} catch (error) {
    console.error(`❌ ERROR: Master file is not valid JSON: ${error.message}`);
    process.exit(1);
}

// Sync to all target locations
let successCount = 0;
let errorCount = 0;

for (const target of targetLocations) {
    try {
        // Ensure target directory exists
        const targetDir = path.dirname(target);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
            console.log(`📁 Created directory: ${targetDir}`);
        }
        
        // Copy master file to target
        fs.copyFileSync(masterFile, target);
        console.log(`✅ Synced: ${target}`);
        successCount++;
        
    } catch (error) {
        console.error(`❌ ERROR syncing to ${target}: ${error.message}`);
        errorCount++;
    }
}

// Summary
console.log(`\n🎯 SYNC COMPLETE:`);
console.log(`   ✅ Successful: ${successCount}/${targetLocations.length}`);
console.log(`   ❌ Errors: ${errorCount}/${targetLocations.length}`);

if (errorCount === 0) {
    console.log(`\n🚀 All systems now have Week ${week} depth chart data!`);
    console.log(`   Elite injury modeling system is synchronized.`);
} else {
    console.log(`\n⚠️  Some sync operations failed - check errors above.`);
    process.exit(1);
}