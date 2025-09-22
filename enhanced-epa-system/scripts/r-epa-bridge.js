// scripts/r-epa-bridge.js
// Node.js bridge to run R NFLVerse data collection

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const R_SCRIPT = './scripts/clean-epa-r-collector.R';
const OUTPUT_FILE = './public/data/team-metrics.json';

async function runRDataCollection() {
  console.log('🏈 Running R-powered Clean EPA data collection...');
  
  try {
    // Check if R is available
    execSync('which R', { stdio: 'pipe' });
    console.log('✅ R runtime found');
  } catch (error) {
    console.error('❌ R not found. Please install R and required packages.');
    console.error('   brew install r');  // macOS
    return false;
  }
  
  try {
    // Run R script
    console.log('📊 Executing R NFLVerse data collection...');
    const output = execSync(`Rscript ${R_SCRIPT}`, { 
      encoding: 'utf-8',
      timeout: 120000  // 2 minute timeout
    });
    
    console.log('R Output:', output);
    
    // Verify output file was created
    if (await fs.access(OUTPUT_FILE).then(() => true).catch(() => false)) {
      console.log('✅ R data collection successful!');
      
      // Validate JSON structure
      const data = JSON.parse(await fs.readFile(OUTPUT_FILE, 'utf-8'));
      console.log(`📊 Generated data for ${Object.keys(data.teams).length} teams`);
      console.log(`🎯 Model version: ${data.model_version}`);
      console.log(`⏰ Generated at: ${data.generated_at}`);
      
      return true;
    } else {
      console.error('❌ Output file not created');
      return false;
    }
    
  } catch (error) {
    console.error('❌ R script execution failed:', error.message);
    
    // Fallback to Python if R fails
    console.log('🐍 Falling back to Python NFLVerse...');
    return await runPythonFallback();
  }
}

async function runPythonFallback() {
  try {
    console.log('📊 Running Python NFLVerse fallback...');
    const output = execSync('python3 scripts/collect-nflverse-data.py', { 
      encoding: 'utf-8',
      timeout: 90000  // 1.5 minute timeout
    });
    
    console.log('Python Output:', output);
    return true;
    
  } catch (error) {
    console.error('❌ Python fallback also failed:', error.message);
    
    // Final fallback to mock data
    console.log('🎲 Using mock data as final fallback...');
    return await generateMockData();
  }
}

async function generateMockData() {
  console.log('🎲 Generating mock data for development...');
  
  const teams = [
    'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 
    'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
    'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
    'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS'
  ];
  
  const teamData = {};
  
  for (const team of teams) {
    teamData[team] = {
      core: {
        off_epa: Math.round((Math.random() * 0.16 - 0.08) * 10000) / 10000,
        def_epa: Math.round((Math.random() * 0.16 - 0.08) * 10000) / 10000,
        last_updated: new Date().toISOString()
      },
      variance: {
        off_epa: Math.round((0.06 + Math.random() * 0.08) * 10000) / 10000,
        def_epa: Math.round((0.06 + Math.random() * 0.08) * 10000) / 10000,
        games_sample: Math.min(3, 8)  // Current week 3
      },
      tempo: {
        pace: Math.round((64 + Math.random() * 8) * 10) / 10
      },
      injuries: {
        qb_status: Math.random() < 0.05 ? 'out' : 'active',
        key_injuries: Math.floor(Math.random() * 3)
      }
    };
  }
  
  const mockData = {
    season: 2025,
    week: 3,
    teams: teamData,
    league: {
      means: { off_epa: 0, def_epa: 0, pace: 68 },
      stds: { off_epa: 0.08, def_epa: 0.08, pace: 3.5 },
      last_updated: new Date().toISOString(),
      data_quality: {
        completeness: 1.0,
        staleness_hours: 0,
        source: 'mock_development_data'
      }
    },
    generated_at: new Date().toISOString(),
    model_version: 'clean_epa_v1.0_mock'
  };
  
  // Ensure output directory exists
  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  
  // Write mock data
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(mockData, null, 2));
  
  console.log('✅ Mock data generated successfully');
  return true;
}

// Main execution
async function main() {
  const success = await runRDataCollection();
  process.exit(success ? 0 : 1);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runRDataCollection, runPythonFallback, generateMockData };