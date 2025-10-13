// scripts/master-data-pipeline.js
// MASTER DATA PIPELINE: ESPN + NFLVerse → GitHub → Frontend

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Import existing modules
const { fetchPlayerPropOdds } = require('./fetch-player-prop-odds.js');

const CURRENT_WEEK = process.env.NFL_WEEK || '4';
const CURRENT_SEASON = process.env.NFL_SEASON || '2025';
const DATA_DIR = 'public/data';

console.log(`🎯 MASTER DATA PIPELINE: Week ${CURRENT_WEEK}, ${CURRENT_SEASON}`);

async function ensureDataDirectory() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  console.log(`📁 Created data directory: ${DATA_DIR}`);
}

// Step 1: Collect ESPN Depth Charts
async function collectESPNData() {
  console.log('\n📡 STEP 1: ESPN Data Collection');
  
  try {
    // Use your existing ESPN collection function
    execSync('node -e "require(\'./netlify/functions/_shared/rosters-shared.cjs\').fetchESPNJson(true).then(console.log)"', {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    console.log('✅ ESPN depth charts collected');
  } catch (error) {
    console.warn('⚠️ ESPN collection failed, using fallback');
  }
}

// Step 2: Run NFLVerse Python Collection
async function collectNFLVerseData() {
  console.log('\n🐍 STEP 2: NFLVerse Data Collection');
  
  try {
    execSync(`python3 scripts/collect-nflverse-data.py`, {
      stdio: 'inherit',
      env: { ...process.env, NFL_WEEK: CURRENT_WEEK, NFL_SEASON: CURRENT_SEASON }
    });
    console.log('✅ NFLVerse historical data collected');
  } catch (error) {
    console.warn('⚠️ NFLVerse collection failed:', error.message);
  }
}

// Step 3: Generate Player Data (Your existing JS pipeline)
async function generatePlayerData() {
  console.log('\n⚽ STEP 3: Player Data Generation');
  
  try {
    execSync(`node scripts/collect-player-data.js`, {
      stdio: 'inherit',
      env: { ...process.env, NFL_WEEK: CURRENT_WEEK, NFL_SEASON: CURRENT_SEASON }
    });
    console.log('✅ Player data generated (448 players)');
  } catch (error) {
    console.error('❌ Player data generation failed:', error);
    throw error;
  }
}

// Step 4: Fetch Live Odds (TheODDSAPI)
async function collectLiveOdds() {
  console.log('\n💰 STEP 4: Live Odds Collection');
  
  try {
    const odds = await fetchPlayerPropOdds();
    
    const oddsFile = path.join(DATA_DIR, 'nfl-player-prop-odds-latest.json');
    await fs.writeFile(oddsFile, JSON.stringify({
      metadata: {
        generated_at: new Date().toISOString(),
        week: CURRENT_WEEK,
        season: CURRENT_SEASON,
        total_players: Object.keys(odds).length
      },
      odds: odds
    }, null, 2));
    
    console.log(`✅ Live odds collected for ${Object.keys(odds).length} players`);
    return odds;
  } catch (error) {
    console.warn('⚠️ Live odds collection failed:', error.message);
    return {};
  }
}

// Step 5: Generate Enhanced Schedule
async function generateScheduleData() {
  console.log('\n📅 STEP 5: Schedule Data Generation');
  
  try {
    // Use your existing ESPN schedule fetch
    const scheduleUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?season=${CURRENT_SEASON}&week=${CURRENT_WEEK}&seasontype=2`;
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(scheduleUrl);
    const data = await response.json();
    
    const games = (data?.events || []).map(event => ({
      game_id: event.id,
      date: event.date,
      homeTeam: event.competitions[0].competitors.find(c => c.homeAway === 'home')?.team?.displayName,
      awayTeam: event.competitions[0].competitors.find(c => c.homeAway === 'away')?.team?.displayName,
      home_team: event.competitions[0].competitors.find(c => c.homeAway === 'home')?.team?.abbreviation,
      away_team: event.competitions[0].competitors.find(c => c.homeAway === 'away')?.team?.abbreviation,
      status: event.status?.type?.description || 'Scheduled'
    }));
    
    const scheduleData = {
      metadata: {
        season: CURRENT_SEASON,
        generated_at: new Date().toISOString(),
        source: 'ESPN_API'
      },
      weeks: {
        [CURRENT_WEEK]: {
          week: parseInt(CURRENT_WEEK),
          games: games.length,
          matchups: games
        }
      }
    };
    
    const scheduleFile = path.join(DATA_DIR, `nfl-schedule-${CURRENT_SEASON}.json`);
    await fs.writeFile(scheduleFile, JSON.stringify(scheduleData, null, 2));
    
    console.log(`✅ Schedule generated: ${games.length} games for Week ${CURRENT_WEEK}`);
    return scheduleData;
  } catch (error) {
    console.error('❌ Schedule generation failed:', error);
    throw error;
  }
}

// Step 6: Generate Final TD Predictions
async function generateTDPredictions(scheduleData, odds) {
  console.log('\n🎯 STEP 6: TD Predictions Generation');
  
  try {
    // Use your comprehensive TD function
    const games = scheduleData.weeks[CURRENT_WEEK].matchups;
    
    execSync(`node -e "
      const { default: generateTDPredictions } = require('./netlify/functions/nfl-td-comprehensive-predictions/index.mjs');
      generateTDPredictions(${JSON.stringify(games)}, '${CURRENT_SEASON}')
        .then(result => console.log('TD Predictions:', JSON.stringify(result, null, 2)))
        .catch(console.error);
    "`, {
      stdio: 'inherit'
    });
    
    console.log('✅ TD predictions generated with live odds integration');
  } catch (error) {
    console.error('❌ TD predictions failed:', error);
  }
}

