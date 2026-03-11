#!/usr/bin/env node

/**
 * Collect missing NBA games (ESPN) + odds (The Odds API) for Dec 2025 - Mar 9 2026
 * Then run the V3 dual strategy analysis on that period
 */

import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const ODDS_API_KEY = process.env.ODDS_API_KEY || 'SET_ODDS_API_KEY_ENV_VAR';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function generateDateRange(start, end) {
  const dates = [];
  const d = new Date(start + 'T12:00:00Z');
  const endDate = new Date(end + 'T12:00:00Z');
  while (d <= endDate) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

const delay = ms => new Promise(r => setTimeout(r, ms));

function parseTeamStats(statsArray) {
  const stats = {};
  for (const stat of statsArray) {
    const name = stat.name;
    const val = parseFloat(stat.displayValue) || 0;
    
    // Handle both combined format "Made-Attempted" and separate fields
    if (name === 'fieldGoalsMade-fieldGoalsAttempted') {
      const [made, attempted] = stat.displayValue.split('-').map(Number);
      stats.fgm = made; stats.fga = attempted;
    } else if (name === 'threePointFieldGoalsMade-threePointFieldGoalsAttempted') {
      const [made, attempted] = stat.displayValue.split('-').map(Number);
      stats.fg3m = made; stats.fg3a = attempted;
    } else if (name === 'freeThrowsMade-freeThrowsAttempted') {
      const [made, attempted] = stat.displayValue.split('-').map(Number);
      stats.ftm = made; stats.fta = attempted;
    }
    // Separate field format (current ESPN scoreboard API)
    else if (name === 'fieldGoalsMade') stats.fgm = val;
    else if (name === 'fieldGoalsAttempted') stats.fga = val;
    else if (name === 'fieldGoalPct') stats.fgPct = val / 100;
    else if (name === 'threePointFieldGoalsMade') stats.fg3m = val;
    else if (name === 'threePointFieldGoalsAttempted') stats.fg3a = val;
    else if (name === 'threePointPct' || name === 'threePointFieldGoalPct') stats.fg3Pct = val / 100;
    else if (name === 'freeThrowsMade') stats.ftm = val;
    else if (name === 'freeThrowsAttempted') stats.fta = val;
    else if (name === 'freeThrowPct') stats.ftPct = val / 100;
    else if (name === 'rebounds' || name === 'totalRebounds') stats.rebounds = val;
    else if (name === 'offensiveRebounds') stats.offRebounds = val;
    else if (name === 'defensiveRebounds') stats.defRebounds = val;
    else if (name === 'assists') stats.assists = val;
    else if (name === 'steals') stats.steals = val;
    else if (name === 'blocks') stats.blocks = val;
    else if (name === 'turnovers' || name === 'totalTurnovers') stats.turnovers = val;
    else if (name === 'fouls' || name === 'technicalFouls') stats.fouls = val;
    else if (name === 'points') stats.points = val;
  }
  return stats;
}

// ══════════════════════════════════════════════════════════════
// PHASE 1: COLLECT MISSING GAME DATA (ESPN)
// ══════════════════════════════════════════════════════════════

async function collectMissingGames() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 1: COLLECT MISSING GAME DATA (ESPN)');
  console.log('═══════════════════════════════════════════════════════\n');

  // Load existing extended games
  const extPath = path.join(ROOT, 'data/nba/games/games_2025_26_extended.json');
  let existing = [];
  try {
    existing = JSON.parse(await fs.readFile(extPath, 'utf8'));
  } catch {}

  // Find dates that DON'T have valid stats yet
  const datesWithStats = new Set();
  const datesWithoutStats = new Set();
  for (const g of existing) {
    const d = (g.date || '').split('T')[0];
    if (g.homeStats?.fga > 0) {
      datesWithStats.add(d);
    } else {
      datesWithoutStats.add(d);
    }
  }
  
  // Dates that have games but NO stats
  const needStats = [...datesWithoutStats].filter(d => !datesWithStats.has(d) && d >= '2025-11-24' && d <= '2026-03-09');
  needStats.sort();
  
  console.log(`  Dates with stats: ${datesWithStats.size}`);
  console.log(`  Dates needing stats: ${needStats.length}`);
  if (needStats.length > 0) {
    console.log(`  Range: ${needStats[0]} to ${needStats[needStats.length - 1]}`);
  }

  // Also check for dates with no games at all
  const allKnownDates = new Set([...datesWithStats, ...datesWithoutStats]);
  const allDatesInRange = generateDateRange('2025-11-24', '2026-03-09');
  const missingDates = allDatesInRange.filter(d => !allKnownDates.has(d));
  const dates = [...needStats, ...missingDates].sort();
  console.log(`  Dates with no data at all: ${missingDates.length}`);
  console.log(`  Total dates to fetch: ${dates.length}\n`);

  const newGames = [];
  let errors = 0;
  
  // First pass: get game IDs from scoreboard
  const gameIds = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dateStr = date.replace(/-/g, '');
    const url = `${ESPN_BASE}/scoreboard?dates=${dateStr}`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      
      for (const event of (data.events || [])) {
        const competition = event.competitions[0];
        if (!competition?.status?.type?.completed) continue;
        gameIds.push({
          gameId: event.id,
          date: event.date.split('T')[0],
          homeScore: parseInt(event.competitions[0].competitors.find(c => c.homeAway === 'home')?.score || 0),
          awayScore: parseInt(event.competitions[0].competitors.find(c => c.homeAway === 'away')?.score || 0),
        });
      }
    } catch (err) {
      errors++;
    }

    if ((i + 1) % 10 === 0 || i === dates.length - 1) {
      process.stdout.write(`\r  Scanning scoreboard: ${i + 1}/${dates.length} days — ${gameIds.length} completed games`);
    }
    await delay(100);
  }
  console.log(`\n  Found ${gameIds.length} completed games, fetching box scores...`);

  // Second pass: fetch detailed box scores from summary endpoint
  for (let i = 0; i < gameIds.length; i++) {
    const gInfo = gameIds[i];
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gInfo.gameId}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      const boxTeams = data.boxscore?.teams || [];
      if (boxTeams.length < 2) { errors++; continue; }

      // ESPN boxscore teams[0] = away, teams[1] = home (usually)
      // Verify by checking the header/matchup
      const header = data.header?.competitions?.[0];
      let homeIdx = 1, awayIdx = 0;
      if (header?.competitors) {
        for (let j = 0; j < header.competitors.length; j++) {
          if (header.competitors[j].homeAway === 'home') homeIdx = j;
          if (header.competitors[j].homeAway === 'away') awayIdx = j;
        }
      }

      const homeTeamInfo = header?.competitors?.[homeIdx] || {};
      const awayTeamInfo = header?.competitors?.[awayIdx] || {};

      const parseBoxStats = (teamBox) => {
        const stats = {};
        for (const s of (teamBox.statistics || [])) {
          const name = s.name;
          const val = s.displayValue;
          if (name === 'fieldGoalsMade-fieldGoalsAttempted') {
            const [m, a] = val.split('-').map(Number);
            stats.fgm = m; stats.fga = a;
          } else if (name === 'threePointFieldGoalsMade-threePointFieldGoalsAttempted') {
            const [m, a] = val.split('-').map(Number);
            stats.fg3m = m; stats.fg3a = a;
          } else if (name === 'freeThrowsMade-freeThrowsAttempted') {
            const [m, a] = val.split('-').map(Number);
            stats.ftm = m; stats.fta = a;
          } else if (name === 'totalRebounds') stats.rebounds = parseFloat(val);
          else if (name === 'offensiveRebounds') stats.offRebounds = parseFloat(val);
          else if (name === 'defensiveRebounds') stats.defRebounds = parseFloat(val);
          else if (name === 'assists') stats.assists = parseFloat(val);
          else if (name === 'steals') stats.steals = parseFloat(val);
          else if (name === 'blocks') stats.blocks = parseFloat(val);
          else if (name === 'turnovers') stats.turnovers = parseFloat(val);
          else if (name === 'fouls') stats.fouls = parseFloat(val);
        }
        return stats;
      };

      const homeStats = parseBoxStats(boxTeams[homeIdx]);
      const awayStats = parseBoxStats(boxTeams[awayIdx]);

      if (!homeStats.fga || !awayStats.fga) { errors++; continue; }

      newGames.push({
        gameId: gInfo.gameId,
        date: gInfo.date,
        season: '2025-26',
        homeTeamId: parseInt(homeTeamInfo.id || homeTeamInfo.team?.id || 0),
        homeTeam: homeTeamInfo.team?.abbreviation || '',
        homeTeamName: homeTeamInfo.team?.displayName || '',
        awayTeamId: parseInt(awayTeamInfo.id || awayTeamInfo.team?.id || 0),
        awayTeam: awayTeamInfo.team?.abbreviation || '',
        awayTeamName: awayTeamInfo.team?.displayName || '',
        homeScore: parseInt(homeTeamInfo.score || gInfo.homeScore),
        awayScore: parseInt(awayTeamInfo.score || gInfo.awayScore),
        homeStats,
        awayStats,
        venue: data.gameInfo?.venue?.fullName || 'Unknown',
        attendance: data.gameInfo?.attendance || null
      });
    } catch (err) {
      errors++;
    }

    if ((i + 1) % 20 === 0 || i === gameIds.length - 1) {
      process.stdout.write(`\r  Box scores: ${i + 1}/${gameIds.length} — ${newGames.length} with stats (${errors} errors)`);
    }
    await delay(120);
  }

  console.log(`\n\n  ✅ Collected ${newGames.length} new games from ESPN`);

  // Filter to only games with actual stats
  const withStats = newGames.filter(g => g.homeStats?.fga > 0);
  console.log(`  Games with box score stats: ${withStats.length}`);

  // Merge with existing — prefer entries WITH stats over entries without
  const byId = new Map();
  for (const g of existing) {
    const key = g.gameId || `${g.date}_${g.homeTeam}`;
    byId.set(key, g);
  }
  // New games with stats override old entries
  for (const g of withStats) {
    const key = g.gameId || `${g.date}_${g.homeTeam}`;
    byId.set(key, g); // always override since new has stats
  }
  
  const deduped = [...byId.values()];
  deduped.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  await fs.writeFile(extPath, JSON.stringify(deduped, null, 2));
  console.log(`  Saved ${deduped.length} total games to games_2025_26_extended.json`);

  return withStats;
}

