#!/usr/bin/env node

// Format injuries per game in the requested shape:
// TB vs SF
// TB (-4.6 pts)
// Bucky Irving (Questionable) -1.4 pts
// ...
// SF (+3.2 pts)
// Brock Purdy (Out) -6.7 pts
// ...

import fetch from 'node-fetch';

const GEN_URL = process.env.GEN_URL || 'https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?season=2025';

function fmtPts(x) {
  if (x === null || x === undefined || isNaN(x)) return '0.0 pts';
  const n = Number(x);
  const s = n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
  return `${s} pts`;
}

function titleCase(s) {
  if (!s) return 'Unknown';
  return String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase();
}

function extractIA(sideObj) {
  // Prefer teamStats.home/away.injuryImpact; fallback to modelEnhancements.injuryAnalysis.home/away
  return sideObj?.injuryImpact || null;
}

function dedupeAndSortAdjustments(adjs) {
  if (!Array.isArray(adjs)) return [];
  // Sometimes same player may appear; keep largest abs impact
  const bestByPlayer = new Map();
  for (const a of adjs) {
    const key = (a.player || a.name || `${a.position || ''}:${a.status || ''}`).trim();
    const prev = bestByPlayer.get(key);
    if (!prev || Math.abs(a.impact || 0) > Math.abs(prev.impact || 0)) bestByPlayer.set(key, a);
  }
  const merged = [...bestByPlayer.values()];
  merged.sort((a, b) => Math.abs(b.impact || 0) - Math.abs(a.impact || 0));
  return merged;
}

function printTeamBlock(teamCode, ia, options = {}) {
  const { maxItems = 8, minAbs = 0.1, includeZeros = false } = options;
  const total = ia?.totalImpact ?? 0;
  const adjustments = dedupeAndSortAdjustments(ia?.adjustments || []);

  console.log(`${teamCode} (${fmtPts(total)})`);

  let printed = 0;
  for (const adj of adjustments) {
    const impact = Number(adj.impact || 0);
    if (!includeZeros && Math.abs(impact) < minAbs) continue;
    const name = adj.player || adj.name || 'Unknown Player';
    const status = titleCase(adj.status || 'Unknown');
    // Example prefers status, optionally we could add position; keeping simple
    console.log(`${name} (${status}) ${fmtPts(impact)}`);
    printed++;
    if (printed >= maxItems) break;
  }
  if (printed === 0) {
    console.log('—');
  }
}

(async () => {
  try {
    const res = await fetch(GEN_URL, { method: 'GET', headers: { 'accept': 'application/json' } });
    if (!res.ok) {
      console.error(`Failed to fetch generator: ${res.status}`);
      process.exit(2);
    }
    const data = await res.json();
    const games = data?.predictions || [];

    if (!games.length) {
      console.log('No predictions found.');
      process.exit(0);
    }

    for (const g of games) {
      const home = g.home_team; const away = g.away_team;

      // Pull injury analysis blocks
      const homeIA = extractIA(g.teamStats?.home) || g.modelEnhancements?.injuryAnalysis?.home || null;
      const awayIA = extractIA(g.teamStats?.away) || g.modelEnhancements?.injuryAnalysis?.away || null;

      // Header line: AWAY vs HOME (user said either order is fine)
      console.log(`${away} vs ${home}`);
      if (awayIA) printTeamBlock(away, awayIA);
      else { console.log(`${away} (+0.0 pts)`); console.log('—'); }
      if (homeIA) printTeamBlock(home, homeIA);
      else { console.log(`${home} (+0.0 pts)`); console.log('—'); }
      console.log('');
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
