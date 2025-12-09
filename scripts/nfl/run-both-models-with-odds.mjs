#!/usr/bin/env node
/**
 * NFL Complete Analysis - Both Models + Live Odds + CSV Export
 * Usage: node scripts/nfl/run-both-models-with-odds.mjs [season] [week]
 * Example: node scripts/nfl/run-both-models-with-odds.mjs 2025 14
 * 
 * This script:
 * 1. Runs V1 model (full EPA, injuries, Kelly)
 * 2. Runs V5 model (pure statistical)
 * 3. Fetches live odds from TheOddsAPI
 * 4. Creates one CSV per game with all picks and odds
 * 5. Creates a summary CSV with all games
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '../..');

// TheOddsAPI Configuration
const ODDS_API_KEY = 'c5d3fe15e6c5be83b2acd8695cff012b';
const ODDS_API_URL = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/';

// Parse command line args
const season = process.argv[2] || '2025';
const week = process.argv[3] || '14';

console.log(`\n🏈 NFL Complete Analysis - V1 vs V5 with Live Odds`);
console.log(`Season: ${season}, Week: ${week}`);
console.log('='.repeat(80));
console.log('');

// Step 1: Run V1 Model
console.log('📊 Step 1/5: Running V1 Full Model...');
await runScript('scripts/nfl/run-v1-local.mjs', [season, week]);

// Step 2: Run V5 Model
console.log('\n🤖 Step 2/5: Running V5 Statistical Model...');
await runScript('scripts/nfl/run-v5-local.mjs', [season, week]);

// Step 3: Fetch Live Odds
console.log('\n💰 Step 3/5: Fetching live odds from TheOddsAPI...');
const oddsData = await fetchOddsFromAPI();
console.log(`✅ Fetched odds for ${oddsData.length} games`);

// Step 4: Load Model Outputs
console.log('\n📖 Step 4/5: Loading model predictions...');
const v1Path = join(ROOT, `nfl_v1_week${week}_predictions.json`);
const v5Path = join(ROOT, `nfl-model-v4.1/output/bundle_v5_${season}_week${week}.json`);

const v1Data = JSON.parse(await readFile(v1Path, 'utf-8'));
const v5Data = JSON.parse(await readFile(v5Path, 'utf-8'));

console.log(`✅ Loaded ${v1Data.predictions.length} V1 predictions`);
console.log(`✅ Loaded ${v5Data.games.length} V5 predictions`);

// Step 5: Generate CSVs
console.log('\n📝 Step 5/5: Generating CSV files...');
await generateCSVs(v1Data, v5Data, oddsData, season, week);

console.log('\n' + '='.repeat(80));
console.log('\n✅ Complete! Check the output/nfl-analysis/ folder for CSV files\n');

// Helper function to run a script and wait for completion
function runScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const fullPath = join(ROOT, scriptPath);
    const child = spawn('node', [fullPath, ...args], {
      cwd: ROOT,
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

// Fetch odds from TheOddsAPI
function fetchOddsFromAPI() {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      apiKey: ODDS_API_KEY,
      regions: 'us',
      markets: 'h2h,spreads,totals',
      oddsFormat: 'american',
      bookmakers: 'draftkings,fanduel,betmgm'
    });

    const url = `${ODDS_API_URL}?${params.toString()}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

// Generate CSV files for each game
async function generateCSVs(v1Data, v5Data, oddsData, season, week) {
  // Create output directory
  const outputDir = join(ROOT, 'output', 'nfl-analysis', `${season}_week${week}`);
  await mkdir(outputDir, { recursive: true });

  const allGamesData = [];

  for (const v1Game of v1Data.predictions) {
    // Find matching V5 game
    const v5Game = v5Data.games.find(g => 
      g.game_id === v1Game.game_id ||
      (g.home_team === v1Game.home_team && g.away_team === v1Game.away_team)
    );

    if (!v5Game) continue;

    // Find matching odds
    const oddsGame = findMatchingOdds(oddsData, v1Game.home_team, v1Game.away_team);

    // Extract data for this game
    const gameData = buildGameData(v1Game, v5Game, oddsGame);
    allGamesData.push(gameData);

    // Create individual game CSV
    const gameFilename = `${v1Game.away_team}_at_${v1Game.home_team}.csv`;
    const gameCSV = generateGameCSV(gameData);
    await writeFile(join(outputDir, gameFilename), gameCSV);
    console.log(`  ✅ ${gameFilename}`);
  }

  // Create summary CSV with all games
  const summaryCSV = generateSummaryCSV(allGamesData);
  await writeFile(join(outputDir, `week${week}_summary.csv`), summaryCSV);
  console.log(`  ✅ week${week}_summary.csv`);

  console.log(`\n📁 All files saved to: ${outputDir}`);
}

// Find matching odds for a game
function findMatchingOdds(oddsData, homeTeam, awayTeam) {
  // Team name mappings for odds API
  const teamMap = {
    'ARI': 'Arizona Cardinals',
    'ATL': 'Atlanta Falcons',
    'BAL': 'Baltimore Ravens',
    'BUF': 'Buffalo Bills',
    'CAR': 'Carolina Panthers',
    'CHI': 'Chicago Bears',
    'CIN': 'Cincinnati Bengals',
    'CLE': 'Cleveland Browns',
    'DAL': 'Dallas Cowboys',
    'DEN': 'Denver Broncos',
    'DET': 'Detroit Lions',
    'GB': 'Green Bay Packers',
    'HOU': 'Houston Texans',
    'IND': 'Indianapolis Colts',
    'JAX': 'Jacksonville Jaguars',
    'KC': 'Kansas City Chiefs',
    'LA': 'Los Angeles Rams',
    'LAC': 'Los Angeles Chargers',
    'LV': 'Las Vegas Raiders',
    'MIA': 'Miami Dolphins',
    'MIN': 'Minnesota Vikings',
    'NE': 'New England Patriots',
    'NO': 'New Orleans Saints',
    'NYG': 'New York Giants',
    'NYJ': 'New York Jets',
    'PHI': 'Philadelphia Eagles',
    'PIT': 'Pittsburgh Steelers',
    'SEA': 'Seattle Seahawks',
    'SF': 'San Francisco 49ers',
    'TB': 'Tampa Bay Buccaneers',
    'TEN': 'Tennessee Titans',
    'WAS': 'Washington Commanders'
  };

  const homeFullName = teamMap[homeTeam];
  const awayFullName = teamMap[awayTeam];

  return oddsData.find(game => 
    game.home_team === homeFullName && game.away_team === awayFullName
  );
}

// Build comprehensive game data object
function buildGameData(v1Game, v5Game, oddsGame) {
  // Extract V1 predictions
  const v1Spread = v1Game.predictions?.spread?.predicted || 0;
  const v1SpreadPick = v1Game.predictions?.spread?.pick || 'N/A';
  const v1SpreadBet = v1Game.predictions?.spread?.bet || false;
  const v1SpreadConf = v1Game.predictions?.spread?.confidence || 0;

  const v1Total = v1Game.predictions?.total?.predicted || 0;
  const v1TotalPick = v1Game.predictions?.total?.pick || 'N/A';
  const v1TotalBet = v1Game.predictions?.total?.bet || false;
  const v1TotalConf = v1Game.predictions?.total?.confidence || 0;

  const v1MLPick = v1Game.predictions?.moneyline?.pick || 'N/A';
  const v1MLBet = v1Game.predictions?.moneyline?.bet || false;
  const v1MLConf = v1Game.predictions?.moneyline?.confidence || 0;

  // Extract V5 predictions
  const v5Spread = v5Game.spread_model?.predicted_spread || 0;
  const v5Favorite = v5Game.spread_model?.favorite_team || 'N/A';
  const v5Total = v5Game.total_model?.p50 || 0;
  const v5TotalP25 = v5Game.total_model?.p25 || 0;
  const v5TotalP75 = v5Game.total_model?.p75 || 0;

  // Extract live odds
  let marketSpread = 'N/A';
  let marketSpreadHome = 'N/A';
  let marketSpreadAway = 'N/A';
  let marketTotal = 'N/A';
  let marketTotalOver = 'N/A';
  let marketTotalUnder = 'N/A';
  let marketMLHome = 'N/A';
  let marketMLAway = 'N/A';
  let bestBook = 'N/A';

  if (oddsGame && oddsGame.bookmakers && oddsGame.bookmakers.length > 0) {
    const book = oddsGame.bookmakers[0]; // Use first available book
    bestBook = book.key;

    // Spreads
    const spreadMarket = book.markets?.find(m => m.key === 'spreads');
    if (spreadMarket && spreadMarket.outcomes) {
      const homeSpread = spreadMarket.outcomes.find(o => o.name === oddsGame.home_team);
      const awaySpread = spreadMarket.outcomes.find(o => o.name === oddsGame.away_team);
      if (homeSpread) {
        marketSpread = homeSpread.point;
        marketSpreadHome = homeSpread.price;
      }
      if (awaySpread) {
        marketSpreadAway = awaySpread.price;
      }
    }

    // Totals
    const totalMarket = book.markets?.find(m => m.key === 'totals');
    if (totalMarket && totalMarket.outcomes) {
      const over = totalMarket.outcomes.find(o => o.name === 'Over');
      const under = totalMarket.outcomes.find(o => o.name === 'Under');
      if (over) {
        marketTotal = over.point;
        marketTotalOver = over.price;
      }
      if (under) {
        marketTotalUnder = under.price;
      }
    }

    // Moneyline
    const mlMarket = book.markets?.find(m => m.key === 'h2h');
    if (mlMarket && mlMarket.outcomes) {
      const homeMl = mlMarket.outcomes.find(o => o.name === oddsGame.home_team);
      const awayMl = mlMarket.outcomes.find(o => o.name === oddsGame.away_team);
      if (homeMl) marketMLHome = homeMl.price;
      if (awayMl) marketMLAway = awayMl.price;
    }
  }

  return {
    game: `${v1Game.away_team} @ ${v1Game.home_team}`,
    homeTeam: v1Game.home_team,
    awayTeam: v1Game.away_team,
    kickoff: v1Game.start || v5Game.gameday,
    
    // Market Odds
    marketSpread,
    marketSpreadHome,
    marketSpreadAway,
    marketTotal,
    marketTotalOver,
    marketTotalUnder,
    marketMLHome,
    marketMLAway,
    bestBook,
    
    // V1 Predictions
    v1SpreadPick,
    v1SpreadValue: v1Spread,
    v1SpreadBet,
    v1SpreadConf,
    v1TotalPick,
    v1TotalValue: v1Total,
    v1TotalBet,
    v1TotalConf,
    v1MLPick,
    v1MLBet,
    v1MLConf,
    
    // V5 Predictions
    v5SpreadFavorite: v5Favorite,
    v5SpreadValue: v5Spread,
    v5TotalValue: v5Total,
    v5TotalP25,
    v5TotalP75,
    
    // Edges
    spreadDisagreement: Math.abs(v1Spread - v5Spread).toFixed(1),
    totalDisagreement: Math.abs(v1Total - v5Total).toFixed(1)
  };
}

// Generate individual game CSV
function generateGameCSV(gameData) {
  let csv = 'Market,V1 Model,V5 Model,Live Odds,Edge/Notes\n';
  
  // Spread
  csv += `SPREAD,`;
  csv += `${gameData.v1SpreadPick} by ${gameData.v1SpreadValue.toFixed(1)} ${gameData.v1SpreadBet ? '(BET ✓)' : ''} [${gameData.v1SpreadConf}% conf],`;
  csv += `${gameData.v5SpreadFavorite} by ${Math.abs(gameData.v5SpreadValue).toFixed(1)},`;
  csv += `${gameData.homeTeam} ${gameData.marketSpread} (${gameData.marketSpreadHome}/${gameData.marketSpreadAway}),`;
  csv += `Models differ by ${gameData.spreadDisagreement} pts\n`;
  
  // Total
  csv += `TOTAL,`;
  csv += `${gameData.v1TotalPick.toUpperCase()} ${gameData.v1TotalValue.toFixed(1)} ${gameData.v1TotalBet ? '(BET ✓)' : ''} [${gameData.v1TotalConf}% conf],`;
  csv += `${gameData.v5TotalValue.toFixed(1)} (range: ${gameData.v5TotalP25}-${gameData.v5TotalP75}),`;
  csv += `${gameData.marketTotal} (O: ${gameData.marketTotalOver} / U: ${gameData.marketTotalUnder}),`;
  csv += `Models differ by ${gameData.totalDisagreement} pts\n`;
  
  // Moneyline
  csv += `MONEYLINE,`;
  csv += `${gameData.v1MLPick} ${gameData.v1MLBet ? '(BET ✓)' : ''} [${gameData.v1MLConf}% conf],`;
  csv += `${gameData.v5SpreadFavorite} favored,`;
  csv += `${gameData.homeTeam}: ${gameData.marketMLHome} / ${gameData.awayTeam}: ${gameData.marketMLAway},`;
  csv += `Book: ${gameData.bestBook}\n`;
  
  return csv;
}

// Generate summary CSV with all games
function generateSummaryCSV(allGamesData) {
  // Header
  let csv = 'Game,Kickoff,';
  csv += 'Market Spread,V1 Spread Pick,V1 Spread Bet,V1 Conf %,V5 Spread Pick,Spread Diff,';
  csv += 'Market Total,V1 Total Pick,V1 Total Bet,V1 Conf %,V5 Total,Total Diff,';
  csv += 'V1 ML Pick,V1 ML Bet,Market ML Home,Market ML Away,Best Book\n';
  
  // Data rows
  for (const game of allGamesData) {
    csv += `"${game.game}","${game.kickoff}",`;
    csv += `${game.marketSpread},${game.v1SpreadPick},${game.v1SpreadBet ? 'YES' : 'NO'},${game.v1SpreadConf},${game.v5SpreadFavorite} by ${Math.abs(game.v5SpreadValue).toFixed(1)},${game.spreadDisagreement},`;
    csv += `${game.marketTotal},${game.v1TotalPick},${game.v1TotalBet ? 'YES' : 'NO'},${game.v1TotalConf},${game.v5TotalValue.toFixed(1)},${game.totalDisagreement},`;
    csv += `${game.v1MLPick},${game.v1MLBet ? 'YES' : 'NO'},${game.marketMLHome},${game.marketMLAway},${game.bestBook}\n`;
  }
  
  return csv;
}
