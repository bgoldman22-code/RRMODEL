#!/usr/bin/env node
/**
 * Profile Quality Validator
 * 
 * Validates batter/pitcher profiles for:
 * - Minimum sample sizes
 * - Data freshness
 * - Outlier detection
 * - Missing Statcast metrics
 * 
 * Run: node scripts/validate_profiles.mjs [year]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

const CONFIG = {
  PROFILES_DIR: path.join(PROJECT_ROOT, 'data', 'mlb_historical', 'players', 'profiles'),
  MIN_PA: 50, // Minimum plate appearances for reliable data
  MIN_BATTED_BALLS: 20, // Minimum for Statcast metrics
  MAX_EXIT_VELO: 120, // mph (outlier detection)
  MIN_EXIT_VELO: 70, // mph (outlier detection)
  MAX_BARREL_RATE: 0.35, // 35% (outlier detection)
  MIN_HARD_CONTACT: 0.15 // 15% (below this is suspicious)
};

/**
 * Load profile file
 */
function loadProfiles(year, type) {
  const filename = `${year}_${type}_profiles.json`;
  const filePath = path.join(CONFIG.PROFILES_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Profile file not found: ${filename}`);
  }
  
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Validate individual profile
 */
function validateProfile(profile, type) {
  const issues = [];
  const warnings = [];
  
  // Check sample size
  if (profile.total_pa < CONFIG.MIN_PA) {
    warnings.push(`Low PA count: ${profile.total_pa} (min: ${CONFIG.MIN_PA})`);
  }
  
  if (profile.batted_balls < CONFIG.MIN_BATTED_BALLS) {
    warnings.push(`Low batted ball count: ${profile.batted_balls} (min: ${CONFIG.MIN_BATTED_BALLS})`);
  }
  
  // Check for missing Statcast metrics
  if (!profile.avg_exit_velo || profile.avg_exit_velo === 0) {
    issues.push('Missing avg_exit_velo');
  }
  
  if (!profile.barrel_rate || profile.barrel_rate === 0) {
    warnings.push('Missing barrel_rate');
  }
  
  if (!profile.hard_contact_rate || profile.hard_contact_rate === 0) {
    warnings.push('Missing hard_contact_rate');
  }
  
  // Outlier detection
  if (profile.avg_exit_velo) {
    if (profile.avg_exit_velo > CONFIG.MAX_EXIT_VELO) {
      issues.push(`Suspiciously high exit velo: ${profile.avg_exit_velo} mph`);
    }
    if (profile.avg_exit_velo < CONFIG.MIN_EXIT_VELO) {
      issues.push(`Suspiciously low exit velo: ${profile.avg_exit_velo} mph`);
    }
  }
  
  if (profile.barrel_rate && profile.barrel_rate > CONFIG.MAX_BARREL_RATE) {
    issues.push(`Suspiciously high barrel rate: ${(profile.barrel_rate * 100).toFixed(1)}%`);
  }
  
  if (profile.hard_contact_rate && profile.hard_contact_rate < CONFIG.MIN_HARD_CONTACT) {
    warnings.push(`Low hard contact rate: ${(profile.hard_contact_rate * 100).toFixed(1)}%`);
  }
  
  return { issues, warnings };
}

/**
 * Generate validation report
 */
function generateReport(profiles, type, year) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 ${type.toUpperCase()} PROFILES VALIDATION - ${year}`);
  console.log(`${'='.repeat(80)}\n`);
  
  const stats = {
    total: profiles.length,
    withIssues: 0,
    withWarnings: 0,
    missingExitVelo: 0,
    lowSampleSize: 0,
    highQuality: 0
  };
  
  const problematicProfiles = [];
  
  for (const profile of profiles) {
    const { issues, warnings } = validateProfile(profile, type);
    
    if (issues.length > 0) {
      stats.withIssues++;
      problematicProfiles.push({
        player: profile.player_name,
        id: profile.batter_id,
        pa: profile.total_pa,
        issues,
        warnings
      });
    } else if (warnings.length > 0) {
      stats.withWarnings++;
    }
    
    if (!profile.avg_exit_velo || profile.avg_exit_velo === 0) {
      stats.missingExitVelo++;
    }
    
    if (profile.total_pa < CONFIG.MIN_PA) {
      stats.lowSampleSize++;
    }
    
    // High quality: sufficient PA, all Statcast metrics present
    if (profile.total_pa >= CONFIG.MIN_PA && 
        profile.avg_exit_velo > 0 && 
        profile.barrel_rate > 0 && 
        profile.hard_contact_rate > 0) {
      stats.highQuality++;
    }
  }
  
  // Summary
  console.log(`📈 SUMMARY:`);
  console.log(`   Total profiles: ${stats.total}`);
  console.log(`   High quality: ${stats.highQuality} (${((stats.highQuality / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   With issues: ${stats.withIssues} (${((stats.withIssues / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   With warnings: ${stats.withWarnings} (${((stats.withWarnings / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   Missing exit velo: ${stats.missingExitVelo} (${((stats.missingExitVelo / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   Low sample size: ${stats.lowSampleSize} (${((stats.lowSampleSize / stats.total) * 100).toFixed(1)}%)`);
  
  // Show problematic profiles
  if (problematicProfiles.length > 0) {
    console.log(`\n⚠️  PROFILES WITH ISSUES (showing first 10):\n`);
    for (const profile of problematicProfiles.slice(0, 10)) {
      console.log(`   ${profile.player} (ID: ${profile.id}, PA: ${profile.pa})`);
      profile.issues.forEach(issue => console.log(`      ❌ ${issue}`));
      profile.warnings.forEach(warning => console.log(`      ⚠️  ${warning}`));
      console.log('');
    }
    
    if (problematicProfiles.length > 10) {
      console.log(`   ... and ${problematicProfiles.length - 10} more\n`);
    }
  }
  
  // Quality grade
  const qualityPct = (stats.highQuality / stats.total) * 100;
  let grade, emoji;
  if (qualityPct >= 80) {
    grade = 'ELITE';
    emoji = '🏆';
  } else if (qualityPct >= 60) {
    grade = 'GOOD';
    emoji = '✅';
  } else if (qualityPct >= 40) {
    grade = 'FAIR';
    emoji = '⚠️';
  } else {
    grade = 'NEEDS WORK';
    emoji = '❌';
  }
  
  console.log(`\n${emoji} DATA QUALITY: ${grade} (${qualityPct.toFixed(1)}% high quality)\n`);
  
  return stats;
}

