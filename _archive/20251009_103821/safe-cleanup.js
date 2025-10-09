#!/usr/bin/env node

// Safe cleanup script - removes only confirmed dead code files
// Excludes: nfl-week3-*.csv files and nfl-train.js per user request

const fs = require('fs');
const path = require('path');

const filesToDelete = [
  // Test scripts we created
  'compare-td-models.js',
  'generate-td-csv-exports.js', // Old version superseded by advanced
  'test-advanced-td-function.js',
  
  // Standalone HTML not linked from main app
  'td-viewer.html',
  
  // All README/Documentation files (30+ files)
  'ENV.md',
  'HOWTO-add-blobs-dep.txt',
  'LINK_AND_ENV_INSTRUCTIONS.txt',
  'MLB_insert_snippets.jsx.txt',
  'PATCH_GUIDE.md',
  'PATCH_NOTES.md',
  'PATCH_NOTES.txt', 
  'PATCH_README.md',
  'PATCH_README.txt',
  'PATCH-NOTES.txt',
  'READ_ME_PROPS_TABS.txt',
  'README_APPLY.txt',
  'README_BONUS_PICKS.md',
  'README_BVP_PROTECTION.txt',
  'README_CONTEXT_BOOSTS.md',
  'README_FIX.txt',
  'README_LEARN_STATUS.md',
  'README_LIVE_ODDS_PATCH.txt',
  'README_MAIN5_ADDONS.md',
  'README_NO_TRAIN.md',
  'README_ODDS_INTEGRATION.md',
  'README_ODDS_OVER_05.txt',
  'README_PATCH.md',
  'README_PATCH.txt',
  'README_PREDICTIONS_FIX.txt',
  'README_profile_feature.md',
  'README_RAPIDAPI_ODDS_FIX.txt',
  'README_RAPIDAPI_ODDS.txt',
  'README_SWITCH_TO_THEODDSAPI.txt',
  'README-blobs-getstore.md',
  'README-CORS-PATCH.md',
  'README-depth-patch.txt',
  'README-depthcharts-upload.txt',
  'README-DIAGNOSTICS.txt',
  'README-ETL.md',
  'README-EXPERIMENT.md',
  'README-gemini.md',
  'README-getstore-adaptation.md',
  'README-KNOBS.md',
  'README-LEARN-DIAGNOSTICS.txt',
  'README-merge-notes.txt',
  'README-merge.txt',
  'README-MLB-PAGE-PATCH.md',
  'README-NFL-PATCH.md',
  'README-NFL-PATCH.txt',
  'README-NFL-PREDICTIONS-PATCH.md',
  'README-NFL-TD-FULL-PATCH-v2.md',
  'README-NFL-TD-PATCH.md',
  'README-NFL-TD-ROUTES-PATCH-v2.md',
  'README-PATCH-NFL-PREDS.txt',
  'README-PATCH.md',
  'README-patch.txt',
  'README-PREDICTIONS.md',
  'README-QUICK-UPGRADES.txt',
  'README-STRAIGHT-TABLES.md',
  'README-TopHRLeaders.txt',
  'README.txt',
  'SANITY_TESTS.txt',
  'SANITY.md',
  
  // Config file variations (keeping main versions)
  'package.json.additions.json',
  'package.json.addon.json', 
  'package.json.patch.txt',
  'package.json.snippet',
  'netlify.toml.additions.txt',
  'netlify.toml.addon.txt',
  'netlify.toml.fragment',
  'netlify.toml.patch.txt',
  'netlify.toml.sample',
  
  // Version folder
  '0.15'
];

const directoriesToDelete = [
  // Legacy bundle directories
  'top50_hr_auto_bundle',
  'real_odds_patch_bundle',
  'site'
];

console.log('🧹 Starting safe cleanup of confirmed dead code files...\n');

let deletedFiles = 0;
let deletedDirs = 0;
let errors = 0;

// Delete individual files
filesToDelete.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ Deleted file: ${file}`);
      deletedFiles++;
    } else {
      console.log(`⚠️  File not found (already deleted?): ${file}`);
    }
  } catch (error) {
    console.error(`❌ Error deleting file ${file}: ${error.message}`);
    errors++;
  }
});

// Delete directories recursively
function deleteDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

directoriesToDelete.forEach(dir => {
  const dirPath = path.join(process.cwd(), dir);
  try {
    if (deleteDirectory(dirPath)) {
      console.log(`✅ Deleted directory: ${dir}`);
      deletedDirs++;
    } else {
      console.log(`⚠️  Directory not found (already deleted?): ${dir}`);
    }
  } catch (error) {
    console.error(`❌ Error deleting directory ${dir}: ${error.message}`);
    errors++;
  }
});

console.log('\n📊 Cleanup Summary:');
console.log(`✅ Files deleted: ${deletedFiles}`);
console.log(`✅ Directories deleted: ${deletedDirs}`);
console.log(`❌ Errors: ${errors}`);

console.log('\n🔒 PRESERVED (as requested):');
console.log('✅ All nfl-week3-*.csv files');
console.log('✅ nfl-train.js');
console.log('✅ All active netlify functions');
console.log('✅ All src/ files used by main app');
console.log('✅ Main config files (package.json, netlify.toml, etc.)');

if (errors === 0) {
  console.log('\n🎉 Cleanup completed successfully!');
} else {
  console.log(`\n⚠️  Cleanup completed with ${errors} errors`);
}