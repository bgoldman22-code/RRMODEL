#!/usr/bin/env node

/**
 * Collect historical NBA totals odds from The Odds API
 * Fills gaps for 2023-24, 2024-25, and 2025-26 seasons
 */

import fs from 'fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const API_KEY = process.env.ODDS_API_KEY || 'SET_ODDS_API_KEY_ENV_VAR';
const ODDS_DIR = path.join(ROOT, 'data/nba/historical_odds/game_totals');

if (!existsSync(ODDS_DIR)) mkdirSync(ODDS_DIR, { recursive: true });

// ─── Determine which dates we already have ───

async function getExistingCoverage() {
  const covered = new Set();
  
  // From JSON odds files
  const files = (await fs.readdir(ODDS_DIR)).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(ODDS_DIR, file), 'utf8'));
      const games = data.games || data.data || [];
      for (const g of games) {
        const ct = g.commence_time || g.date || data.date || '';
        if (ct) covered.add(ct.split('T')[0]);
      }
    } catch {}
  }
  
  // From backtest CSV
  try {
    const csv = await fs.readFile(path.join(ROOT, 'data/nba/backtests/nba_totals_backtest_dataset.csv'), 'utf8');
    for (const line of csv.split('\n').slice(1)) {
      const date = line.split(',')[2]; // date column
      if (date && date.match(/^\d{4}-\d{2}-\d{2}$/)) covered.add(date);
    }
  } catch {}
  
  return covered;
}

// ─── Get all dates that have games (2023+) ───

async function getGameDates() {
  const gameDates = {};
  
  for (const gf of ['games_2023_24.json', 'games_2024_25.json', 'games_2025_26_extended.json']) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(ROOT, 'data/nba/games', gf), 'utf8'));
      for (const g of data) {
        const d = g.date;
        if (d) gameDates[d] = (gameDates[d] || 0) + 1;
      }
    } catch {}
  }
  
  return gameDates;
}

// ─── Fetch odds for a single date ───

async function fetchOddsForDate(date) {
  const url = `https://api.the-odds-api.com/v4/historical/sports/basketball_nba/odds/?apiKey=${API_KEY}&regions=us&markets=totals&oddsFormat=american&bookmakers=fanduel,draftkings,betmgm&date=${date}T00:00:00Z`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
  }
  
  const result = await response.json();
  
  // Check remaining quota
  const remaining = response.headers.get('x-requests-remaining');
  const used = response.headers.get('x-requests-used');
  
  return {
    data: result.data || [],
    timestamp: result.timestamp || date,
    remaining: remaining ? parseInt(remaining) : null,
    used: used ? parseInt(used) : null,
  };
}

// ─── Save odds to file ───

function saveOdds(date, games) {
  const filename = `game_totals_${date.replace(/-/g, '')}_v1.json`;
  const filepath = path.join(ODDS_DIR, filename);
  
  // Don't overwrite existing files
  if (existsSync(filepath)) return false;
  
  const output = {
    date,
    sport: 'basketball_nba',
    market: 'totals',
    collectedAt: new Date().toISOString(),
    games: games.map(g => ({
      id: g.id,
      sport_key: g.sport_key,
      commence_time: g.commence_time,
      home_team: g.home_team,
      away_team: g.away_team,
      bookmakers: g.bookmakers,
    })),
  };
  
  writeFileSync(filepath, JSON.stringify(output, null, 2));
  return true;
}

// ─── Main ───

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  HISTORICAL ODDS COLLECTOR - NBA TOTALS             ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  
  const covered = await getExistingCoverage();
  const gameDates = await getGameDates();
  
  // Dates we need (2023+ only)
  const needed = Object.keys(gameDates)
    .filter(d => d >= '2023-10-01' && !covered.has(d))
    .sort();
  
  console.log(`  Already have odds for: ${covered.size} dates`);
  console.log(`  Need to collect: ${needed.length} dates`);
  console.log(`  Estimated games: ~${needed.reduce((s, d) => s + (gameDates[d] || 0), 0)}`);
  
  if (needed.length === 0) {
    console.log('\n  ✅ All odds already collected!');
    return;
  }
  
  console.log(`\n  Collecting ${needed.length} dates...\n`);
  
  let collected = 0;
  let totalGames = 0;
  let errors = 0;
  let remaining = null;
  
  for (let i = 0; i < needed.length; i++) {
    const date = needed[i];
    
    try {
      const result = await fetchOddsForDate(date);
      remaining = result.remaining;
      
      if (result.data.length > 0) {
        saveOdds(date, result.data);
        collected++;
        totalGames += result.data.length;
      }
      
      // Progress
      const pct = ((i + 1) / needed.length * 100).toFixed(0);
      process.stdout.write(`\r  [${pct}%] ${i + 1}/${needed.length} — ${date} — ${result.data.length} games — Total: ${totalGames} — Remaining API: ${remaining ?? '?'}    `);
      
      // Check if we're running low on API quota
      if (remaining !== null && remaining < 10) {
        console.log(`\n\n  ⚠️  API quota low (${remaining} remaining). Stopping.`);
        break;
      }
      
      // Rate limit: ~2 requests per second to be safe
      await new Promise(r => setTimeout(r, 500));
      
    } catch (err) {
      errors++;
      console.log(`\n  ❌ Error on ${date}: ${err.message}`);
      
      if (err.message.includes('429') || err.message.includes('rate')) {
        console.log('  Waiting 5s for rate limit...');
        await new Promise(r => setTimeout(r, 5000));
      } else if (err.message.includes('401') || err.message.includes('403')) {
        console.log('  ❌ API key issue. Stopping.');
        break;
      }
      
      if (errors > 10) {
        console.log('  Too many errors. Stopping.');
        break;
      }
    }
  }
  
  console.log(`\n\n  ════════════════════════════════════`);
  console.log(`  ✅ Collected: ${collected} dates, ${totalGames} games`);
  console.log(`  ❌ Errors: ${errors}`);
  console.log(`  📊 API remaining: ${remaining ?? 'unknown'}`);
  console.log(`  ════════════════════════════════════\n`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
