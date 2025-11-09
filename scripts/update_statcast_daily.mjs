#!/usr/bin/env node
/**
 * Daily Statcast Data Updater
 * 
 * Runs at 2 AM daily to collect previous day's Statcast pitch data
 * Appends to current year's statcast file (e.g., 2025_pitches.json)
 * 
 * Schedule with cron:
 * 0 2 * * * cd /Users/brentgoldman/RRMODEL && node scripts/update_statcast_daily.mjs >> logs/statcast_updates.log 2>&1
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

const CONFIG = {
  STATCAST_DIR: path.join(PROJECT_ROOT, 'data', 'mlb_historical', 'statcast'),
  PYTHON_SCRIPT: path.join(PROJECT_ROOT, 'scripts', 'collect_statcast_incremental.py'),
  LOG_DIR: path.join(PROJECT_ROOT, 'logs'),
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000 // 5 seconds
};

/**
 * Get yesterday's date (previous day's data is what we collect)
 */
function getYesterdayDate() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

/**
 * Get current year
 */
function getCurrentYear() {
  return new Date().getFullYear();
}

/**
 * Check if MLB season is active (March-October)
 */
function isMLBSeasonActive() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 3 && month <= 10;
}

/**
 * Run Python Statcast collection script
 */
function runStatcastCollection(date, year, attempt = 1) {
  return new Promise((resolve, reject) => {
    console.log(`\n📊 [Attempt ${attempt}/${CONFIG.MAX_RETRIES}] Collecting Statcast data for ${date}...`);
    
    const pythonProcess = spawn('python3', [
      CONFIG.PYTHON_SCRIPT,
      date,
      year.toString()
    ], {
      cwd: PROJECT_ROOT,
      env: { ...process.env }
    });
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      process.stdout.write(output);
    });
    
    pythonProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      process.stderr.write(output);
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Successfully collected Statcast data for ${date}`);
        resolve({ success: true, stdout, stderr });
      } else {
        console.error(`❌ Python script exited with code ${code}`);
        
        if (attempt < CONFIG.MAX_RETRIES) {
          console.log(`⏳ Retrying in ${CONFIG.RETRY_DELAY_MS / 1000} seconds...`);
          setTimeout(() => {
            runStatcastCollection(date, year, attempt + 1)
              .then(resolve)
              .catch(reject);
          }, CONFIG.RETRY_DELAY_MS);
        } else {
          reject(new Error(`Failed after ${CONFIG.MAX_RETRIES} attempts: ${stderr}`));
        }
      }
    });
    
    pythonProcess.on('error', (error) => {
      console.error(`❌ Failed to start Python process: ${error.message}`);
      reject(error);
    });
  });
}

/**
 * Get file size in MB
 */
function getFileSizeMB(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return (stats.size / (1024 * 1024)).toFixed(2);
  } catch (error) {
    return 'N/A';
  }
}

/**
 * Main execution
 */
async function main() {
  const timestamp = new Date().toISOString();
  console.log('='.repeat(80));
  console.log(`⚾ Daily Statcast Update - ${timestamp}`);
  console.log('='.repeat(80));
  
  // Ensure log directory exists
  if (!fs.existsSync(CONFIG.LOG_DIR)) {
    fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
  }
  
  // Check if season is active
  if (!isMLBSeasonActive()) {
    console.log('⏸️  MLB season not active (off-season)');
    console.log('💤 Skipping Statcast update');
    return;
  }
  
  const yesterday = getYesterdayDate();
  const currentYear = getCurrentYear();
  const yearFile = path.join(CONFIG.STATCAST_DIR, `${currentYear}_pitches.json`);
  
  console.log(`📅 Date: ${yesterday}`);
  console.log(`📂 Target file: ${yearFile}`);
  
  // Check if Python script exists
  if (!fs.existsSync(CONFIG.PYTHON_SCRIPT)) {
    console.error(`❌ Python script not found: ${CONFIG.PYTHON_SCRIPT}`);
    console.log('💡 Creating incremental collector script...');
    createPythonCollectorScript();
  }
  
  // Get file size before
  const sizeBefore = getFileSizeMB(yearFile);
  console.log(`📊 Current file size: ${sizeBefore} MB`);
  
  try {
    // Run collection
    await runStatcastCollection(yesterday, currentYear);
    
    // Get file size after
    const sizeAfter = getFileSizeMB(yearFile);
    const sizeIncrease = (parseFloat(sizeAfter) - parseFloat(sizeBefore)).toFixed(2);
    
    console.log(`\n✅ Update complete!`);
    console.log(`📈 File size: ${sizeBefore} MB → ${sizeAfter} MB (+${sizeIncrease} MB)`);
    console.log(`💾 Total Statcast data: ${sizeAfter} MB for ${currentYear}`);
    
    // Update profiles if needed
    console.log('\n🔄 Updating batter profiles...');
    await updateBatterProfiles(currentYear);
    
  } catch (error) {
    console.error(`\n❌ Failed to update Statcast data: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Update batter profiles with new Statcast data
 */
async function updateBatterProfiles(year) {
  const profileScript = path.join(PROJECT_ROOT, 'scripts', 'generate_profiles.py');
  
  if (!fs.existsSync(profileScript)) {
    console.warn('⚠️  Profile generator not found, skipping profile update');
    return;
  }
  
  return new Promise((resolve, reject) => {
    console.log(`   Running profile generator for ${year}...`);
    
    const pythonProcess = spawn('python3', [profileScript, year.toString()], {
      cwd: PROJECT_ROOT
    });
    
    pythonProcess.stdout.on('data', (data) => {
      process.stdout.write(`   ${data.toString()}`);
    });
    
    pythonProcess.stderr.on('data', (data) => {
      process.stderr.write(`   ${data.toString()}`);
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`   ✅ Profiles updated`);
        resolve();
      } else {
        console.warn(`   ⚠️  Profile update failed (code ${code})`);
        resolve(); // Don't fail the whole script
      }
    });
  });
}

