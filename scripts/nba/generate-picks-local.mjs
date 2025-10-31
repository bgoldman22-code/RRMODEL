/**
 * Local NBA Predictions Generator
 * 
 * Generates picks for tonight's games using local boxscores data
 * Exports to CSV in Downloads folder
 * 
 * Usage: ODDS_API_KEY=xxx node scripts/nba/generate-picks-local.mjs
 */

import { readFile, writeFile } from 'fs/promises';
import fetch from 'node-fetch';
import { homedir } from 'os';
import { join } from 'path';

const API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';
const REGIONS = 'us';
const BOOKMAKERS = 'draftkings,fanduel';
const ODDS_FORMAT = 'american';

const EDGE_THRESHOLD = 4.0;
const CONFIDENCE_THRESHOLD = 0.60;
const MIN_KELLY = 0.01;

function americanToProb(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculatePlayerStats(boxscores, playerName, asOfDate) {
  const games = boxscores
    .filter(b => b.playerName === playerName && new Date(b.gameDate) < new Date(asOfDate))
    .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate))
    .filter(b => b.minutes > 0);

  if (games.length < 5) return null;

  const L5 = games.slice(0, 5);
  const L10 = games.slice(0, 10);
  
  // Calculate minute variance (coefficient of variation)
  const minuteValues = L10.map(g => g.minutes);
  const avgMinutes = minuteValues.reduce((a, b) => a + b, 0) / minuteValues.length;
  const minuteStdev = Math.sqrt(minuteValues.reduce((sq, n) => sq + Math.pow(n - avgMinutes, 2), 0) / minuteValues.length);
  const minuteCV = (minuteStdev / avgMinutes) * 100;

  return {
    L5_rpg: L5.reduce((sum, g) => sum + g.rebounds, 0) / L5.length,
    L5_apg: L5.reduce((sum, g) => sum + g.assists, 0) / L5.length,
    L5_minutes: L5.reduce((sum, g) => sum + g.minutes, 0) / L5.length,
    L10_rpg: L10.reduce((sum, g) => sum + g.rebounds, 0) / L10.length,
    L10_apg: L10.reduce((sum, g) => sum + g.assists, 0) / L10.length,
    avgMinutes,
    minuteCV,
    L10_minutes: L10.reduce((sum, g) => sum + g.minutes, 0) / L10.length,
    season_rpg: games.reduce((sum, g) => sum + g.rebounds, 0) / games.length,
    season_apg: games.reduce((sum, g) => sum + g.assists, 0) / games.length,
    games_played: games.length,
    last_game: games[0]
  };
}

function generatePrediction(stats, propType, isHome, restDays) {
  if (!stats) return null;

  let base, seasonAvg;
  
  if (propType === 'player_rebounds') {
    base = stats.L5_rpg;
    seasonAvg = stats.season_rpg;
  } else if (propType === 'player_assists') {
    base = stats.L5_apg;
    seasonAvg = stats.season_apg;
  } else {
    return null;
  }

  let predicted = base * 0.7 + seasonAvg * 0.3;
  
  if (isHome) predicted *= 1.03;
  if (restDays >= 2) predicted *= 1.02;
  if (stats.L5_minutes < 25) predicted *= 0.95;

  const variance = Math.abs(base - seasonAvg);
  const confidence = Math.max(0.5, 0.95 - (variance * 0.1));

  return {
    predicted,
    confidence
  };
}

