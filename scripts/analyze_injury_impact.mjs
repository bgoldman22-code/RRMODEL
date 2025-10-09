#!/usr/bin/env node

// Summarize per-team injury impacts from live generator
// Fetches: https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?season=2025
// Outputs a concise table per game, and a sorted list per team by absolute impact

import fetch from 'node-fetch';

const GEN_URL = process.env.GEN_URL || 'https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate?season=2025';

function fmt(n, d=2) { return (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(d); }
function sortByAbsImpact(a, b) { return Math.abs(b.impact||0) - Math.abs(a.impact||0); }

function summarizeAdj(adj) {
  const side = adj.impact >= 0 ? '+' : '';
  const name = adj.player || adj.name || adj.position || 'Unknown';
  const pos = adj.position ? ` ${adj.position}` : '';
  const reason = adj.reason ? ` — ${adj.reason}` : '';
  return `${side}${fmt(adj.impact, 2)} ${name}${pos}${reason}`;
}

function extractTeamReport(teamCode, injuryAnalysis) {
  const totalImpact = injuryAnalysis?.totalImpact || 0;
  const confidence = injuryAnalysis?.confidence ?? 1.0;
  const boosts = injuryAnalysis?.totalReturnBoost || 0;
  const adjustments = Array.isArray(injuryAnalysis?.adjustments) ? [...injuryAnalysis.adjustments] : [];
  const safeguarded = Array.isArray(injuryAnalysis?.safeguardedAdjustments) ? [...injuryAnalysis.safeguardedAdjustments] : null;

  const topAdj = adjustments.sort(sortByAbsImpact).slice(0, 3);
  const topAdjText = topAdj.map(summarizeAdj);

  return {
    team: teamCode,
    totalImpact,
    confidence,
    totalReturnBoost: boosts,
    topAdjustments: topAdjText,
    adjustmentsCount: adjustments.length,
    safeguardedCount: safeguarded ? safeguarded.length : 0
  };
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

    const perTeam = [];

    console.log('Per-game injury impact summary:\n');
    for (const g of games) {
      const home = g.home_team; const away = g.away_team;
      const homeIA = g.teamStats?.home?.injuryImpact || g.modelEnhancements?.injuryAnalysis?.home || null;
      const awayIA = g.teamStats?.away?.injuryImpact || g.modelEnhancements?.injuryAnalysis?.away || null;

      const homeReport = extractTeamReport(home, homeIA);
      const awayReport = extractTeamReport(away, awayIA);

      perTeam.push(homeReport, awayReport);

      console.log(`${away} @ ${home}`);
      console.log(`  ${home}: totalImpact=${fmt(homeReport.totalImpact)} pts, conf=${fmt(homeReport.confidence, 2)}, boosts=${fmt(homeReport.totalReturnBoost)} | top: ${homeReport.topAdjustments.join('; ')}`);
      console.log(`  ${away}: totalImpact=${fmt(awayReport.totalImpact)} pts, conf=${fmt(awayReport.confidence, 2)}, boosts=${fmt(awayReport.totalReturnBoost)} | top: ${awayReport.topAdjustments.join('; ')}`);
      console.log('');
    }

    // Aggregate per team (in case multiple entries)
    const agg = new Map();
    for (const t of perTeam) {
      const cur = agg.get(t.team) || { team: t.team, totalImpact: 0, items: [], avgConfidenceSum: 0, count: 0, totalBoosts: 0 };
      cur.totalImpact += (t.totalImpact || 0);
      cur.totalBoosts += (t.totalReturnBoost || 0);
      cur.avgConfidenceSum += (t.confidence ?? 1.0);
      cur.count += 1;
      cur.items.push(...t.topAdjustments);
      agg.set(t.team, cur);
    }

    const final = [...agg.values()].map(v => ({
      team: v.team,
      totalImpact: v.totalImpact,
      totalBoosts: v.totalBoosts,
      avgConfidence: v.count ? v.avgConfidenceSum / v.count : 1.0,
      examples: v.items.slice(0, 3)
    }));

    final.sort((a, b) => Math.abs(b.totalImpact) - Math.abs(a.totalImpact));

    console.log('\nOverall team impacts (sorted by absolute points):\n');
    for (const r of final) {
      const sign = r.totalImpact >= 0 ? '+' : '';
      console.log(`${r.team}: ${sign}${fmt(r.totalImpact)} pts (avgConf=${fmt(r.avgConfidence, 2)}, boosts=${fmt(r.totalBoosts)})${r.examples.length ? ' — e.g., ' + r.examples.join('; ') : ''}`);
    }

  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
