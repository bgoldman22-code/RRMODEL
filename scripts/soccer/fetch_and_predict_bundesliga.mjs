#!/usr/bin/env node
/**
 * Fetch upcoming Bundesliga fixtures and generate live predictions
 * 
 * Usage:
 *   node scripts/soccer/fetch_and_predict_bundesliga.mjs
 * 
 * Fetches fixtures from API-Football or The Odds API, then runs predictions
 */

import fetch from 'node-fetch';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || '';

/**
 * Fetch upcoming Bundesliga fixtures from The Odds API
 */
async function fetchFixturesFromOddsAPI() {
  if (!ODDS_API_KEY) {
    console.error('⚠️  ODDS_API_KEY not set, using sample data');
    return [];
  }

  const url = `https://api.the-odds-api.com/v4/sports/soccer_germany_bundesliga/odds/?` +
    `apiKey=${ODDS_API_KEY}&` +
    `regions=eu&` +
    `markets=btts&` +
    `oddsFormat=decimal&` +
    `dateFormat=iso`;

  try {
    console.log('📡 Fetching fixtures from The Odds API...');
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✓ Found ${data.length} upcoming fixtures`);

    // Transform to our format
    const fixtures = data.map(game => {
      const bookmaker = game.bookmakers?.[0]; // Use first bookmaker
      const bttsMarket = bookmaker?.markets?.find(m => m.key === 'btts');
      
      const bttsYes = bttsMarket?.outcomes?.find(o => o.name === 'Yes')?.price || null;
      const bttsNo = bttsMarket?.outcomes?.find(o => o.name === 'No')?.price || null;

      return {
        id: game.id,
        home_team: game.home_team,
        away_team: game.away_team,
        commence_time: game.commence_time,
        odds: bttsYes && bttsNo ? {
          btts_yes: bttsYes,
          btts_no: bttsNo,
          bookmaker: bookmaker?.key || 'unknown'
        } : null
      };
    });

    return fixtures;
  } catch (error) {
    console.error('❌ Error fetching from Odds API:', error.message);
    return [];
  }
}

/**
 * Fetch upcoming fixtures from API-Football
 */
async function fetchFixturesFromAPIFootball() {
  if (!API_FOOTBALL_KEY) {
    console.error('⚠️  API_FOOTBALL_KEY not set');
    return [];
  }

  // Bundesliga league ID: 78
  const today = new Date().toISOString().split('T')[0];
  const url = `https://v3.football.api-sports.io/fixtures?league=78&season=2024&from=${today}`;

  try {
    console.log('📡 Fetching fixtures from API-Football...');
    const response = await fetch(url, {
      headers: {
        'x-apisports-key': API_FOOTBALL_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    const fixtures = data.response?.map(game => ({
      id: game.fixture.id,
      home_team: game.teams.home.name,
      away_team: game.teams.away.name,
      commence_time: game.fixture.date,
      odds: null // Would need separate API call
    })) || [];

    console.log(`✓ Found ${fixtures.length} upcoming fixtures`);
    return fixtures;
  } catch (error) {
    console.error('❌ Error fetching from API-Football:', error.message);
    return [];
  }
}

/**
 * Sample fixtures for testing
 */
function getSampleFixtures() {
  return [
    {
      home_team: 'Bayern München',
      away_team: 'Borussia Dortmund',
      commence_time: new Date(Date.now() + 86400000).toISOString(),
      odds: {
        btts_yes: 1.65,
        btts_no: 2.20,
        bookmaker: 'bet365'
      }
    },
    {
      home_team: 'RB Leipzig',
      away_team: 'Bayer Leverkusen',
      commence_time: new Date(Date.now() + 172800000).toISOString(),
      odds: {
        btts_yes: 1.72,
        btts_no: 2.05,
        bookmaker: 'bet365'
      }
    },
    {
      home_team: 'Eintracht Frankfurt',
      away_team: 'VfL Wolfsburg',
      commence_time: new Date(Date.now() + 259200000).toISOString(),
      odds: {
        btts_yes: 1.80,
        btts_no: 1.95,
        bookmaker: 'bet365'
      }
    }
  ];
}

/**
 * Run Python prediction script
 */
function runPredictionScript(fixtures) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(__dirname, 'predict_live_bundesliga.py');
    const python = spawn('python3', [scriptPath], {
      cwd: join(__dirname, '..', '..'),
    });

    let stdout = '';
    let stderr = '';

    // Send fixtures via stdin
    python.stdin.write(JSON.stringify({ fixtures }));
    python.stdin.end();

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error('Python stderr:', stderr);
        reject(new Error(`Prediction script failed with code ${code}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse prediction output: ${e.message}`));
      }
    });

    python.on('error', (err) => {
      reject(new Error(`Failed to run Python: ${err.message}`));
    });
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('🎯 Bundesliga BTTS Live Prediction System\n');

  // Fetch fixtures (try Odds API first, fallback to sample)
  let fixtures = await fetchFixturesFromOddsAPI();
  
  if (fixtures.length === 0 && API_FOOTBALL_KEY) {
    fixtures = await fetchFixturesFromAPIFootball();
  }
  
  if (fixtures.length === 0) {
    console.log('⚠️  No fixtures fetched from APIs, using sample data\n');
    fixtures = getSampleFixtures();
  }

  console.log(`\n📊 Analyzing ${fixtures.length} fixtures...\n`);

  // Run predictions
  try {
    const predictions = await runPredictionScript(fixtures);

    console.log('═══════════════════════════════════════════════════');
    console.log('  PREDICTION RESULTS');
    console.log('═══════════════════════════════════════════════════\n');
    
    console.log(`Model: ${predictions.model}`);
    console.log(`Generated: ${new Date(predictions.generated_at).toLocaleString()}`);
    console.log(`Validation ROI: ${(predictions.validation_roi * 100).toFixed(1)}%`);
    console.log(`Hit Rate: ${(predictions.hit_rate * 100).toFixed(1)}%`);
    console.log(`\nTotal Predictions: ${predictions.total_predictions}`);
    console.log(`Recommended Bets: ${predictions.recommended_bets}\n`);

    // Show all predictions
    console.log('ALL PREDICTIONS:');
    console.log('─────────────────────────────────────────────────\n');
    
    for (const pred of predictions.predictions) {
      console.log(`${pred.home_team} vs ${pred.away_team}`);
      console.log(`  Model Probability: ${(pred.model_probability * 100).toFixed(1)}%`);
      console.log(`  Expected Goals: ${pred.expected_home_goals.toFixed(2)} - ${pred.expected_away_goals.toFixed(2)}`);
      
      if (pred.market_probability) {
        console.log(`  Market Probability: ${(pred.market_probability * 100).toFixed(1)}%`);
        console.log(`  Edge: ${(pred.edge * 100).toFixed(1)}%`);
        console.log(`  Odds: ${pred.market_odds.btts_yes.toFixed(2)}`);
        
        if (pred.bet_decision?.should_bet) {
          console.log(`  ✅ BET RECOMMENDED`);
          console.log(`     Stake: ${pred.bet_decision.recommended_stake_pct.toFixed(2)}% of bankroll`);
          console.log(`     Confidence: ${pred.bet_decision.confidence}`);
        } else {
          console.log(`  ❌ NO BET - ${pred.gates_failed.join(', ')}`);
        }
      }
      console.log('');
    }

    // Highlight recommended bets
    if (predictions.bets.length > 0) {
      console.log('\n═══════════════════════════════════════════════════');
      console.log('  🎯 RECOMMENDED BETS');
      console.log('═══════════════════════════════════════════════════\n');
      
      for (const bet of predictions.bets) {
        console.log(`${bet.home_team} vs ${bet.away_team}`);
        console.log(`  Odds: ${bet.market_odds.btts_yes.toFixed(2)}`);
        console.log(`  Edge: ${(bet.edge * 100).toFixed(1)}%`);
        console.log(`  Stake: ${bet.bet_decision.recommended_stake_pct.toFixed(2)}%`);
        console.log(`  Confidence: ${bet.bet_decision.confidence}\n`);
      }
    } else {
      console.log('\n⚠️  No betting opportunities found in current fixtures\n');
    }

    // Save to file
    const fs = await import('fs/promises');
    const outputPath = join(__dirname, '..', '..', 'data', 'bundesliga', 'latest_predictions.json');
    await fs.writeFile(outputPath, JSON.stringify(predictions, null, 2));
    console.log(`💾 Predictions saved to: ${outputPath}\n`);

  } catch (error) {
    console.error('❌ Prediction failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
