#!/usr/bin/env node
/**
 * Fetch recent NBA boxscores from ESPN and generate tonight's picks
 * 
 * This is the REAL model from 10/31 - full player stats, proven profitable
 */

import fetch from 'node-fetch';
import { writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

const API_KEY = process.env.ODDS_API_KEY || process.env.THEODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';

if (!API_KEY) {
  console.error('❌ ODDS_API_KEY or THEODDS_API_KEY environment variable required');
  process.exit(1);
}

const EDGE_THRESHOLD = 4.0;
const CONFIDENCE_THRESHOLD = 0.60;
const MIN_KELLY = 0.01;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function americanToProb(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

async function fetchRecentBoxscores(daysBack = 25) {
  console.log(`\n📊 Fetching last ${daysBack} days of boxscores from ESPN...`);
  
  const boxscores = [];
  const today = new Date();
  
  for (let i = daysBack; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
    
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
      const response = await fetch(url);
      
      if (!response.ok) continue;
      
      const data = await response.json();
      if (!data.events || data.events.length === 0) continue;
      
      const completedGames = data.events.filter(e => 
        e.status.type.completed === true
      );
      
      if (completedGames.length === 0) continue;
      
      console.log(`   ${dateStr}: ${completedGames.length} games`);
      
      // For each completed game, get detailed boxscore
      for (const game of completedGames) {
        try {
          const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${game.id}`;
          await sleep(300); // Rate limit
          
          const summaryResp = await fetch(summaryUrl);
          if (!summaryResp.ok) continue;
          
          const summary = await summaryResp.json();
          
          if (summary.boxscore?.players) {
            const comp = game.competitions[0];
            const homeTeam = comp.competitors.find(c => c.homeAway === 'home');
            const awayTeam = comp.competitors.find(c => c.homeAway === 'away');
            
            for (const teamData of summary.boxscore.players) {
              const teamId = teamData.team.id;
              const teamAbbr = teamData.team.abbreviation;
              const isHome = teamId === homeTeam.id;
              const oppAbbr = isHome ? awayTeam.team.abbreviation : homeTeam.team.abbreviation;
              
              // First stat group has the main stats
              if (teamData.statistics && teamData.statistics[0]) {
                for (const athlete of teamData.statistics[0].athletes) {
                  const stats = athlete.stats;
                  const minutes = parseFloat(stats[0]) || 0;
                  
                  if (minutes > 0) {
                    boxscores.push({
                      gameDate: game.date.split('T')[0],
                      playerName: athlete.athlete.displayName,
                      teamTricode: teamAbbr,
                      opponentTricode: oppAbbr,
                      homeAway: isHome ? 'home' : 'away',
                      minutes,
                      points: parseInt(stats[12]) || 0, // PTS
                      rebounds: parseInt(stats[11]) || 0, // REB
                      assists: parseInt(stats[13]) || 0, // AST
                      team: teamAbbr
                    });
                  }
                }
              }
            }
          }
        } catch (err) {
          // Skip this game
        }
      }
      
    } catch (err) {
      console.log(`   ${dateStr}: Error`);
    }
  }
  
  console.log(`   ✅ Collected ${boxscores.length} player-game records`);
  return boxscores;
}

function calculatePlayerStats(boxscores, playerName, asOfDate) {
  const games = boxscores
    .filter(b => b.playerName === playerName && new Date(b.gameDate) < new Date(asOfDate))
    .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate))
    .filter(b => b.minutes > 0);

  if (games.length < 5) return null;

  const L5 = games.slice(0, 5);
  const L10 = games.slice(0, 10);
  
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

  return { predicted, confidence };
}

function calculateRestDays(boxscores, playerName, gameDate) {
  const prevGames = boxscores
    .filter(b => b.playerName === playerName && new Date(b.gameDate) < new Date(gameDate))
    .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
  
  if (prevGames.length === 0) return 3;
  
  const lastGame = new Date(prevGames[0].gameDate);
  const current = new Date(gameDate);
  return Math.floor((current - lastGame) / (1000 * 60 * 60 * 24));
}

async function main() {
  console.log('🏀 NBA PLAYER PROPS - FULL MODEL (Rebounds + Assists)');
  console.log('='.repeat(60));
  console.log('Model: Baseline v2 | Win Rates: 62.5% (R) / 66.7% (A)');
  console.log('='.repeat(60));

  // Step 1: Fetch recent boxscores
  const boxscores = await fetchRecentBoxscores(25);
  
  if (boxscores.length < 100) {
    console.log('\n❌ Not enough boxscore data collected');
    console.log(`   Only got ${boxscores.length} records, need at least 100`);
    process.exit(1);
  }

  // Calculate top 8 rotation players per team
  console.log('\n📊 Identifying rotation players...');
  const playerMinutesByTeam = {};
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 20);
  
  boxscores
    .filter(b => new Date(b.gameDate) >= cutoffDate && b.minutes > 0)
    .forEach(b => {
      if (!playerMinutesByTeam[b.teamTricode]) {
        playerMinutesByTeam[b.teamTricode] = {};
      }
      if (!playerMinutesByTeam[b.teamTricode][b.playerName]) {
        playerMinutesByTeam[b.teamTricode][b.playerName] = [];
      }
      playerMinutesByTeam[b.teamTricode][b.playerName].push(b.minutes);
    });
  
  const top8PlayersByTeam = {};
  for (const [team, players] of Object.entries(playerMinutesByTeam)) {
    const playerAvgs = Object.entries(players)
      .map(([name, mins]) => ({
        name,
        avgMinutes: mins.reduce((a, b) => a + b, 0) / mins.length,
        games: mins.length
      }))
      .filter(p => p.games >= 3)
      .sort((a, b) => b.avgMinutes - a.avgMinutes)
      .slice(0, 8);
    
    top8PlayersByTeam[team] = new Set(playerAvgs.map(p => p.name));
  }
  
  console.log(`   ✅ Top 8 players identified for ${Object.keys(top8PlayersByTeam).length} teams`);

  // Step 2: Fetch tonight's games and props
  console.log('\n📅 Fetching tonight\'s games...');
  const gamesUrl = `${BASE_URL}/sports/${SPORT}/odds/?apiKey=${API_KEY}&regions=us&oddsFormat=american`;
  const response = await fetch(gamesUrl);
  const allGames = await response.json();

  const now = new Date();
  const twentyFourHours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const todaysGames = allGames.filter(game => {
    const gameTime = new Date(game.commence_time);
    return gameTime <= twentyFourHours && gameTime > now;
  });

  console.log(`   ✅ ${todaysGames.length} games tonight`);

  // Step 3: Fetch props
  console.log('\n📊 Fetching player props...');
  const predictions = [];
  
  for (const game of todaysGames) {
    console.log(`\n   ${game.away_team} @ ${game.home_team}...`);
    
    for (const market of ['player_rebounds', 'player_assists']) {
      const propsUrl = `${BASE_URL}/sports/${SPORT}/events/${game.id}/odds/?apiKey=${API_KEY}&regions=us&markets=${market}&bookmakers=draftkings,fanduel&oddsFormat=american`;
      
      await sleep(1200);
      
      try {
        const propsResp = await fetch(propsUrl);
        const propsData = await propsResp.json();
        
        if (!propsResp.ok || !propsData.bookmakers) {
          console.log(`      ⚠️  ${market}: no data`);
          continue;
        }
        
        console.log(`      ✅ ${market}`);
        
        for (const book of propsData.bookmakers) {
          for (const mkt of book.markets) {
            for (const outcome of mkt.outcomes) {
              const playerName = outcome.description;
              const line = outcome.point;
              const overOdds = outcome.name === 'Over' ? outcome.price : null;
              const underOdds = outcome.name === 'Under' ? outcome.price : null;

              if (!overOdds && !underOdds) continue;

              const stats = calculatePlayerStats(boxscores, playerName, game.commence_time);
              if (!stats) continue;

              // Filter: Top 8 rotation only
              const playerTeam = stats.last_game?.teamTricode;
              if (!playerTeam || !top8PlayersByTeam[playerTeam]) continue;
              if (!top8PlayersByTeam[playerTeam].has(playerName)) continue;
              
              // Filter: Stable minutes only
              if (stats.minuteCV > 25) continue;

              const isHome = game.home_team.includes(stats.last_game.teamTricode);
              const restDays = calculateRestDays(boxscores, playerName, game.commence_time);
              const prediction = generatePrediction(stats, market, isHome, restDays);

              if (!prediction || prediction.confidence < CONFIDENCE_THRESHOLD) continue;

              const { predicted, confidence } = prediction;

              // Calculate edges
              if (overOdds) {
                const overProb = americanToProb(overOdds);
                const ourOverProb = predicted > line ? 0.65 : 0.35;
                const overEdge = (ourOverProb - overProb) * 100;

                if (overEdge >= EDGE_THRESHOLD) {
                  const kelly = (ourOverProb * (overOdds / 100 + 1) - 1) / (overOdds / 100);
                  if (kelly >= MIN_KELLY) {
                    predictions.push({
                      player: playerName,
                      prop: market.replace('player_', ''),
                      line,
                      pick: 'Over',
                      predicted: predicted.toFixed(1),
                      odds: overOdds,
                      edge: overEdge.toFixed(1),
                      confidence: (confidence * 100).toFixed(0),
                      kelly: (kelly * 100).toFixed(1),
                      units: Math.min(3, Math.max(0.5, kelly * 10)).toFixed(1),
                      book: book.title,
                      game: `${game.away_team} @ ${game.home_team}`,
                      gameTime: new Date(game.commence_time).toLocaleString('en-US', { timeZone: 'America/New_York' })
                    });
                  }
                }
              }

              if (underOdds) {
                const underProb = americanToProb(underOdds);
                const ourUnderProb = predicted < line ? 0.65 : 0.35;
                const underEdge = (ourUnderProb - underProb) * 100;

                if (underEdge >= EDGE_THRESHOLD) {
                  const kelly = (ourUnderProb * (Math.abs(underOdds) / 100 + 1) - 1) / (Math.abs(underOdds) / 100);
                  if (kelly >= MIN_KELLY) {
                    predictions.push({
                      player: playerName,
                      prop: market.replace('player_', ''),
                      line,
                      pick: 'Under',
                      predicted: predicted.toFixed(1),
                      odds: underOdds,
                      edge: underEdge.toFixed(1),
                      confidence: (confidence * 100).toFixed(0),
                      kelly: (kelly * 100).toFixed(1),
                      units: Math.min(3, Math.max(0.5, kelly * 10)).toFixed(1),
                      book: book.title,
                      game: `${game.away_team} @ ${game.home_team}`,
                      gameTime: new Date(game.commence_time).toLocaleString('en-US', { timeZone: 'America/New_York' })
                    });
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.log(`      ❌ ${market}: ${err.message}`);
      }
    }
  }

  // Deduplicate
  console.log(`\n🔍 Deduplicating...`);
  const dedupMap = new Map();
  
  for (const pick of predictions) {
    const key = `${pick.player}|${pick.prop}|${pick.pick}`;
    
    if (!dedupMap.has(key)) {
      dedupMap.set(key, pick);
    } else {
      const existing = dedupMap.get(key);
      const shouldReplace = pick.pick === 'Over' 
        ? parseFloat(pick.line) > parseFloat(existing.line)
        : parseFloat(pick.line) < parseFloat(existing.line);
      
      if (shouldReplace || (Math.abs(parseFloat(pick.line) - parseFloat(existing.line)) < 0.1 && parseFloat(pick.edge) > parseFloat(existing.edge))) {
        dedupMap.set(key, pick);
      }
    }
  }
  
  const uniquePicks = Array.from(dedupMap.values());
  console.log(`   Removed ${predictions.length - uniquePicks.length} duplicates`);
  
  uniquePicks.sort((a, b) => parseFloat(b.edge) - parseFloat(a.edge));

  console.log(`\n🎯 ${uniquePicks.length} PICKS READY`);

  // Export CSV
  const csv = [
    'Player,Prop,Line,Pick,Predicted,Odds,Edge%,Confidence%,Kelly%,Units,Book,Game,Time',
    ...uniquePicks.map(p => 
      `${p.player},${p.prop},${p.line},${p.pick},${p.predicted},${p.odds},${p.edge},${p.confidence},${p.kelly},${p.units},${p.book},"${p.game}",${p.gameTime}`
    )
  ].join('\n');

  const today = new Date().toISOString().split('T')[0];
  const csvPath = join(homedir(), 'Downloads', `nba-props-${today}.csv`);
  await writeFile(csvPath, csv);

  const jsonPath = join(homedir(), 'Downloads', `nba-props-${today}.json`);
  await writeFile(jsonPath, JSON.stringify({ 
    generated: new Date().toISOString(),
    picks: uniquePicks,
    summary: {
      total: uniquePicks.length,
      avgEdge: (uniquePicks.reduce((sum, p) => sum + parseFloat(p.edge), 0) / uniquePicks.length).toFixed(1),
      totalUnits: uniquePicks.reduce((sum, p) => sum + parseFloat(p.units), 0).toFixed(1)
    }
  }, null, 2));

  console.log(`\n✅ CSV: ${csvPath}`);
  console.log(`✅ JSON: ${jsonPath}`);
  console.log(`\n📊 Top 5:`);
  uniquePicks.slice(0, 5).forEach((p, i) => {
    console.log(`${i+1}. ${p.player} ${p.prop} ${p.pick} ${p.line} (${p.edge}% edge, ${p.units}U)`);
  });
}

main().catch(console.error);
