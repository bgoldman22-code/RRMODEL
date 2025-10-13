// scripts/td-data-pipeline.js
// SIMPLIFIED TD PIPELINE: Week 3 Anytime TD Predictions Only

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

const CURRENT_WEEK = 3; // Fixed for Week 3
const CURRENT_SEASON = 2025;
const DATA_DIR = 'public/data';

console.log(`🏈 TD PREDICTIONS PIPELINE: Week ${CURRENT_WEEK}, ${CURRENT_SEASON}`);
console.log('🎯 ANYTIME TD ONLY (no spread/total predictions)');

async function ensureDataDirectory() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  console.log(`📁 Data directory ready: ${DATA_DIR}`);
}

// Step 1: Generate Player Data (using existing Week 3 depth charts)
async function generatePlayerData() {
  console.log('\n⚽ STEP 1: Player Data Generation (Week 3)');
  
  try {
    const env = { 
      ...process.env, 
      NFL_WEEK: CURRENT_WEEK.toString(), 
      NFL_SEASON: CURRENT_SEASON.toString() 
    };
    
    execSync(`node scripts/collect-player-data.js`, {
      stdio: 'inherit',
      env: env
    });
    
    // Verify the output
    const playerDataPath = 'public/nfl-anytime-td-player-data.json';
    const playerData = JSON.parse(await fs.readFile(playerDataPath, 'utf8'));
    const playerCount = Object.keys(playerData.players || {}).length;
    
    console.log(`✅ Player data generated: ${playerCount} players`);
    return playerData;
    
  } catch (error) {
    console.error('❌ Player data generation failed:', error);
    throw error;
  }
}

// Step 2: Generate Week 3 Schedule
async function generateScheduleData() {
  console.log('\n📅 STEP 2: Week 3 Schedule Data');
  
  try {
    // Create schedule data for Week 3 (using existing structure)
    const scheduleData = {
      metadata: {
        season: CURRENT_SEASON,
        generated_at: new Date().toISOString(),
        source: 'committed_data'
      },
      weeks: {
        "3": {
          week: 3,
          games: 16,
          matchups: [
            { game_id: "BUF_MIA", homeTeam: "Buffalo Bills", awayTeam: "Miami Dolphins", home_team: "BUF", away_team: "MIA" },
            { game_id: "CAR_ATL", homeTeam: "Carolina Panthers", awayTeam: "Atlanta Falcons", home_team: "CAR", away_team: "ATL" },
            { game_id: "CLE_GB", homeTeam: "Cleveland Browns", awayTeam: "Green Bay Packers", home_team: "CLE", away_team: "GB" },
            { game_id: "JAX_HOU", homeTeam: "Jacksonville Jaguars", awayTeam: "Houston Texans", home_team: "JAX", away_team: "HOU" },
            { game_id: "MIN_CIN", homeTeam: "Minnesota Vikings", awayTeam: "Cincinnati Bengals", home_team: "MIN", away_team: "CIN" },
            { game_id: "NE_PIT", homeTeam: "New England Patriots", awayTeam: "Pittsburgh Steelers", home_team: "NE", away_team: "PIT" },
            { game_id: "TEN_IND", homeTeam: "Tennessee Titans", awayTeam: "Indianapolis Colts", home_team: "TEN", away_team: "IND" },
            { game_id: "PHI_LAR", homeTeam: "Philadelphia Eagles", awayTeam: "Los Angeles Rams", home_team: "PHI", away_team: "LAR" },
            { game_id: "TB_NYJ", homeTeam: "Tampa Bay Buccaneers", awayTeam: "New York Jets", home_team: "TB", away_team: "NYJ" },
            { game_id: "WAS_LV", homeTeam: "Washington Commanders", awayTeam: "Las Vegas Raiders", home_team: "WAS", away_team: "LV" },
            { game_id: "LAC_DEN", homeTeam: "Los Angeles Chargers", awayTeam: "Denver Broncos", home_team: "LAC", away_team: "DEN" },
            { game_id: "SEA_NO", homeTeam: "Seattle Seahawks", awayTeam: "New Orleans Saints", home_team: "SEA", away_team: "NO" },
            { game_id: "CHI_DAL", homeTeam: "Chicago Bears", awayTeam: "Dallas Cowboys", home_team: "CHI", away_team: "DAL" },
            { game_id: "SF_ARI", homeTeam: "San Francisco 49ers", awayTeam: "Arizona Cardinals", home_team: "SF", away_team: "ARI" },
            { game_id: "NYG_KC", homeTeam: "New York Giants", awayTeam: "Kansas City Chiefs", home_team: "NYG", away_team: "KC" },
            { game_id: "BAL_DET", homeTeam: "Baltimore Ravens", awayTeam: "Detroit Lions", home_team: "BAL", away_team: "DET" }
          ]
        }
      }
    };
    
    const scheduleFile = path.join(DATA_DIR, `nfl-schedule-${CURRENT_SEASON}.json`);
    await fs.writeFile(scheduleFile, JSON.stringify(scheduleData, null, 2));
    
    console.log(`✅ Schedule data created: 16 games for Week ${CURRENT_WEEK}`);
    return scheduleData;
    
  } catch (error) {
    console.error('❌ Schedule generation failed:', error);
    throw error;
  }
}