/**
 * Main execution
 */
async function main() {
  const year = process.argv[2] || new Date().getFullYear();
  
  console.log(`\n🔍 Validating ${year} player profiles...\n`);
  
  try {
    // Validate batter profiles
    const batterProfiles = loadProfiles(year, 'batter');
    const batterStats = generateReport(batterProfiles, 'batter', year);
    
    // Validate pitcher profiles
    const pitcherProfiles = loadProfiles(year, 'pitcher');
    const pitcherStats = generateReport(pitcherProfiles, 'pitcher', year);
    
    // Overall summary
    console.log(`${'='.repeat(80)}`);
    console.log(`📊 OVERALL DATA QUALITY - ${year}`);
    console.log(`${'='.repeat(80)}\n`);
    console.log(`   Batters: ${batterStats.highQuality}/${batterStats.total} high quality (${((batterStats.highQuality / batterStats.total) * 100).toFixed(1)}%)`);
    console.log(`   Pitchers: ${pitcherStats.highQuality}/${pitcherStats.total} high quality (${((pitcherStats.highQuality / pitcherStats.total) * 100).toFixed(1)}%)`);
    
    const overallQuality = (batterStats.highQuality + pitcherStats.highQuality) / (batterStats.total + pitcherStats.total) * 100;
    console.log(`\n   🎯 Overall: ${overallQuality.toFixed(1)}% high quality profiles`);
    
    if (overallQuality >= 80) {
      console.log(`\n   🏆 ELITE DATA QUALITY - Ready for production!`);
    } else if (overallQuality >= 60) {
      console.log(`\n   ✅ GOOD DATA QUALITY - Minor improvements recommended`);
    } else {
      console.log(`\n   ⚠️  DATA QUALITY NEEDS IMPROVEMENT - Run profile regeneration`);
    }
    
    console.log('');
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default main;