/**
 * Create Python collector script if it doesn't exist
 */
function createPythonCollectorScript() {
  const pythonScript = `#!/usr/bin/env python3
"""
Incremental Statcast Data Collector
Appends single day's pitch data to yearly file
"""

import sys
import json
import os
from datetime import datetime
import pandas as pd

try:
    from pybaseball import statcast
except ImportError:
    print("ERROR: pybaseball not installed. Run: pip3 install pybaseball pandas")
    sys.exit(1)

def collect_day(date_str, year):
    """Collect Statcast data for a single day"""
    print(f"Fetching Statcast data for {date_str}...")
    
    try:
        # Fetch data for the specific day
        df = statcast(start_dt=date_str, end_dt=date_str)
        
        if df is None or len(df) == 0:
            print(f"No data found for {date_str}")
            return 0
        
        print(f"Found {len(df)} pitches")
        
        # Load existing year file
        year_file = f"data/mlb_historical/statcast/{year}_pitches.json"
        
        if os.path.exists(year_file):
            print(f"Appending to existing file: {year_file}")
            existing_df = pd.read_json(year_file)
            combined_df = pd.concat([existing_df, df], ignore_index=True)
        else:
            print(f"Creating new file: {year_file}")
            combined_df = df
        
        # Save combined data
        combined_df.to_json(year_file, orient='records', indent=2)
        
        print(f"✅ Saved {len(combined_df)} total pitches to {year_file}")
        return len(df)
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        raise

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 collect_statcast_incremental.py YYYY-MM-DD YYYY")
        sys.exit(1)
    
    date = sys.argv[1]
    year = sys.argv[2]
    
    pitches = collect_day(date, year)
    print(f"\\nCollected {pitches} pitches for {date}")
`;

  fs.writeFileSync(CONFIG.PYTHON_SCRIPT, pythonScript);
  fs.chmodSync(CONFIG.PYTHON_SCRIPT, '755');
  console.log(`✅ Created Python collector script: ${CONFIG.PYTHON_SCRIPT}`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default main;