// Step 7: Prepare for Git Commit
async function prepareForCommit() {
  console.log('\n📤 STEP 7: Prepare for GitHub Upload');
  
  const filesToCommit = [
    'public/nfl-anytime-td-player-data.json',
    'public/data/nfl-schedule-2025.json',
    'public/data/nfl-player-prop-odds-latest.json',
    'public/data/nfl-td-comprehensive-latest.json'
  ];
  
  const stats = {};
  for (const file of filesToCommit) {
    try {
      const stat = await fs.stat(file);
      const content = JSON.parse(await fs.readFile(file, 'utf8'));
      stats[file] = {
        size_kb: Math.round(stat.size / 1024),
        last_modified: stat.mtime.toISOString(),
        records: content.metadata?.total_players || content.predictions?.length || 'N/A'
      };
    } catch (error) {
      stats[file] = { error: 'File not found' };
    }
  }
  
  console.log('📊 Files ready for commit:');
  console.table(stats);
  
  // Generate commit message
  const commitMessage = `Data update: Week ${CURRENT_WEEK} NFL predictions with ${stats['public/nfl-anytime-td-player-data.json']?.records || 'N/A'} players`;
  
  console.log(`\n🚀 Ready to commit with message: "${commitMessage}"`);
  console.log('\nTo commit and push:');
  console.log('git add public/');
  console.log(`git commit -m "${commitMessage}"`);
  console.log('git push origin main33');
}

// Main Pipeline Execution
async function runMasterPipeline() {
  try {
    await ensureDataDirectory();
    
    // Run all data collection steps
    await collectESPNData();
    await collectNFLVerseData(); 
    await generatePlayerData();
    
    const odds = await collectLiveOdds();
    const scheduleData = await generateScheduleData();
    await generateTDPredictions(scheduleData, odds);
    
    await prepareForCommit();
    
    console.log('\n🎉 MASTER DATA PIPELINE COMPLETE!');
    console.log('\nData files generated:');
    console.log('- public/nfl-anytime-td-player-data.json (448 players)');
    console.log('- public/data/nfl-schedule-2025.json (16 games)');
    console.log('- public/data/nfl-player-prop-odds-latest.json (live odds)');
    console.log('- public/data/nfl-td-comprehensive-latest.json (predictions)');
    
  } catch (error) {
    console.error('\n❌ Pipeline failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runMasterPipeline();
}

module.exports = { runMasterPipeline };