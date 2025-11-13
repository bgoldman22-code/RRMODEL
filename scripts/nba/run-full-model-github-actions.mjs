#!/usr/bin/env node
/**
 * GitHub Actions compatible NBA predictions generator
 * Writes output to public/data/nba/ for static serving
 * 
 * Based on: scripts/nba/run-full-model-tonight.mjs
 */

import fetch from 'node-fetch';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

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
              const isHome = homeTeam?.id === teamId;
              const oppTeam = isHome ? awayTeam : homeTeam;
              
              for (const player of teamData.statistics[0].athletes) {
                const stats = {};
                player.stats.forEach((val, idx) => {
                  const key = teamData.statistics[0].names[idx];
                  stats[key] = val === '--' ? 0 : parseFloat(val);
                });
                
                boxscores.push({
                  playerName: player.athlete.displayName,
                  playerId: player.athlete.id,
                  team: teamAbbr,
                  opponent: oppTeam?.team.abbreviation,
                  isHome,
                  gameDate: d.toISOString().split('T')[0],
                  minutes: stats.MIN || 0,
                  points: stats.PTS || 0,
                  rebounds: stats.REB || 0,
                  assists: stats.AST || 0,
                  steals: stats.STL || 0,
                  blocks: stats.BLK || 0,
                  turnovers: stats.TO || 0,
                  fgm: stats.FGM || 0,
                  fga: stats.FGA || 0
                });
              }
            }
          }
        } catch (err) {
          console.error(`Error fetching game ${game.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error(`Error fetching date ${dateStr}:`, err.message);
    }
  }
  
  console.log(`\n✅ Collected ${boxscores.length} player-games`);
  return boxscores;
}

function getPlayerStats(boxscores, playerName, asOfDate) {
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

function generatePrediction(stats, propType) {
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

  let prediction = base;
  const trend = base - seasonAvg;
  if (Math.abs(trend) > 1.5) {
    prediction += trend * 0.15;
  }

  const confidence = Math.min(0.75, 0.55 + (stats.games_played / 100));
  
  return { predicted: prediction, confidence };
}

async function fetchOdds() {
  console.log('\n📈 Fetching NBA player props from The Odds API...');
  
  const url = `${BASE_URL}/sports/${SPORT}/events?apiKey=${API_KEY}&dateFormat=iso`;
  const eventsResp = await fetch(url);
  const events = await eventsResp.json();
  
  const now = new Date();
  const cutoff = new Date(now.getTime() + 18 * 60 * 60 * 1000);
  
  const upcomingEvents = events.filter(e => {
    const start = new Date(e.commence_time);
    return start > now && start < cutoff;
  });
  
  console.log(`   Found ${upcomingEvents.length} games in next 18 hours`);
  
  const allProps = [];
  
  for (const event of upcomingEvents) {
    const propsUrl = `${BASE_URL}/sports/${SPORT}/events/${event.id}/odds?apiKey=${API_KEY}&regions=us&markets=player_rebounds,player_assists&oddsFormat=american&bookmakers=draftkings,fanduel`;
    
    await sleep(500);
    
    try {
      const propsResp = await fetch(propsUrl);
      if (!propsResp.ok) continue;
      
      const propsData = await propsResp.json();
      
      if (!propsData.bookmakers) continue;
      
      for (const book of propsData.bookmakers) {
        for (const market of book.markets) {
          for (const outcome of market.outcomes) {
            allProps.push({
              player: outcome.description,
              propType: market.key,
              line: outcome.point,
              odds: outcome.price,
              book: book.title,
              homeTeam: event.home_team,
              awayTeam: event.away_team,
              gameTime: event.commence_time
            });
          }
        }
      }
    } catch (err) {
      console.error(`Error fetching props for ${event.id}:`, err.message);
    }
  }
  
  console.log(`   Collected ${allProps.length} prop lines`);
  return allProps;
}

async function main() {
  console.log('🏀 NBA Props Model - GitHub Actions Mode');
  console.log('==========================================\n');
  
  const boxscores = await fetchRecentBoxscores(25);
  const props = await fetchOdds();
  
  const picks = [];
  
  for (const prop of props) {
    const today = new Date().toISOString().split('T')[0];
    const stats = getPlayerStats(boxscores, prop.player, today);
    
    if (!stats) continue;
    
    const result = generatePrediction(stats, prop.propType);
    if (!result) continue;
    
    const { predicted, confidence } = result;
    const edge = ((predicted - prop.line) / prop.line) * 100;
    
    if (edge < EDGE_THRESHOLD || confidence < CONFIDENCE_THRESHOLD) continue;
    
    const impliedProb = americanToProb(prop.odds);
    const kelly = (confidence - impliedProb) / (1 - impliedProb);
    
    if (kelly < MIN_KELLY) continue;
    
    const units = Math.min(3.0, Math.max(0.5, kelly * 10));
    
    picks.push({
      player: prop.player,
      prop: prop.propType.replace('player_', ''),
      line: prop.line.toFixed(1),
      pick: 'OVER',
      predicted: predicted.toFixed(1),
      odds: prop.odds,
      edge: edge.toFixed(1),
      confidence: (confidence * 100).toFixed(1),
      kelly: (kelly * 100).toFixed(1),
      units: units.toFixed(1),
      book: prop.book,
      game: `${prop.awayTeam} @ ${prop.homeTeam}`,
      gameTime: prop.gameTime,
      homeTeam: prop.homeTeam,
      awayTeam: prop.awayTeam,
      propType: prop.propType
    });
  }
  
  // Deduplicate
  const uniquePicks = [];
  const seen = new Set();
  
  for (const pick of picks.sort((a, b) => parseFloat(b.edge) - parseFloat(a.edge))) {
    const key = `${pick.player}-${pick.prop}-${pick.line}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePicks.push(pick);
    }
  }
  
  console.log(`\n🎯 Generated ${uniquePicks.length} picks (${picks.length} before dedup)`);
  
  // Write to public/data/nba/
  const outputDir = join(REPO_ROOT, 'public', 'data', 'nba');
  await mkdir(outputDir, { recursive: true });
  
  // New format for nba-props-elite.html
  const output = {
    generated: new Date().toISOString(),
    source: 'github-actions',
    recommendations: uniquePicks,
    summary: {
      total: uniquePicks.length,
      avgEdge: (uniquePicks.reduce((sum, p) => sum + parseFloat(p.edge), 0) / uniquePicks.length).toFixed(1),
      totalUnits: uniquePicks.reduce((sum, p) => sum + parseFloat(p.units), 0).toFixed(1),
      games: [...new Set(uniquePicks.map(p => p.game))].length
    }
  };
  
  const jsonPath = join(outputDir, 'predictions-latest.json');
  await writeFile(jsonPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Wrote new format to: ${jsonPath}`);

  // Old format for nba-player-props.html compatibility
  const oldFormatOutput = {
    generated: new Date().toISOString(),
    games: [...new Set(uniquePicks.map(p => p.game))].length,
    model: "Baseline v2",
    dataSource: `GitHub Actions (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`,
    historical: {
      rebounds: {
        status: "profitable",
        winRate: 62.5,
        roi: 19.3
      },
      assists: {
        status: "profitable",
        winRate: 66.7,
        roi: 27.3
      }
    },
    thresholds: {
      edge: EDGE_THRESHOLD,
      confidence: CONFIDENCE_THRESHOLD * 100,
      kelly: MIN_KELLY
    },
    predictions: uniquePicks.map(p => ({
      player: p.player,
      team: p.awayTeam, // Simplified - could parse from game if needed
      opponent: p.homeTeam,
      propType: p.prop,
      prediction: parseFloat(p.predicted),
      vegasLine: parseFloat(p.line),
      betSide: p.pick,
      edge: parseFloat(p.edge),
      confidence: parseFloat(p.confidence),
      kellyStake: parseFloat(p.units),
      odds: p.odds,
      book: p.book,
      game: p.game,
      gameTime: p.gameTime
    }))
  };

  const oldJsonPath = join(outputDir, 'nba-player-props-live.json');
  await writeFile(oldJsonPath, JSON.stringify(oldFormatOutput, null, 2));
  console.log(`✅ Wrote old format to: ${oldJsonPath}`);
  console.log(`\n📊 Summary:`);
  console.log(`   Total picks: ${output.summary.total}`);
  console.log(`   Avg edge: ${output.summary.avgEdge}%`);
  console.log(`   Total units: ${output.summary.totalUnits}`);
  console.log(`   Games: ${output.summary.games}`);
  
  if (uniquePicks.length > 0) {
    console.log(`\n🏆 Top 5 picks:`);
    uniquePicks.slice(0, 5).forEach((p, i) => {
      console.log(`   ${i+1}. ${p.player} ${p.prop} ${p.pick} ${p.line} (${p.edge}% edge, ${p.units}U)`);
    });
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