// ══════════════════════════════════════════════════════════════
// PHASE 2: COLLECT MISSING HISTORICAL ODDS
// ══════════════════════════════════════════════════════════════

async function collectMissingOdds() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 2: COLLECT MISSING HISTORICAL ODDS');
  console.log('═══════════════════════════════════════════════════════\n');

  const oddsDir = path.join(ROOT, 'data/nba/historical_odds/game_totals');
  if (!existsSync(oddsDir)) mkdirSync(oddsDir, { recursive: true });

  // Check which dates already have odds
  const existingFiles = (await fs.readdir(oddsDir)).filter(f => f.endsWith('.json'));
  const existingDates = new Set();
  for (const f of existingFiles) {
    // filenames like: 2025-12-01.json or nba_totals_2025-12-01.json
    const match = f.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) existingDates.add(match[1]);
  }

  // Generate dates we need: Dec 1, 2025 → Mar 9, 2026
  const dates = generateDateRange('2025-12-01', '2026-03-09');
  const needed = dates.filter(d => !existingDates.has(d));
  
  console.log(`  Existing odds dates: ${existingDates.size}`);
  console.log(`  Need odds for: ${needed.length} dates\n`);

  if (needed.length === 0) {
    console.log('  All odds already collected!\n');
    return;
  }

  let collected = 0;
  let totalGames = 0;
  let errors = 0;

  for (let i = 0; i < needed.length; i++) {
    const date = needed[i];
    const url = `https://api.the-odds-api.com/v4/historical/sports/basketball_nba/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=totals&oddsFormat=american&date=${date}T18:00:00Z`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        errors++;
        continue;
      }
      const json = await resp.json();
      const games = json.data || [];

      if (games.length > 0) {
        const outFile = path.join(oddsDir, `${date}.json`);
        const saveData = {
          date,
          sport: 'basketball_nba',
          games: games.map(g => ({
            id: g.id,
            home_team: g.home_team,
            away_team: g.away_team,
            commence_time: g.commence_time,
            bookmakers: g.bookmakers
          }))
        };
        writeFileSync(outFile, JSON.stringify(saveData, null, 2));
        collected++;
        totalGames += games.length;
      }
    } catch (err) {
      errors++;
    }

    if ((i + 1) % 5 === 0 || i === needed.length - 1) {
      process.stdout.write(`\r  Progress: ${i + 1}/${needed.length} dates — ${collected} collected, ${totalGames} games (${errors} errors)`);
    }
    await delay(250);
  }

  console.log(`\n\n  ✅ Collected ${collected} new dates, ${totalGames} games`);
  if (errors > 0) console.log(`  ⚠️  ${errors} errors`);
}