function calculateRestDays(boxscores, playerName, gameDate) {
  const prevGames = boxscores
    .filter(b => b.playerName === playerName && new Date(b.gameDate) < new Date(gameDate))
    .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
  
  if (prevGames.length === 0) return 3;
  
  const lastGame = new Date(prevGames[0].gameDate);
  const current = new Date(gameDate);
  const diffDays = Math.floor((current - lastGame) / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

async function main() {
  console.log('🏀 NBA Picks Generator - Local (Top 8 Minutes Filter)');
  
  if (!API_KEY) {
    console.error('❌ ODDS_API_KEY environment variable required');
    process.exit(1);
  }

  // Load boxscores
  const boxscoresData = await readFile('/tmp/player-boxscores-2024.json', 'utf-8');
  const boxscores = JSON.parse(boxscoresData);
  console.log(`✅ Loaded ${boxscores.length} boxscore entries`);

  // Calculate average minutes per player by team (last 10 games)
  console.log('📊 Calculating rotation rankings...');
  const playerMinutesByTeam = {};
  
  // Find the most recent date in the data
  const mostRecentDate = new Date(Math.max(...boxscores.map(b => new Date(b.gameDate))));
  const cutoffDate = new Date(mostRecentDate);
  cutoffDate.setDate(cutoffDate.getDate() - 20); // Last 20 days from most recent data
  
  console.log(`   Using data from ${cutoffDate.toISOString().split('T')[0]} to ${mostRecentDate.toISOString().split('T')[0]}`);
  
  boxscores
    .filter(b => new Date(b.gameDate) >= cutoffDate && b.minutes > 0)
    .forEach(b => {
      const key = `${b.playerName}|${b.teamTricode}`;
      if (!playerMinutesByTeam[b.teamTricode]) {
        playerMinutesByTeam[b.teamTricode] = {};
      }
      if (!playerMinutesByTeam[b.teamTricode][b.playerName]) {
        playerMinutesByTeam[b.teamTricode][b.playerName] = [];
      }
      playerMinutesByTeam[b.teamTricode][b.playerName].push(b.minutes);
    });
  
  // Get top 8 minutes players per team
  const top8PlayersByTeam = {};
  for (const [team, players] of Object.entries(playerMinutesByTeam)) {
    const playerAvgs = Object.entries(players)
      .map(([name, mins]) => ({
        name,
        avgMinutes: mins.reduce((a, b) => a + b, 0) / mins.length,
        games: mins.length
      }))
      .filter(p => p.games >= 3) // At least 3 games
      .sort((a, b) => b.avgMinutes - a.avgMinutes)
      .slice(0, 8);
    
    top8PlayersByTeam[team] = new Set(playerAvgs.map(p => p.name));
  }
  
  console.log(`✅ Identified top 8 rotation players for ${Object.keys(top8PlayersByTeam).length} teams`);

  // Fetch upcoming games
  const gamesUrl = `${BASE_URL}/sports/${SPORT}/odds/?apiKey=${API_KEY}&regions=${REGIONS}&oddsFormat=${ODDS_FORMAT}`;
  const response = await fetch(gamesUrl);
  const allGames = await response.json();

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  // Filter to games within 18 hours
  const now = new Date();
  const eighteenHoursFromNow = new Date(now.getTime() + 18 * 60 * 60 * 1000);
  const todaysGames = allGames.filter(game => {
    const gameTime = new Date(game.commence_time);
    return gameTime <= eighteenHoursFromNow && gameTime > now;
  });

  console.log(`📅 ${todaysGames.length} games within next 18 hours`);

  // Fetch player props for each game
  const gamesWithProps = [];
  for (const game of todaysGames) {
    const gameProps = { ...game, bookmakers: [] };
    
    for (const market of ['player_rebounds', 'player_assists']) {
      const propsUrl = `${BASE_URL}/sports/${SPORT}/events/${game.id}/odds/?apiKey=${API_KEY}&regions=${REGIONS}&markets=${market}&bookmakers=${BOOKMAKERS}&oddsFormat=${ODDS_FORMAT}`;
      
      await sleep(1000);
      
      const propsResponse = await fetch(propsUrl);
      const propsData = await propsResponse.json();
      
      if (propsResponse.ok && propsData.bookmakers?.length > 0) {
        gameProps.bookmakers.push(...propsData.bookmakers);
      }
    }
    
    if (gameProps.bookmakers.length > 0) {
      gamesWithProps.push(gameProps);
    }
  }

  console.log(`✅ ${gamesWithProps.length} games with player props`);

  // Generate predictions
  const predictions = [];

  for (const game of gamesWithProps) {
    const homeTeam = game.home_team;
    const awayTeam = game.away_team;
    const gameDate = game.commence_time;

    for (const bookmaker of game.bookmakers) {
      for (const market of bookmaker.markets) {
        const propType = market.key;
        
        if (!['player_rebounds', 'player_assists'].includes(propType)) continue;

        for (const outcome of market.outcomes) {
          const playerName = outcome.description;
          const line = outcome.point;
          const overOdds = outcome.name === 'Over' ? outcome.price : null;
          const underOdds = outcome.name === 'Under' ? outcome.price : null;

          if (!overOdds && !underOdds) continue;

          const stats = calculatePlayerStats(boxscores, playerName, gameDate);
          if (!stats) continue;

          // FILTER: Only top 8 rotation players
          const playerTeam = stats.last_game?.teamTricode;
          if (!playerTeam || !top8PlayersByTeam[playerTeam]) continue;
          if (!top8PlayersByTeam[playerTeam].has(playerName)) continue;
          
          // FILTER: Stable minutes only (less than 25% coefficient of variation)
          if (stats.minuteCV > 25) continue;

          const isHome = game.home_team === stats.last_game?.team;
          const restDays = calculateRestDays(boxscores, playerName, gameDate);
          const prediction = generatePrediction(stats, propType, isHome, restDays);

          if (!prediction) continue;

          const { predicted, confidence } = prediction;

          if (confidence < CONFIDENCE_THRESHOLD) continue;

          const overProb = americanToProb(overOdds || 0);
          const underProb = americanToProb(underOdds || 0);
          const ourOverProb = predicted > line ? 0.65 : 0.35;
          const ourUnderProb = 1 - ourOverProb;

          const overEdge = overOdds ? ((ourOverProb - overProb) * 100) : null;
          const underEdge = underOdds ? ((ourUnderProb - underProb) * 100) : null;

          if (overEdge && overEdge >= EDGE_THRESHOLD) {
            const kelly = (ourOverProb * (overOdds / 100 + 1) - 1) / (overOdds / 100);
            if (kelly >= MIN_KELLY) {
              predictions.push({
                player: playerName,
                prop: propType.replace('player_', ''),
                line,
                pick: 'Over',
                predicted: predicted.toFixed(1),
                odds: overOdds,
                edge: overEdge.toFixed(1),
                confidence: (confidence * 100).toFixed(0),
                kelly: (kelly * 100).toFixed(1),
                units: Math.min(3, Math.max(0.5, kelly * 10)).toFixed(1),
                book: bookmaker.title,
                game: `${awayTeam} @ ${homeTeam}`,
                gameTime: new Date(gameDate).toLocaleString('en-US', { timeZone: 'America/New_York' })
              });
            }
          }

          if (underEdge && underEdge >= EDGE_THRESHOLD) {
            const kelly = (ourUnderProb * (Math.abs(underOdds) / 100 + 1) - 1) / (Math.abs(underOdds) / 100);
            if (kelly >= MIN_KELLY) {
              predictions.push({
                player: playerName,
                prop: propType.replace('player_', ''),
                line,
                pick: 'Under',
                predicted: predicted.toFixed(1),
                odds: underOdds,
                edge: underEdge.toFixed(1),
                confidence: (confidence * 100).toFixed(0),
                kelly: (kelly * 100).toFixed(1),
                units: Math.min(3, Math.max(0.5, kelly * 10)).toFixed(1),
                book: bookmaker.title,
                game: `${awayTeam} @ ${homeTeam}`,
                gameTime: new Date(gameDate).toLocaleString('en-US', { timeZone: 'America/New_York' })
              });
            }
          }
        }
      }
    }
  }

  // Deduplicate: Keep best line for each player/prop/pick combination
  console.log(`\n🔍 Deduplicating picks...`);
  const dedupMap = new Map();
  
  for (const pick of predictions) {
    const key = `${pick.player}|${pick.prop}|${pick.pick}`;
    
    if (!dedupMap.has(key)) {
      dedupMap.set(key, pick);
    } else {
      const existing = dedupMap.get(key);
      
      // For OVER: prefer higher line (harder to hit, more value)
      // For UNDER: prefer lower line (harder to hit, more value)
      let shouldReplace = false;
      
      if (pick.pick === 'Over') {
        shouldReplace = parseFloat(pick.line) > parseFloat(existing.line);
      } else if (pick.pick === 'Under') {
        shouldReplace = parseFloat(pick.line) < parseFloat(existing.line);
      }
      
      // If lines are equal, pick better edge
      if (Math.abs(parseFloat(pick.line) - parseFloat(existing.line)) < 0.1) {
        shouldReplace = parseFloat(pick.edge) > parseFloat(existing.edge);
      }
      
      if (shouldReplace) {
        dedupMap.set(key, pick);
      }
    }
  }
  
  const uniquePredictions = Array.from(dedupMap.values());
  console.log(`   Removed ${predictions.length - uniquePredictions.length} duplicate lines`);
  
  // Sort by edge
  uniquePredictions.sort((a, b) => parseFloat(b.edge) - parseFloat(a.edge));

  console.log(`\n🎯 Found ${uniquePredictions.length} profitable picks`);

  // Export to CSV
  const csv = [
    'Player,Prop,Line,Pick,Predicted,Odds,Edge%,Confidence%,Kelly%,Units,Book,Game,Time',
    ...uniquePredictions.map(p => 
      `${p.player},${p.prop},${p.line},${p.pick},${p.predicted},${p.odds},${p.edge},${p.confidence},${p.kelly},${p.units},${p.book},"${p.game}",${p.gameTime}`
    )
  ].join('\n');

  const downloadsPath = join(homedir(), 'Downloads', `nba-picks-${new Date().toISOString().split('T')[0]}.csv`);
  await writeFile(downloadsPath, csv);

  // Also export JSON for the live site
  const jsonOutput = {
    generated: new Date().toISOString(),
    games: todaysGames.length,
    picks: uniquePredictions,
    summary: {
      totalPicks: uniquePredictions.length,
      avgEdge: (uniquePredictions.reduce((sum, p) => sum + parseFloat(p.edge), 0) / uniquePredictions.length).toFixed(1),
      avgConfidence: (uniquePredictions.reduce((sum, p) => sum + parseFloat(p.confidence), 0) / uniquePredictions.length).toFixed(0),
      totalUnits: uniquePredictions.reduce((sum, p) => sum + parseFloat(p.units), 0).toFixed(1)
    }
  };

  const jsonPath = 'public/nba-picks-today.json';
  await writeFile(jsonPath, JSON.stringify(jsonOutput, null, 2));

  console.log(`\n✅ CSV exported to: ${downloadsPath}`);
  console.log(`✅ JSON exported to: ${jsonPath}`);
  console.log(`\n📊 Top 5 Picks:`);
  uniquePredictions.slice(0, 5).forEach((p, i) => {
    console.log(`${i+1}. ${p.player} ${p.prop} ${p.pick} ${p.line} (${p.edge}% edge, ${p.units}U)`);
  });
}

main().catch(console.error);
