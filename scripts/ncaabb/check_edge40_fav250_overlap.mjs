#!/usr/bin/env node
/**
 * Quick diagnostic: How many edge >= 40% picks are favorites worse than -250?
 * If zero, the -250 filter is redundant on top of the 40% edge filter.
 */
const BASE = 'https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_';
const fmt = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

async function main() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = addDays(today, -1), start = addDays(end, -57);
  const dates = [];
  for (let i = 0; i < 58; i++) dates.push(fmt(addDays(start, i)));

  // Fetch all picks in parallel batches
  let allPicks = [];
  for (let i = 0; i < dates.length; i += 10) {
    const batch = dates.slice(i, i + 10);
    const results = await Promise.allSettled(batch.map(async d => {
      const r = await fetch(BASE + d + '.json');
      if (!r.ok) return null;
      const j = await r.json();
      return j.picks && j.picks.length > 0 ? { date: d, picks: j.picks } : null;
    }));
    allPicks.push(...results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value));
  }

  // Analyze edge >= 40% picks
  let edgeGte40 = 0;
  let wouldRemove = 0;
  const oddsBreakdown = {};
  const removed = [];

  for (const { date, picks } of allPicks) {
    for (const p of picks) {
      if (p.edge >= 0.40) {
        edgeGte40++;
        let bucket;
        const o = p.odds;
        if (o < -300) bucket = '< -300';
        else if (o < -250) bucket = '-300 to -250';
        else if (o < -200) bucket = '-250 to -200';
        else if (o < -150) bucket = '-200 to -150';
        else if (o < -100) bucket = '-150 to -100';
        else if (o <= 100) bucket = '-100 to +100';
        else if (o <= 150) bucket = '+101 to +150';
        else if (o <= 200) bucket = '+151 to +200';
        else if (o <= 300) bucket = '+201 to +300';
        else bucket = '> +300';

        oddsBreakdown[bucket] = (oddsBreakdown[bucket] || 0) + 1;

        if (o < -250) {
          wouldRemove++;
          const team = p.side === 'home' ? p.home_team : p.away_team;
          removed.push({ date, team, odds: o, edge: p.edge, betSize: p.bet_size_dollars });
        }
      }
    }
  }

  console.log(`\nTotal picks with edge >= 40%: ${edgeGte40}`);
  console.log(`Of those, favorites worse than -250: ${wouldRemove}\n`);

  console.log(`Odds distribution of edge >= 40% picks:`);
  const order = ['< -300', '-300 to -250', '-250 to -200', '-200 to -150', '-150 to -100',
                 '-100 to +100', '+101 to +150', '+151 to +200', '+201 to +300', '> +300'];
  for (const k of order) {
    if (oddsBreakdown[k]) console.log(`  ${k.padEnd(16)}: ${oddsBreakdown[k]}`);
  }

  if (removed.length > 0) {
    console.log(`\nPicks that would be removed by -250 cap:`);
    for (const r of removed) {
      console.log(`  ${r.date}  ${r.team.padEnd(25)} odds=${r.odds}  edge=${(r.edge * 100).toFixed(1)}%  stake=$${r.betSize}`);
    }
  } else {
    console.log(`\n✅ The -250 cap removes ZERO picks. It is fully redundant when edge >= 40%.`);
  }
}

main().catch(e => console.error(e));