// ══════════════════════════════════════════════════════════════
// PHASE 3: RUN V3 DUAL STRATEGY ON DEC 2025 - MAR 2026
// ══════════════════════════════════════════════════════════════

async function runDualStrategyAnalysis() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 3: V3 DUAL STRATEGY — DEC 2025 - MAR 9, 2026');
  console.log('═══════════════════════════════════════════════════════\n');

  // Load model
  const model = JSON.parse(await fs.readFile(path.join(ROOT, 'data/nba/models/totals_model_v3_multiwindow.json'), 'utf8'));

  // Load ALL game data
  const allGames = [];
  for (const gf of ['games_2022_23.json', 'games_2023_24.json', 'games_2024_25.json', 'games_2025_26_extended.json']) {
    try {
      const games = JSON.parse(await fs.readFile(path.join(ROOT, `data/nba/games/${gf}`), 'utf8'));
      const valid = games.filter(g => g.homeStats?.fga > 0 && g.awayStats?.fga > 0);
      for (const g of valid) {
        if (!g.homeScore && g.homeStats?.points) g.homeScore = g.homeStats.points;
        if (!g.awayScore && g.awayStats?.points) g.awayScore = g.awayStats.points;
        if (!g.homeScore) {
          const s = g.homeStats;
          g.homeScore = (s.fgm - (s.fg3m || 0)) * 2 + (s.fg3m || 0) * 3 + (s.ftm || 0);
        }
        if (!g.awayScore) {
          const s = g.awayStats;
          g.awayScore = (s.fgm - (s.fg3m || 0)) * 2 + (s.fg3m || 0) * 3 + (s.ftm || 0);
        }
      }
      allGames.push(...valid);
    } catch {}
  }
  allGames.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  console.log(`  Total games loaded: ${allGames.length}`);

  // Load ALL odds
  const allOdds = {};
  const oddsDir = path.join(ROOT, 'data/nba/historical_odds/game_totals');
  const oddsFiles = (await fs.readdir(oddsDir)).filter(f => f.endsWith('.json'));
  for (const f of oddsFiles) {
    try {
      const od = JSON.parse(readFileSync(path.join(oddsDir, f), 'utf8'));
      for (const g of (od.games || od.data || [])) {
        const ht = g.home_team || '';
        const ct = g.commence_time || g.date || od.date || '';
        const ds = ct.split('T')[0];
        if (!ds || !ht) continue;
        const lines = [];
        for (const bk of (g.bookmakers || [])) {
          const tm = (bk.markets || []).find(m => m.key === 'totals');
          if (tm) {
            const ov = (tm.outcomes || []).find(o => o.name === 'Over');
            if (ov?.point) lines.push(ov.point);
          }
        }
        if (g.consensus_line) lines.push(g.consensus_line);
        if (lines.length > 0) {
          allOdds[`${ds}_${ht}`] = lines.reduce((a, b) => a + b, 0) / lines.length;
        }
      }
    } catch {}
  }

  // Also CSV backtest
  try {
    const csv = readFileSync(path.join(ROOT, 'data/nba/backtests/nba_totals_backtest_dataset.csv'), 'utf8');
    const lines = csv.split('\n');
    const headers = lines[0].split(',');
    const dateIdx = headers.indexOf('date');
    const htIdx = headers.indexOf('home_team');
    const lineIdx = headers.indexOf('market_total_line_consensus');
    
    const TEAM_MAP = {
      'ATL': 'Atlanta Hawks', 'BOS': 'Boston Celtics', 'BKN': 'Brooklyn Nets',
      'CHA': 'Charlotte Hornets', 'CHI': 'Chicago Bulls', 'CLE': 'Cleveland Cavaliers',
      'DAL': 'Dallas Mavericks', 'DEN': 'Denver Nuggets', 'DET': 'Detroit Pistons',
      'GS': 'Golden State Warriors', 'GSW': 'Golden State Warriors',
      'HOU': 'Houston Rockets', 'IND': 'Indiana Pacers',
      'LAC': 'Los Angeles Clippers', 'LAL': 'Los Angeles Lakers',
      'MEM': 'Memphis Grizzlies', 'MIA': 'Miami Heat', 'MIL': 'Milwaukee Bucks',
      'MIN': 'Minnesota Timberwolves', 'NO': 'New Orleans Pelicans',
      'NY': 'New York Knicks', 'OKC': 'Oklahoma City Thunder', 'ORL': 'Orlando Magic',
      'PHI': 'Philadelphia 76ers', 'PHX': 'Phoenix Suns',
      'POR': 'Portland Trail Blazers', 'SAC': 'Sacramento Kings',
      'SA': 'San Antonio Spurs', 'TOR': 'Toronto Raptors',
      'UTAH': 'Utah Jazz', 'UTA': 'Utah Jazz',
      'WSH': 'Washington Wizards', 'WAS': 'Washington Wizards',
    };

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols[lineIdx]) {
        const htName = TEAM_MAP[cols[htIdx]] || cols[htIdx];
        const key = `${cols[dateIdx]}_${htName}`;
        if (!allOdds[key]) allOdds[key] = parseFloat(cols[lineIdx]);
      }
    }
  } catch {}

  console.log(`  Total odds entries: ${Object.keys(allOdds).length}`);

  // Rolling stats helper
  function computePerGame(stats, oppStats, pts, oppPts) {
    const fgm = stats.fgm || 0, fga = stats.fga || 1;
    const fg3m = stats.fg3m || 0, fg3a = stats.fg3a || 0;
    const ftm = stats.ftm || 0, fta = stats.fta || 0;
    const oreb = stats.offRebounds || 0, dreb = stats.defRebounds || 0;
    const tov = stats.turnovers || 0;
    const oppFga = oppStats.fga || 1;
    const oppOreb = oppStats.offRebounds || 0, oppDreb = oppStats.defRebounds || 0;
    const oppTov = oppStats.turnovers || 0, oppFta = oppStats.fta || 0;
    const poss = fga - oreb + tov + 0.44 * fta;
    const oppPoss = oppFga - oppOreb + oppTov + 0.44 * oppFta;
    const pace = poss;
    const offRtg = poss > 0 ? (pts / poss) * 100 : 114.5;
    const defRtg = oppPoss > 0 ? (oppPts / oppPoss) * 100 : 114.5;
    const efg = fga > 0 ? (fgm + 0.5 * fg3m) / fga : 0.535;
    const ts = (fga + 0.44 * fta) > 0 ? pts / (2 * (fga + 0.44 * fta)) : 0.575;
    const tovPct = poss > 0 ? tov / poss : 0.138;
    const orbPct = (oreb + oppDreb) > 0 ? oreb / (oreb + oppDreb) : 0.25;
    return {
      pts, oppPts: oppPts, pace, offRtg, defRtg, netRtg: offRtg - defRtg,
      efg, ts, tovPct, orbPct,
      fgPct: fga > 0 ? fgm / fga : 0.47,
      fg3Pct: fg3a > 0 ? fg3m / fg3a : 0.36,
      ftPct: fta > 0 ? ftm / fta : 0.78,
      rebounds: stats.rebounds || (oreb + dreb),
      assists: stats.assists || 0,
      turnovers: tov,
      won: pts > oppPts ? 1 : 0,
      fga, fta, fg3a
    };
  }

  function getRollingStats(teamId, gameDate, window) {
    const recent = [];
    for (let i = allGames.length - 1; i >= 0; i--) {
      const g = allGames[i];
      if ((g.date || '') >= gameDate) continue;
      const isHome = g.homeTeamId === teamId;
      const isAway = g.awayTeamId === teamId;
      if (!isHome && !isAway) continue;
      const stats = isHome ? g.homeStats : g.awayStats;
      const opp = isHome ? g.awayStats : g.homeStats;
      const pts = isHome ? g.homeScore : g.awayScore;
      const oppPts = isHome ? g.awayScore : g.homeScore;
      recent.push(computePerGame(stats, opp, pts, oppPts));
      if (recent.length >= window) break;
    }
    if (recent.length < Math.min(3, window)) return null;
    const n = recent.length;
    const totalPts = recent.reduce((s, g) => s + g.pts, 0);
    const totalOpp = recent.reduce((s, g) => s + g.oppPts, 0);
    const totalPoss = recent.reduce((s, g) => s + g.pace, 0);
    const pace = totalPoss / n;
    const offRtg = totalPoss > 0 ? (totalPts / totalPoss) * 100 : 114.5;
    const defRtg = totalPoss > 0 ? (totalOpp / totalPoss) * 100 : 114.5;
    const avg = k => recent.reduce((s, g) => s + g[k], 0) / n;
    return {
      games: n, pace, offRtg, defRtg, netRtg: offRtg - defRtg,
      ppg: totalPts / n, oppPpg: totalOpp / n, efg: avg('efg'), ts: avg('ts'),
      tovPct: avg('tovPct'), orbPct: avg('orbPct'), fgPct: avg('fgPct'),
      fg3Pct: avg('fg3Pct'), ftPct: avg('ftPct'), rebounds: avg('rebounds'),
      assists: avg('assists'), turnovers: avg('turnovers'),
      winPct: recent.reduce((s, g) => s + g.won, 0) / n,
      fga: avg('fga'), fta: avg('fta'), fg3a: avg('fg3a')
    };
  }

  function buildFeatures(hL3, hL10, hL20, aL3, aL10, aL20) {
    return {
      h3_pace: hL3.pace, h3_offRtg: hL3.offRtg, h3_defRtg: hL3.defRtg,
      h3_ppg: hL3.ppg, h3_efg: hL3.efg, h3_fgPct: hL3.fgPct,
      h3_fg3Pct: hL3.fg3Pct, h3_assists: hL3.assists, h3_turnovers: hL3.turnovers,
      a3_pace: aL3.pace, a3_offRtg: aL3.offRtg, a3_defRtg: aL3.defRtg,
      a3_ppg: aL3.ppg, a3_efg: aL3.efg, a3_fgPct: aL3.fgPct,
      a3_fg3Pct: aL3.fg3Pct, a3_assists: aL3.assists, a3_turnovers: aL3.turnovers,
      h10_pace: hL10.pace, h10_offRtg: hL10.offRtg, h10_defRtg: hL10.defRtg,
      h10_ppg: hL10.ppg, h10_efg: hL10.efg, h10_fgPct: hL10.fgPct,
      h10_fg3Pct: hL10.fg3Pct, h10_ftPct: hL10.ftPct, h10_rebounds: hL10.rebounds,
      h10_assists: hL10.assists, h10_turnovers: hL10.turnovers, h10_ts: hL10.ts,
      a10_pace: aL10.pace, a10_offRtg: aL10.offRtg, a10_defRtg: aL10.defRtg,
      a10_ppg: aL10.ppg, a10_efg: aL10.efg, a10_fgPct: aL10.fgPct,
      a10_fg3Pct: aL10.fg3Pct, a10_ftPct: aL10.ftPct, a10_rebounds: aL10.rebounds,
      a10_assists: aL10.assists, a10_turnovers: aL10.turnovers, a10_ts: aL10.ts,
      h20_pace: hL20.pace, h20_offRtg: hL20.offRtg, h20_defRtg: hL20.defRtg,
      h20_ppg: hL20.ppg, h20_efg: hL20.efg,
      a20_pace: aL20.pace, a20_offRtg: aL20.offRtg, a20_defRtg: aL20.defRtg,
      a20_ppg: aL20.ppg, a20_efg: aL20.efg,
      pace_avg_l10: (hL10.pace + aL10.pace) / 2,
      pace_diff_l10: hL10.pace - aL10.pace,
      pace_avg_l3: (hL3.pace + aL3.pace) / 2,
      pace_product: (hL10.pace * aL10.pace) / 10000,
      ppg_sum_l10: hL10.ppg + aL10.ppg,
      ppg_sum_l3: hL3.ppg + aL3.ppg,
      ppg_sum_l20: hL20.ppg + aL20.ppg,
      ppg_diff_l10: hL10.ppg - aL10.ppg,
      expected_total_l10: ((hL10.pace+aL10.pace)/2/100) * (hL10.offRtg*(aL10.defRtg/114.5) + aL10.offRtg*(hL10.defRtg/114.5)),
      expected_total_l3: ((hL3.pace+aL3.pace)/2/100) * (hL3.offRtg*(aL3.defRtg/114.5) + aL3.offRtg*(hL3.defRtg/114.5)),
      home_off_vs_away_def: hL10.offRtg - aL10.defRtg,
      away_off_vs_home_def: aL10.offRtg - hL10.defRtg,
      matchup_offense_sum: hL10.offRtg + aL10.offRtg,
      matchup_defense_sum: hL10.defRtg + aL10.defRtg,
      efg_sum: hL10.efg + aL10.efg,
      efg_diff: hL10.efg - aL10.efg,
      ts_sum: hL10.ts + aL10.ts,
      tov_sum: hL10.turnovers + aL10.turnovers,
      tov_diff: hL10.turnovers - aL10.turnovers,
      tovPct_avg: (hL10.tovPct + aL10.tovPct) / 2,
      orbPct_avg: (hL10.orbPct + aL10.orbPct) / 2,
      rebounds_sum: hL10.rebounds + aL10.rebounds,
      fta_sum: hL10.fta + aL10.fta,
      home_form_trend: hL3.ppg - hL20.ppg,
      away_form_trend: aL3.ppg - aL20.ppg,
      home_pace_trend: hL3.pace - hL20.pace,
      away_pace_trend: aL3.pace - aL20.pace,
      winPct_sum: hL10.winPct + aL10.winPct,
      winPct_diff: hL10.winPct - aL10.winPct,
      home_court: 1,
    };
  }

  function predict(mdl, features) {
    let pred = mdl.bias;
    for (const [key, weight] of Object.entries(mdl.weights)) {
      if (!(key in features)) continue;
      const val = features[key];
      const mean = mdl.means[key] || 0;
      const std = mdl.stds[key] || 1;
      if (std > 0) pred += weight * ((val - mean) / std);
    }
    return pred;
  }

  // Build test results for Dec 2025 - Mar 9 2026
  const testGames = allGames.filter(g => {
    const d = (g.date || '').split('T')[0];
    return d >= '2025-12-01' && d <= '2026-03-09';
  });
  console.log(`\n  Games in Dec 2025 - Mar 9 2026: ${testGames.length}`);

  const results = [];
  let skipped = { noStats: 0, noOdds: 0, badTotal: 0 };

  for (const game of testGames) {
    const hL3 = getRollingStats(game.homeTeamId, game.date, 3);
    const hL10 = getRollingStats(game.homeTeamId, game.date, 10);
    const hL20 = getRollingStats(game.homeTeamId, game.date, 20);
    const aL3 = getRollingStats(game.awayTeamId, game.date, 3);
    const aL10 = getRollingStats(game.awayTeamId, game.date, 10);
    const aL20 = getRollingStats(game.awayTeamId, game.date, 20);

    if (!hL3 || !hL10 || !hL20 || !aL3 || !aL10 || !aL20) { skipped.noStats++; continue; }

    const actual = game.homeScore + game.awayScore;
    if (actual < 150 || actual > 350) { skipped.badTotal++; continue; }

    // Match odds
    const htName = game.homeTeamName || '';
    const htAbbrev = game.homeTeam || '';
    let vegas = null;
    for (const key of [`${game.date}_${htName}`, `${game.date}_${htAbbrev}`]) {
      if (allOdds[key]) { vegas = allOdds[key]; break; }
    }
    if (!vegas) { skipped.noOdds++; continue; }

    const features = buildFeatures(hL3, hL10, hL20, aL3, aL10, aL20);
    const pred = predict(model, features);
    const edge = pred - vegas;
    const pickOver = edge > 0;
    const actualOver = actual > vegas;
    const correct = pickOver === actualOver;

    results.push({
      date: game.date,
      home: game.homeTeam,
      away: game.awayTeam,
      actual, vegas, pred, edge,
      absEdge: Math.abs(edge),
      pickOver, correct
    });
  }

  console.log(`  Matched with odds: ${results.length}`);
  console.log(`  Skipped: ${JSON.stringify(skipped)}`);

  // ── DUAL STRATEGY: Unders ≥5, Overs ≥7.5 ──
  const underPicks = results.filter(r => !r.pickOver && r.absEdge >= 5);
  const overPicks = results.filter(r => r.pickOver && r.absEdge >= 7.5);
  const allPicks = [...underPicks, ...overPicks].sort((a, b) => a.date.localeCompare(b.date));

  function calcROI(picks) {
    if (!picks.length) return { n: 0, w: 0, l: 0, wr: 0, roi: 0, profit: 0 };
    const w = picks.filter(p => p.correct).length;
    const l = picks.length - w;
    const profit = w * 100 - l * 110;
    const wagered = picks.length * 110;
    return {
      n: picks.length, w, l,
      wr: (w / picks.length * 100).toFixed(1),
      roi: ((profit / wagered) * 100).toFixed(2),
      profit
    };
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  DUAL STRATEGY RESULTS: DEC 2025 – MAR 9, 2026');
  console.log('═'.repeat(70));

  const uStats = calcROI(underPicks);
  console.log(`\n  UNDERS (edge ≥ 5):`);
  console.log(`    Bets: ${uStats.n}  |  W-L: ${uStats.w}-${uStats.l}  |  WR: ${uStats.wr}%  |  ROI: ${uStats.roi > 0 ? '+' : ''}${uStats.roi}%`);
  console.log(`    Profit: $${uStats.profit >= 0 ? '+' : ''}${uStats.profit.toLocaleString()} (per $110/bet)`);

  const oStats = calcROI(overPicks);
  console.log(`\n  OVERS (edge ≥ 7.5):`);
  console.log(`    Bets: ${oStats.n}  |  W-L: ${oStats.w}-${oStats.l}  |  WR: ${oStats.wr}%  |  ROI: ${oStats.roi > 0 ? '+' : ''}${oStats.roi}%`);
  console.log(`    Profit: $${oStats.profit >= 0 ? '+' : ''}${oStats.profit.toLocaleString()} (per $110/bet)`);

  const cStats = calcROI(allPicks);
  console.log(`\n  COMBINED:`);
  console.log(`    Bets: ${cStats.n}  |  W-L: ${cStats.w}-${cStats.l}  |  WR: ${cStats.wr}%  |  ROI: ${cStats.roi > 0 ? '+' : ''}${cStats.roi}%`);
  console.log(`    Profit: $${cStats.profit >= 0 ? '+' : ''}${cStats.profit.toLocaleString()} (per $110/bet)`);

  // Volume
  if (allPicks.length > 0) {
    const dates = [...new Set(allPicks.map(r => r.date))].sort();
    const d1 = new Date(dates[0]);
    const d2 = new Date(dates[dates.length - 1]);
    const weeks = Math.max(1, (d2 - d1) / (7 * 86400000));
    console.log(`\n  VOLUME:`);
    console.log(`    Period: ${dates[0]} to ${dates[dates.length - 1]} (${Math.round((d2 - d1) / 86400000)} days, ${weeks.toFixed(1)} weeks)`);
    console.log(`    Under picks/week: ${(underPicks.length / weeks).toFixed(1)}`);
    console.log(`    Over picks/week:  ${(overPicks.length / weeks).toFixed(1)}`);
    console.log(`    TOTAL picks/week: ${(allPicks.length / weeks).toFixed(1)}`);
  }

  // Month by month
  console.log('\n  MONTH-BY-MONTH:');
  console.log(`  ${'Month'.padStart(10)} | ${'Bets'.padStart(5)} | ${'W-L'.padStart(7)} | ${'WR'.padStart(6)} | ${'ROI'.padStart(8)} | ${'Profit'.padStart(8)}`);
  console.log('  ' + '-'.repeat(58));

  const byMonth = {};
  for (const r of allPicks) {
    const m = r.date.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(r);
  }
  for (const m of Object.keys(byMonth).sort()) {
    const s = calcROI(byMonth[m]);
    const flag = s.roi < -5 ? '  !!!' : (s.roi > 10 ? '  *' : '');
    console.log(`  ${m.padStart(10)} | ${String(s.n).padStart(5)} | ${String(s.w).padStart(3)}-${String(s.l).padEnd(3)} | ${String(s.wr).padStart(5)}% | ${(s.roi > 0 ? '+' : '') + s.roi + '%'}${' '.repeat(Math.max(0, 8 - String(s.roi).length - 1))} | $${s.profit >= 0 ? '+' : ''}${s.profit}${flag}`);
  }

  // ── Also compare other strategies ──
  console.log('\n  STRATEGY COMPARISON (Dec 2025 - Mar 9 2026):');
  console.log(`  ${'Strategy'.padStart(40)} | ${'Bets'.padStart(5)} | ${'WR'.padStart(6)} | ${'ROI'.padStart(8)} | ${'Profit'.padStart(8)}`);
  console.log('  ' + '-'.repeat(78));
  
  const strats = [
    [4, 4, 'Current V1 (all ≥4)'],
    [5, 5, 'Symmetric ≥5'],
    [5, 7, 'Unders ≥5, Overs ≥7'],
    [5, 7.5, '★ DUAL: Unders ≥5, Overs ≥7.5'],
    [6, 7.5, 'Unders ≥6, Overs ≥7.5'],
    [6, 8, 'Unders ≥6, Overs ≥8'],
    [5, 999, 'Unders-only ≥5'],
    [6, 999, 'Unders-only ≥6'],
  ];

  for (const [uT, oT, label] of strats) {
    const picks = results.filter(r => 
      (!r.pickOver && r.absEdge >= uT) || (r.pickOver && r.absEdge >= oT)
    );
    const s = calcROI(picks);
    console.log(`  ${label.padStart(40)} | ${String(s.n).padStart(5)} | ${String(s.wr).padStart(5)}% | ${(s.roi > 0 ? '+' : '') + s.roi}% | $${s.profit >= 0 ? '+' : ''}${s.profit}`);
  }

  // ── Overall comparison: Full test period vs Recent ──
  console.log('\n  FULL TEST PERIOD (Oct 2024 - Nov 2025) vs RECENT (Dec 2025 - Mar 2026):');
  console.log('  (Full period results from prior analysis)');
  console.log(`    Full:   166 bets, 58.4% WR, +11.56% ROI, $+2,110`);
  console.log(`    Recent: ${cStats.n} bets, ${cStats.wr}% WR, ${cStats.roi > 0 ? '+' : ''}${cStats.roi}% ROI, $${cStats.profit >= 0 ? '+' : ''}${cStats.profit.toLocaleString()}`);
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  NBA TOTALS V3: DEC 2025 - MAR 9, 2026 VALIDATION  ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  await collectMissingGames();
  await collectMissingOdds();
  await runDualStrategyAnalysis();
}

main().catch(console.error);