// Step 3: Generate TD Predictions (using local function)
async function generateTDPredictions(scheduleData) {
  console.log('\n🎯 STEP 3: Generate TD Predictions');
  
  try {
    const games = scheduleData.weeks["3"].matchups;
    
    // Test local TD function first
    execSync(`node test-td-function.js`, {
      stdio: 'inherit'
    });
    
    console.log('✅ TD predictions generated successfully');
    
    // Verify the predictions file
    const predictionsPath = 'public/data/nfl-td-comprehensive-latest.json';
    const predictions = JSON.parse(await fs.readFile(predictionsPath, 'utf8'));
    
    console.log(`📊 Generated predictions for ${predictions.predictions?.length || 0} games`);
    console.log(`👥 Total players: ${predictions.metadata?.total_players || 0}`);
    
    return predictions;
    
  } catch (error) {
    console.error('❌ TD predictions failed:', error);
    throw error;
  }
}

// Step 4: Commit to GitHub for Frontend Access
async function commitToGitHub(playerData, scheduleData, predictions) {
  console.log('\n📤 STEP 4: Prepare for GitHub Commit');
  
  const filesToCommit = [
    'public/nfl-anytime-td-player-data.json',
    'public/data/nfl-schedule-2025.json', 
    'public/data/nfl-td-comprehensive-latest.json'
  ];
  
  const stats = {};
  for (const file of filesToCommit) {
    try {
      const stat = await fs.stat(file);
      stats[file] = {
        size_kb: Math.round(stat.size / 1024),
        last_modified: stat.mtime.toISOString()
      };
    } catch (error) {
      stats[file] = { error: 'File not found' };
    }
  }
  
  console.log('📊 Files ready for GitHub commit:');
  console.table(stats);
  
  const playerCount = Object.keys(playerData.players || {}).length;
  const commitMessage = `Week 3 TD predictions: ${playerCount} players, ${predictions.predictions?.length || 0} games`;
  
  console.log(`\n🚀 Commit message: "${commitMessage}"`);
  console.log('\nTo commit and push:');
  console.log('git add public/');
  console.log(`git commit -m "${commitMessage}"`);
  console.log('git push origin main33');
  
  return commitMessage;
}

// Main TD Pipeline
async function runTDPipeline() {
  try {
    console.log('🎯 TD-ONLY PIPELINE STARTING...\n');
    
    await ensureDataDirectory();
    
    // Generate player data from existing Week 3 depth charts
    const playerData = await generatePlayerData();
    
    // Create schedule for Week 3
    const scheduleData = await generateScheduleData();
    
    // Generate TD predictions
    const predictions = await generateTDPredictions(scheduleData);
    
    // Prepare for GitHub commit
    await commitToGitHub(playerData, scheduleData, predictions);
    
    console.log('\n🎉 TD PIPELINE COMPLETE!');
    console.log('===============================');
    console.log('\n✅ Generated Files:');
    console.log('- public/nfl-anytime-td-player-data.json (448 players)');
    console.log('- public/data/nfl-schedule-2025.json (Week 3, 16 games)');
    console.log('- public/data/nfl-td-comprehensive-latest.json (TD predictions)');
    console.log('\n🌐 Frontend Access Options:');
    console.log('1. Direct JSON: /nfl-anytime-td-player-data.json');
    console.log('2. Direct JSON: /data/nfl-td-comprehensive-latest.json');
    console.log('3. Live function: /.netlify/functions/nfl-td-comprehensive-predictions');
    console.log('\n📤 Ready to commit to GitHub for production deployment!');
    
  } catch (error) {
    console.error('\n❌ TD Pipeline failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTDPipeline();
}

module.exports = { runTDPipeline };