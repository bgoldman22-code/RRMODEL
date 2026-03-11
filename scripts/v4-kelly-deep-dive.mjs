#!/usr/bin/env node
/**
 * Deep dive into the Kelly results — what's really happening?
 * The WR column in the last output showed Kelly "win rate" but that was 
 * counting bets it actually TOOK vs total qualifying. Let me fix that
 * and show the true mechanics.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const TEAM_NAME_MAP = {
  'ATL': 'Atlanta Hawks', 'BOS': 'Boston Celtics', 'BKN': 'Brooklyn Nets',
  'CHA': 'Charlotte Hornets', 'CHI': 'Chicago Bulls', 'CLE': 'Cleveland Cavaliers',
  'DAL': 'Dallas Mavericks', 'DEN': 'Denver Nuggets', 'DET': 'Detroit Pistons',
  'GS': 'Golden State Warriors', 'GSW': 'Golden State Warriors',
  'HOU': 'Houston Rockets', 'IND': 'Indiana Pacers',
  'LAC': 'Los Angeles Clippers', 'LAL': 'Los Angeles Lakers',
  'MEM': 'Memphis Grizzlies', 'MIA': 'Miami Heat', 'MIL': 'Milwaukee Bucks',
  'MIN': 'Minnesota Timberwolves', 'NOP': 'New Orleans Pelicans', 'NO': 'New Orleans Pelicans',
  'NY': 'New York Knicks', 'NYK': 'New York Knicks',
  'OKC': 'Oklahoma City Thunder', 'ORL': 'Orlando Magic',
  'PHI': 'Philadelphia 76ers', 'PHX': 'Phoenix Suns',
  'POR': 'Portland Trail Blazers', 'SAC': 'Sacramento Kings',
  'SA': 'San Antonio Spurs', 'SAS': 'San Antonio Spurs',
  'TOR': 'Toronto Raptors',
  'UTAH': 'Utah Jazz', 'UTA': 'Utah Jazz',
  'WAS': 'Washington Wizards', 'WSH': 'Washington Wizards',
};

function computePerGameStats(stats, oppStats, pts, oppPts) {
  const fgm = stats.fgm || 0, fga = stats.fga || 1;
  const fg3m = stats.fg3m || 0, fg3a = stats.fg3a || 0;
  const ftm = stats.ftm || 0, fta = stats.fta || 0;
  const oreb = stats.offRebounds || 0, dreb = stats.defRebounds || 0;
  const tov = stats.turnovers || 0;
  const oppFga = oppStats.fga || 1, oppOreb = oppStats.offRebounds || 0;
  const oppDreb = oppStats.defRebounds || 0, oppTov = oppStats.turnovers || 0;
  const oppFta = oppStats.fta || 0;
  const possessions = fga - oreb + tov + 0.44 * fta;
  const oppPossessions = oppFga - oppOreb + oppTov + 0.44 * oppFta;
  return {
    pts, oppPts, pace: possessions,
    offRtg: possessions > 0 ? (pts / possessions) * 100 : 114.5,
    defRtg: oppPossessions > 0 ? (oppPts / oppPossessions) * 100 : 114.5,
    netRtg: (possessions > 0 ? (pts / possessions) * 100 : 114.5) - (oppPossessions > 0 ? (oppPts / oppPossessions) * 100 : 114.5),
    efg: fga > 0 ? (fgm + 0.5 * fg3m) / fga : 0.535,
    ts: (fga + 0.44 * fta) > 0 ? pts / (2 * (fga + 0.44 * fta)) : 0.575,
    tovPct: possessions > 0 ? tov / possessions : 0.138,
    orbPct: (oreb + oppDreb) > 0 ? oreb / (oreb + oppDreb) : 0.25,
    fgPct: fga > 0 ? fgm / fga : 0.47, fg3Pct: fg3a > 0 ? fg3m / fg3a : 0.36,
    ftPct: fta > 0 ? ftm / fta : 0.78,
    rebounds: stats.rebounds || (oreb + dreb), assists: stats.assists || 0,
    turnovers: tov, steals: stats.steals || 0, blocks: stats.blocks || 0,
    fgm, fga, fg3m, fg3a, ftm, fta, oreb, dreb,
    won: pts > oppPts ? 1 : 0
  };
}

function computeRollingWindowStats(allGames, teamId, gameDate, windowSize) {
  const rg = [];
  for (let i = allGames.length - 1; i >= 0; i--) {
    const g = allGames[i];
    if (g.date >= gameDate) continue;
    const isHome = g.homeTeamId === teamId, isAway = g.awayTeamId === teamId;
    if (!isHome && !isAway) continue;
    const stats = isHome ? g.homeStats : g.awayStats;
    const oppStats = isHome ? g.awayStats : g.homeStats;
    rg.push(computePerGameStats(stats, oppStats, isHome ? g.homeScore : g.awayScore, isHome ? g.awayScore : g.homeScore));
    if (rg.length >= windowSize) break;
  }
  if (rg.length < Math.min(3, windowSize)) return null;
  const n = rg.length;
  const totalPts = rg.reduce((s, g) => s + g.pts, 0);
  const totalOppPts = rg.reduce((s, g) => s + g.oppPts, 0);
  const totalPoss = rg.reduce((s, g) => s + g.pace, 0);
  const avg = (key) => rg.reduce((s, g) => s + g[key], 0) / n;
  return {
    games: n, pace: totalPoss / n,
    offRtg: totalPoss > 0 ? (totalPts / totalPoss) * 100 : 114.5,
    defRtg: totalPoss > 0 ? (totalOppPts / totalPoss) * 100 : 114.5,
    netRtg: 0, ppg: totalPts / n, oppPpg: totalOppPts / n,
    efg: avg('efg'), ts: avg('ts'), tovPct: avg('tovPct'), orbPct: avg('orbPct'),
    fgPct: avg('fgPct'), fg3Pct: avg('fg3Pct'), ftPct: avg('ftPct'),
    rebounds: avg('rebounds'), assists: avg('assists'), turnovers: avg('turnovers'),
    steals: avg('steals'), blocks: avg('blocks'),
    winPct: rg.filter(g => g.won).length / n,
    fga: avg('fga'), fta: avg('fta'), fg3a: avg('fg3a'),
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
    h10_fg3Pct: hL10.fg3Pct, h10_ftPct: hL10.ftPct,
    h10_rebounds: hL10.rebounds, h10_assists: hL10.assists,
    h10_turnovers: hL10.turnovers, h10_ts: hL10.ts,
    a10_pace: aL10.pace, a10_offRtg: aL10.offRtg, a10_defRtg: aL10.defRtg,
    a10_ppg: aL10.ppg, a10_efg: aL10.efg, a10_fgPct: aL10.fgPct,
    a10_fg3Pct: aL10.fg3Pct, a10_ftPct: aL10.ftPct,
    a10_rebounds: aL10.rebounds, a10_assists: aL10.assists,
    a10_turnovers: aL10.turnovers, a10_ts: aL10.ts,
    h20_pace: hL20.pace, h20_offRtg: hL20.offRtg, h20_defRtg: hL20.defRtg,
    h20_ppg: hL20.ppg, h20_efg: hL20.efg,
    a20_pace: aL20.pace, a20_offRtg: aL20.offRtg, a20_defRtg: aL20.defRtg,
    a20_ppg: aL20.ppg, a20_efg: aL20.efg,
    pace_avg_l10: (hL10.pace + aL10.pace) / 2, pace_diff_l10: hL10.pace - aL10.pace,
    pace_avg_l3: (hL3.pace + aL3.pace) / 2,
    pace_product: (hL10.pace * aL10.pace) / 10000,
    ppg_sum_l10: hL10.ppg + aL10.ppg, ppg_sum_l3: hL3.ppg + aL3.ppg,
    ppg_sum_l20: hL20.ppg + aL20.ppg, ppg_diff_l10: hL10.ppg - aL10.ppg,
    expected_total_l10: ((hL10.pace + aL10.pace) / 2 / 100) *
      (hL10.offRtg * (aL10.defRtg / 114.5) + aL10.offRtg * (hL10.defRtg / 114.5)),
    expected_total_l3: ((hL3.pace + aL3.pace) / 2 / 100) *
      (hL3.offRtg * (aL3.defRtg / 114.5) + aL3.offRtg * (hL3.defRtg / 114.5)),
    home_off_vs_away_def: hL10.offRtg - aL10.defRtg,
    away_off_vs_home_def: aL10.offRtg - hL10.defRtg,
    matchup_offense_sum: hL10.offRtg + aL10.offRtg,
    matchup_defense_sum: hL10.defRtg + aL10.defRtg,
    efg_sum: hL10.efg + aL10.efg, efg_diff: hL10.efg - aL10.efg,
    ts_sum: hL10.ts + aL10.ts,
    tov_sum: hL10.turnovers + aL10.turnovers, tov_diff: hL10.turnovers - aL10.turnovers,
    tovPct_avg: (hL10.tovPct + aL10.tovPct) / 2,
    orbPct_avg: (hL10.orbPct + aL10.orbPct) / 2,
    rebounds_sum: hL10.rebounds + aL10.rebounds, fta_sum: hL10.fta + aL10.fta,
    home_form_trend: hL3.ppg - hL20.ppg, away_form_trend: aL3.ppg - aL20.ppg,
    home_pace_trend: hL3.pace - hL20.pace, away_pace_trend: aL3.pace - aL20.pace,
    winPct_sum: hL10.winPct + aL10.winPct, winPct_diff: hL10.winPct - aL10.winPct,
    home_court: 1,
  };
}

function predictWithModel(model, features) {
  let pred = model.bias;
  for (const [key, weight] of Object.entries(model.weights)) {
    if (!(key in features)) continue;
    const val = features[key];
    if (!Number.isFinite(val)) continue;
    const mean = model.means[key] ?? 0;
    const std = model.stds[key] ?? 1;
    if (std > 0) pred += weight * ((val - mean) / std);
  }
  return pred;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   KELLY DEEP DIVE — CORRECTED MECHANICS                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const v4Model = JSON.parse(await readFile(path.join(ROOT, 'data/nba/models/totals_model_v4_expanded.json'), 'utf8'));

  // Load games
  const allGames = [];
  for (const { file } of [
    { file: 'data/nba/games/games_2022_23.json' },
    { file: 'data/nba/games/games_2023_24.json' },
    { file: 'data/nba/games/games_2024_25.json' },
    { file: 'data/nba/games/games_2025_26_extended.json' },
  ]) {
    try {
      const data = JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
      const valid = data.filter(g => g.homeStats?.fga > 0 && g.awayStats?.fga > 0 &&
        (g.homeScore > 0 || g.homeStats?.points > 0) && (g.awayScore > 0 || g.awayStats?.points > 0));
      for (const g of valid) {
        if (!g.homeScore && g.homeStats?.points) g.homeScore = g.homeStats.points;
        if (!g.awayScore && g.awayStats?.points) g.awayScore = g.awayStats.points;
        if (!g.homeScore) g.homeScore = (g.homeStats.fgm - g.homeStats.fg3m) * 2 + g.homeStats.fg3m * 3 + g.homeStats.ftm;
        if (!g.awayScore) g.awayScore = (g.awayStats.fgm - g.awayStats.fg3m) * 2 + g.awayStats.fg3m * 3 + g.awayStats.ftm;
      }
      allGames.push(...valid);
    } catch {}
  }
  allGames.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Load odds
  const allOdds = {};
  try {
    const { readdir } = await import('fs/promises');
    const oddsDir = path.join(ROOT, 'data/nba/historical_odds/game_totals');
    const files = (await readdir(oddsDir)).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(await readFile(path.join(oddsDir, file), 'utf8'));
        const games = data.games || data.data || [];
        for (const game of games) {
          const homeTeam = game.home_team || game.homeTeam;
          const dateStr = (game.commence_time || game.date || data.date || '').split('T')[0];
          if (!dateStr || !homeTeam) continue;
          let lines = [];
          for (const bk of (game.bookmakers || [])) {
            const tm = (bk.markets || []).find(m => m.key === 'totals');
            if (!tm) continue;
            const ov = tm.outcomes?.find(o => o.name === 'Over');
            if (ov?.point) lines.push(ov.point);
          }
          if (game.consensus_line) lines.push(game.consensus_line);
          if (game.fanduel?.line) lines.push(game.fanduel.line);
          if (game.draftkings?.line) lines.push(game.draftkings.line);
          if (game.betmgm?.line) lines.push(game.betmgm.line);
          if (lines.length === 0) continue;
          allOdds[`${dateStr}_${homeTeam}`] = { consensusLine: lines.reduce((a, b) => a + b, 0) / lines.length };
        }
      } catch {}
    }
  } catch {}
  try {
    const csv = await readFile(path.join(ROOT, 'data/nba/backtests/nba_totals_backtest_dataset.csv'), 'utf8');
    const csvLines = csv.split('\n');
    const headers = csvLines[0].split(',');
    for (let i = 1; i < csvLines.length; i++) {
      if (!csvLines[i].trim()) continue;
      const vals = csvLines[i].split(',');
      const row = {};
      headers.forEach((h, idx) => row[h] = vals[idx]);
      if (row.market_total_line_consensus) {
        const hn = TEAM_NAME_MAP[row.home_team] || row.home_team;
        const key = `${row.date}_${hn}`;
        if (!allOdds[key]) allOdds[key] = { consensusLine: parseFloat(row.market_total_line_consensus) };
        if (!allOdds[`${row.date}_${row.home_team}`]) allOdds[`${row.date}_${row.home_team}`] = allOdds[key];
      }
    }
  } catch {}

  // Build full results for Oct 2024+
  const fullResults = [];
  for (const game of allGames.filter(g => g.date >= '2024-10-01')) {
    const hL3 = computeRollingWindowStats(allGames, game.homeTeamId, game.date, 3);
    const hL10 = computeRollingWindowStats(allGames, game.homeTeamId, game.date, 10);
    const hL20 = computeRollingWindowStats(allGames, game.homeTeamId, game.date, 20);
    const aL3 = computeRollingWindowStats(allGames, game.awayTeamId, game.date, 3);
    const aL10 = computeRollingWindowStats(allGames, game.awayTeamId, game.date, 10);
    const aL20 = computeRollingWindowStats(allGames, game.awayTeamId, game.date, 20);
    if (!hL3 || !hL10 || !hL20 || !aL3 || !aL10 || !aL20) continue;
    const actual = game.homeScore + game.awayScore;
    if (actual < 150 || actual > 350) continue;
    const features = buildFeatures(hL3, hL10, hL20, aL3, aL10, aL20);
    const pred = predictWithModel(v4Model, features);
    const hn = TEAM_NAME_MAP[game.homeTeam || game.homeTeamName] || game.homeTeam || game.homeTeamName;
    const pd = new Date(new Date(game.date).getTime() - 86400000).toISOString().split('T')[0];
    const nd = new Date(new Date(game.date).getTime() + 86400000).toISOString().split('T')[0];
    let vl = null;
    for (const k of [`${game.date}_${hn}`, `${game.date}_${game.homeTeam || game.homeTeamName}`, `${pd}_${hn}`, `${nd}_${hn}`]) {
      if (allOdds[k]) { vl = allOdds[k].consensusLine; break; }
    }
    if (!vl) continue;
    const edge = pred - vl;
    fullResults.push({
      date: game.date, actual, vegasLine: vl, pred, edge,
      absEdge: Math.abs(edge), pickOver: edge > 0,
      correct: (edge > 0) === (actual > vl),
    });
  }

  // Build calibration from 1-pt buckets
  const calBuckets = {};
  for (let e = 0; e <= 20; e++) {
    const inBucket = fullResults.filter(r => r.absEdge >= e && r.absEdge < e + 1);
    if (inBucket.length >= 10) {
      calBuckets[e + 0.5] = inBucket.filter(r => r.correct).length / inBucket.length;
    }
  }

  function estimateWinProb(absEdge) {
    const keys = Object.keys(calBuckets).map(Number).sort((a, b) => a - b);
    if (keys.length === 0) return 0.50;
    if (absEdge <= keys[0]) return calBuckets[keys[0]];
    if (absEdge >= keys[keys.length - 1]) return calBuckets[keys[keys.length - 1]];
    for (let i = 0; i < keys.length - 1; i++) {
      if (absEdge >= keys[i] && absEdge < keys[i + 1]) {
        const t = (absEdge - keys[i]) / (keys[i + 1] - keys[i]);
        return calBuckets[keys[i]] * (1 - t) + calBuckets[keys[i + 1]] * t;
      }
    }
    return 0.50;
  }

  const b = 100 / 110; // 0.909 — payout ratio at -110

  // ═══════════════════════════════════════════════════════════════
  // Show Kelly mechanics for sample bets
  // ═══════════════════════════════════════════════════════════════
  console.log('\n  KELLY MECHANICS — HOW IT WORKS:');
  console.log('  At -110 odds: b = 100/110 = 0.909');
  console.log('  Kelly f* = (b*p - q) / b where p = est. win prob, q = 1-p');
  console.log('  Breakeven: p = 52.38%, so Kelly = 0 at that point\n');

  console.log('  ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('  │  Edge    │ Cal. WR  │ Full K   │ 25% K    │ 50% K    │ Bet?     │');
  console.log('  ├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');
  for (let e = 0; e <= 15; e++) {
    const p = estimateWinProb(e + 0.5);
    const q = 1 - p;
    const fullK = (b * p - q) / b;
    const k25 = Math.max(0, Math.min(fullK * 0.25, 0.15));
    const k50 = Math.max(0, Math.min(fullK * 0.50, 0.15));
    const betYN = fullK > 0 ? '✅ YES' : '❌ NO';
    console.log(`  │  ${String(e).padStart(2)}-${String(e + 1).padStart(2)} pts │  ${(p * 100).toFixed(1).padStart(5)}%  │  ${(fullK * 100).toFixed(2).padStart(6)}% │  ${(k25 * 100).toFixed(2).padStart(6)}% │  ${(k50 * 100).toFixed(2).padStart(6)}% │ ${betYN.padEnd(8)} │`);
  }
  console.log('  └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘');

  // ═══════════════════════════════════════════════════════════════
  // Corrected Kelly simulation — show bets taken, actual WR, ROI
  // ═══════════════════════════════════════════════════════════════

  const holdout = fullResults.filter(r => r.date >= '2025-12-01');
  const fullPeriod = fullResults;

  for (const { label, data } of [
    { label: 'HOLDOUT (Dec 2025 – Mar 2026)', data: holdout },
    { label: 'FULL (Oct 2024 – Mar 2026)', data: fullPeriod },
  ]) {
    console.log(`\n  ═══════════════════════════════════════════════════`);
    console.log(`  ${label} — ${data.length} total games`);
    console.log(`  ═══════════════════════════════════════════════════`);

    const configs = [
      { name: 'Flat $110, All ≥5', flat: true, minEdge: 5 },
      { name: 'Flat $110, All ≥6', flat: true, minEdge: 6 },
      { name: 'Flat $110, All ≥7', flat: true, minEdge: 7 },
      { name: 'Flat $110, All ≥8', flat: true, minEdge: 8 },
      { name: 'Quarter Kelly, ≥1 edge', flat: false, frac: 0.25, minEdge: 1 },
      { name: 'Quarter Kelly, ≥3 edge', flat: false, frac: 0.25, minEdge: 3 },
      { name: 'Quarter Kelly, ≥5 edge', flat: false, frac: 0.25, minEdge: 5 },
      { name: 'Half Kelly, ≥1 edge', flat: false, frac: 0.50, minEdge: 1 },
      { name: 'Half Kelly, ≥3 edge', flat: false, frac: 0.50, minEdge: 3 },
      { name: 'Half Kelly, ≥5 edge', flat: false, frac: 0.50, minEdge: 5 },
    ];

    console.log('\n  ┌────────────────────────────┬──────┬────────┬───────┬──────────┬──────────┬──────────┬────────┐');
    console.log('  │  Strategy                  │ Qual │ Placed │  WR   │  Wagered │  Profit  │  ROI     │ MaxDD  │');
    console.log('  ├────────────────────────────┼──────┼────────┼───────┼──────────┼──────────┼──────────┼────────┤');

    for (const cfg of configs) {
      // Filter by minimum edge
      const qualifying = data.filter(r => r.absEdge >= cfg.minEdge);

      let bankroll = 10000;
      let peak = 10000;
      let maxDD = 0;
      let totalWagered = 0;
      let totalProfit = 0;
      let wins = 0;
      let placed = 0;

      for (const bet of qualifying) {
        let wager;

        if (cfg.flat) {
          wager = 110;
        } else {
          const p = estimateWinProb(bet.absEdge);
          const q = 1 - p;
          const fullK = (b * p - q) / b;
          const kellyFrac = Math.max(0, Math.min(fullK * cfg.frac, 0.15));
          if (kellyFrac <= 0.001) continue; // Skip if Kelly says don't bet
          wager = Math.max(10, Math.round(bankroll * kellyFrac));
        }

        placed++;
        totalWagered += wager;

        if (bet.correct) {
          const payout = Math.round(wager * b);
          bankroll += payout;
          totalProfit += payout;
          wins++;
        } else {
          bankroll -= wager;
          totalProfit -= wager;
        }

        if (bankroll > peak) peak = bankroll;
        const dd = peak > 0 ? (peak - bankroll) / peak * 100 : 0;
        if (dd > maxDD) maxDD = dd;
      }

      const wr = placed > 0 ? (wins / placed * 100).toFixed(1) : '0';
      const roi = totalWagered > 0 ? (totalProfit / totalWagered * 100).toFixed(1) : '0';
      const profitStr = totalProfit >= 0 ? `+$${totalProfit.toFixed(0)}` : `-$${Math.abs(totalProfit).toFixed(0)}`;
      const wageredStr = totalWagered >= 10000 ? `$${(totalWagered / 1000).toFixed(0)}k` : `$${totalWagered.toFixed(0)}`;

      console.log(`  │  ${cfg.name.padEnd(26)} │ ${String(qualifying.length).padStart(4)} │ ${String(placed).padStart(6)} │ ${wr.padStart(5)}%│ ${wageredStr.padStart(8)} │ ${profitStr.padStart(8)} │ ${roi.padStart(7)}% │ ${maxDD.toFixed(1).padStart(5)}% │`);
    }
    console.log('  └────────────────────────────┴──────┴────────┴───────┴──────────┴──────────┴──────────┴────────┘');
  }

  // ═══════════════════════════════════════════════════════════════
  // Monthly equity curves for best strategies
  // ═══════════════════════════════════════════════════════════════
  console.log('\n  ═══════════════════════════════════════════════════');
  console.log('  MONTHLY EQUITY CURVES (Holdout: Dec 2025 – Mar 2026)');
  console.log('  ═══════════════════════════════════════════════════\n');

  const curveConfigs = [
    { name: 'Flat ≥6', flat: true, minEdge: 6 },
    { name: 'Flat ≥8', flat: true, minEdge: 8 },
    { name: 'QK ≥3', flat: false, frac: 0.25, minEdge: 3 },
    { name: 'QK ≥5', flat: false, frac: 0.25, minEdge: 5 },
    { name: 'HK ≥3', flat: false, frac: 0.50, minEdge: 3 },
  ];

  // Header
  const months = ['2025-12', '2026-01', '2026-02', '2026-03'];
  console.log('  ┌──────────┬' + months.map(m => `────────────┬`).join('') + '─────────────┐');
  console.log('  │ Strategy │' + months.map(m => ` ${m}    │`).join('') + '  Cumulative  │');
  console.log('  ├──────────┼' + months.map(m => `────────────┼`).join('') + '─────────────┤');

  for (const cfg of curveConfigs) {
    const qualifying = holdout.filter(r => r.absEdge >= cfg.minEdge);
    
    const monthlyProfit = {};
    let bankroll = 10000;

    for (const bet of qualifying) {
      const month = bet.date.slice(0, 7);
      if (!monthlyProfit[month]) monthlyProfit[month] = 0;

      let wager;
      if (cfg.flat) {
        wager = 110;
      } else {
        const p = estimateWinProb(bet.absEdge);
        const fullK = (b * p - (1 - p)) / b;
        const kf = Math.max(0, Math.min(fullK * cfg.frac, 0.15));
        if (kf <= 0.001) continue;
        wager = Math.max(10, Math.round(bankroll * kf));
      }

      if (bet.correct) {
        const payout = Math.round(wager * b);
        bankroll += payout;
        monthlyProfit[month] += payout;
      } else {
        bankroll -= wager;
        monthlyProfit[month] -= wager;
      }
    }

    let cumProfit = 0;
    let line = `  │ ${cfg.name.padEnd(8)} │`;
    for (const m of months) {
      const mp = monthlyProfit[m] || 0;
      cumProfit += mp;
      const str = mp >= 0 ? `+$${mp.toFixed(0)}` : `-$${Math.abs(mp).toFixed(0)}`;
      line += ` ${str.padStart(10)} │`;
    }
    const cumStr = cumProfit >= 0 ? `+$${cumProfit.toFixed(0)}` : `-$${Math.abs(cumProfit).toFixed(0)}`;
    line += ` ${cumStr.padStart(11)} │`;
    console.log(line);
  }
  console.log('  └──────────┴' + months.map(m => `────────────┴`).join('') + '─────────────┘');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
