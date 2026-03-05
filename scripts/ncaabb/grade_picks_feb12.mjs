#!/usr/bin/env node
/**
 * Grade NCAA MBB Variant B Picks for Feb 12, 2026
 * Fetches picks from GitHub + scores from ESPN, grades ML picks
 * Outputs: console report, out/day_report_2026-02-12.md, out/day_report_2026-02-12.json
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'out');
mkdirSync(OUT_DIR, { recursive: true });

const PICKS_URL = 'https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_2026-02-12.json';

// ESPN dates games by tipoff date in UTC — many Feb 12 evening games show as Feb 13 in ESPN
const ESPN_URLS = [
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=20260212&limit=300&groups=50',
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=20260213&limit=300&groups=50',
];

// ─── Team Name Matching (proven from multiday grading) ─────────
function normalize(name) {
  return name.toLowerCase().replace(/\./g, '').replace(/['']/g, '').replace(/\s+/g, ' ').trim();
}

function keyWords(name) {
  const n = normalize(name);
  const stripped = n
    .replace(/(leopards|greyhounds|paladins|bears|governors|royals|wolves|lions|lobos|antelopes|eagles|mountain hawks|dolphins|hatters|bulls|cardinals|flames|aggies|monarchs|thundering herd|coyotes|fighting hawks|yellow jackets|demon deacons|bluejays|bisons|colonels|terriers|blue demons|falcons|huskies|owls|tigers|hokies|gators|bulldogs|buffaloes|red raiders|wildcats|wolverines|golden|warriors|spartans|knights|cougars|braves|raiders|rockets|hawks|hornets|panthers|rams|rebels|mustangs|pirates|saints|miners|lumberjacks|penguins|bearcats|highlanders|racers|ospreys|retrievers|spiders|tribe|phoenix|billikens|musketeers|friars|explorers|gaels|jaspers|dukes|toreros|zags|commodores|boilermakers|cyclones|jayhawks|mountaineers|sooners|longhorns|badgers|tar heels|seminoles|cavaliers|hoosiers|buckeyes|nittany lions|fighting irish|terrapins|cornhuskers|razorbacks|volunteers|crimson tide|gamecocks)$/g, '')
    .trim();
  return stripped.split(' ').filter(w => w.length > 2);
}

function findGame(pick, espnGames) {
  const homeNorm = normalize(pick.home_team);
  const awayNorm = normalize(pick.away_team);
  const homeKeys = keyWords(pick.home_team);
  const awayKeys = keyWords(pick.away_team);

  for (const g of espnGames) {
    const espnHome = normalize(g.homeName);
    const espnAway = normalize(g.awayName);
    const espnHomeShort = normalize(g.homeShort || '');
    const espnAwayShort = normalize(g.awayShort || '');

    // Method 1: Direct substring match
    const homeMatch = espnHome.includes(homeNorm) || homeNorm.includes(espnHome) ||
                      espnHomeShort.includes(homeNorm) || homeNorm.includes(espnHomeShort) ||
                      espnHome.includes(homeKeys[0] || '___') || (homeKeys[0] && espnHomeShort.includes(homeKeys[0]));
    const awayMatch = espnAway.includes(awayNorm) || awayNorm.includes(espnAway) ||
                      espnAwayShort.includes(awayNorm) || awayNorm.includes(espnAwayShort) ||
                      espnAway.includes(awayKeys[0] || '___') || (awayKeys[0] && espnAwayShort.includes(awayKeys[0]));

    if (homeMatch && awayMatch) return g;

    // Method 2: Key word overlap
    const espnHomeKeys = keyWords(g.homeName);
    const espnAwayKeys = keyWords(g.awayName);
    const homeOverlap = homeKeys.some(k => espnHomeKeys.includes(k) || espnHome.includes(k));
    const awayOverlap = awayKeys.some(k => espnAwayKeys.includes(k) || espnAway.includes(k));
    if (homeOverlap && awayOverlap) return g;
  }
  return null;
}

async function main() {
  // ── Fetch picks ──────────────────────────────────────────
  console.log('Fetching picks from GitHub...');
  const picksRes = await fetch(PICKS_URL);
  if (!picksRes.ok) {
    console.error(`❌ Failed to fetch picks: HTTP ${picksRes.status}`);
    process.exit(1);
  }
  const picksData = await picksRes.json();
  const picks = picksData.picks;

  // ── Fetch ESPN scores from both date windows ─────────────
  console.log('Fetching ESPN scores...');
  const espnGames = [];
  const seenIds = new Set();
  for (const url of ESPN_URLS) {
    try {
      const espnRes = await fetch(url);
      const espnData = await espnRes.json();
      for (const event of (espnData.events || [])) {
        if (seenIds.has(event.id)) continue;
        seenIds.add(event.id);
        const comp = event.competitions?.[0];
        if (!comp) continue;
        const status = comp.status?.type?.completed;
        if (!status) continue;

        const home = comp.competitors.find(c => c.homeAway === 'home');
        const away = comp.competitors.find(c => c.homeAway === 'away');
        if (!home || !away) continue;

        espnGames.push({
          homeName: home.team.displayName,
          homeAbbr: home.team.abbreviation,
          homeShort: home.team.shortDisplayName,
          homeScore: parseInt(home.score),
          awayName: away.team.displayName,
          awayAbbr: away.team.abbreviation,
          awayShort: away.team.shortDisplayName,
          awayScore: parseInt(away.score),
          winner: parseInt(home.score) > parseInt(away.score) ? 'home' : 'away',
        });
      }
    } catch (e) {
      console.error(`Warning: ESPN fetch failed for ${url}: ${e.message}`);
    }
  }

  const header = `🏀 NCAA MBB Variant B — Pick Grading — Feb 12, 2026`;
  const sep = '═'.repeat(90);

  console.log(`\n${header}`);
  console.log(sep);
  console.log(`Picks file: ${picksData.num_picks || picks.length} picks | ESPN games found: ${espnGames.length}`);
  console.log(`Avg edge: ${((picksData.avg_edge || 0) * 100).toFixed(1)}% | Max edge: ${((picksData.max_edge || 0) * 100).toFixed(1)}% | Total bet size: $${(picksData.total_bet_size || 0).toLocaleString()}\n`);

  // ── Grade each pick ──────────────────────────────────────
  let wins = 0, losses = 0, unmatched = 0;
  let totalWagered = 0, totalReturn = 0;
  const results = [];

  for (const pick of picks) {
    const game = findGame(pick, espnGames);
    const pickedSide = pick.side;
    const pickedTeam = pickedSide === 'home' ? pick.home_team : pick.away_team;
    const odds = pick.odds;
    const betSize = pick.bet_size_dollars;
    const edge = pick.edge;
    const modelProb = pick.model_prob;
    const impliedProb = pick.implied_prob;

    if (!game) {
      results.push({
        game: `${pick.away_team} @ ${pick.home_team}`,
        pick: pickedTeam,
        side: pickedSide,
        odds,
        edge,
        modelProb,
        impliedProb,
        betSize,
        result: '⚪ NO SCORE',
        won: null,
        profit: 0,
        score: null,
      });
      unmatched++;
      continue;
    }

    const won = game.winner === pickedSide;
    totalWagered += betSize;

    let profit = 0;
    if (won) {
      profit = odds > 0 ? betSize * (odds / 100) : betSize * (100 / Math.abs(odds));
      wins++;
    } else {
      profit = -betSize;
      losses++;
    }
    totalReturn += profit;

    results.push({
      game: `${game.awayName} @ ${game.homeName}`,
      score: `${game.awayScore}-${game.homeScore}`,
      pick: pickedTeam,
      side: pickedSide,
      odds,
      edge,
      modelProb,
      impliedProb,
      betSize,
      result: won ? '✅ WIN' : '❌ LOSS',
      won,
      profit: Math.round(profit),
    });
  }

  // ── Print results table ──────────────────────────────────
  const colHeader = `${'Game'.padEnd(45)} ${'Pick'.padEnd(18)} ${'Odds'.padStart(6)} ${'Edge'.padStart(7)} ${'Bet'.padStart(7)} ${'Score'.padStart(10)} ${'Result'.padStart(10)} ${'P/L'.padStart(8)}`;
  console.log(colHeader);
  console.log('─'.repeat(115));

  for (const r of results) {
    const gameStr = r.game.substring(0, 44).padEnd(45);
    const pickStr = r.pick.substring(0, 17).padEnd(18);
    const oddsStr = (r.odds > 0 ? `+${r.odds}` : `${r.odds}`).padStart(6);
    const edgeStr = `${(r.edge * 100).toFixed(1)}%`.padStart(7);
    const betStr = `$${r.betSize}`.padStart(7);
    const scoreStr = (r.score || 'N/A').padStart(10);
    const resultStr = r.result.padStart(10);
    const plStr = (r.profit >= 0 ? `+$${r.profit}` : `-$${Math.abs(r.profit)}`).padStart(8);
    console.log(`${gameStr} ${pickStr} ${oddsStr} ${edgeStr} ${betStr} ${scoreStr} ${resultStr} ${plStr}`);
  }

  console.log('─'.repeat(115));

  // ── Summary ──────────────────────────────────────────────
  const winPct = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0';
  const roi = totalWagered > 0 ? ((totalReturn / totalWagered) * 100).toFixed(1) : '0.0';
  const plFmt = totalReturn >= 0 ? `+$${Math.round(totalReturn).toLocaleString()}` : `-$${Math.abs(Math.round(totalReturn)).toLocaleString()}`;

  console.log(`\n📊 SUMMARY`);
  console.log(`  Record: ${wins}-${losses} (${winPct}%)`);
  console.log(`  Total Wagered: $${totalWagered.toLocaleString()}`);
  console.log(`  Net P/L: ${plFmt}`);
  console.log(`  ROI: ${roi}%`);
  if (unmatched > 0) {
    console.log(`  ⚠️  ${unmatched} picks could not be matched to ESPN scores`);
  }

  // ── Edge bucket breakdown ────────────────────────────────
  const graded = results.filter(r => r.won !== null);
  console.log(`\n📈 EDGE BUCKET BREAKDOWN`);
  const buckets = [
    { label: '10-20%', min: 0.10, max: 0.20 },
    { label: '20-30%', min: 0.20, max: 0.30 },
    { label: '30-40%', min: 0.30, max: 0.40 },
    { label: '40-50%', min: 0.40, max: 0.50 },
    { label: '50%+',   min: 0.50, max: 1.00 },
  ];
  console.log(`${'Edge'.padEnd(10)} ${'W-L'.padStart(7)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(10)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)}`);
  console.log('─'.repeat(54));

  for (const b of buckets) {
    const inB = graded.filter(r => r.edge >= b.min && r.edge < b.max);
    if (inB.length === 0) continue;
    const bW = inB.filter(r => r.won).length;
    const bL = inB.filter(r => !r.won).length;
    const bWag = inB.reduce((s, r) => s + r.betSize, 0);
    const bPL = inB.reduce((s, r) => s + r.profit, 0);
    const bRoi = bWag > 0 ? (bPL / bWag * 100) : 0;
    const plS = bPL >= 0 ? `+$${Math.round(bPL).toLocaleString()}` : `-$${Math.abs(Math.round(bPL)).toLocaleString()}`;
    console.log(
      `${b.label.padEnd(10)} ${(bW + '-' + bL).padStart(7)} ${((bW / (bW + bL)) * 100).toFixed(1).padStart(5)}% ` +
      `${('$' + bWag.toLocaleString()).padStart(10)} ${plS.padStart(10)} ${bRoi.toFixed(1).padStart(6)}%`
    );
  }

  // ── Odds bucket breakdown ────────────────────────────────
  console.log(`\n🎲 ODDS BUCKET BREAKDOWN`);
  const oddsBuckets = [
    { label: 'Big Fav (<-300)', test: o => o < -300 },
    { label: 'Fav (-300 to -150)', test: o => o >= -300 && o < -150 },
    { label: 'Sm Fav (-150 to -100)', test: o => o >= -150 && o < -100 },
    { label: "Pick'em (-100 to +100)", test: o => o >= -100 && o <= 100 },
    { label: 'Sm Dog (+101 to +150)', test: o => o > 100 && o <= 150 },
    { label: 'Dog (+151 to +300)', test: o => o > 150 && o <= 300 },
    { label: 'Big Dog (>+300)', test: o => o > 300 },
  ];
  console.log(`${'Bucket'.padEnd(24)} ${'W-L'.padStart(7)} ${'Win%'.padStart(6)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)}`);
  console.log('─'.repeat(58));
  for (const b of oddsBuckets) {
    const inB = graded.filter(r => b.test(r.odds));
    if (inB.length === 0) continue;
    const bW = inB.filter(r => r.won).length;
    const bL = inB.filter(r => !r.won).length;
    const bWag = inB.reduce((s, r) => s + r.betSize, 0);
    const bPL = inB.reduce((s, r) => s + r.profit, 0);
    const bRoi = bWag > 0 ? (bPL / bWag * 100) : 0;
    const plS = bPL >= 0 ? `+$${Math.round(bPL).toLocaleString()}` : `-$${Math.abs(Math.round(bPL)).toLocaleString()}`;
    console.log(
      `${b.label.padEnd(24)} ${(bW + '-' + bL).padStart(7)} ${((bW / (bW + bL)) * 100).toFixed(1).padStart(5)}% ` +
      `${plS.padStart(10)} ${bRoi.toFixed(1).padStart(6)}%`
    );
  }

  // ── Home vs Away ─────────────────────────────────────────
  console.log(`\n🏠 HOME vs AWAY`);
  for (const side of ['home', 'away']) {
    const sidePicks = graded.filter(r => r.side === side);
    if (sidePicks.length === 0) continue;
    const sW = sidePicks.filter(r => r.won).length;
    const sL = sidePicks.filter(r => !r.won).length;
    const sWag = sidePicks.reduce((s, r) => s + r.betSize, 0);
    const sPL = sidePicks.reduce((s, r) => s + r.profit, 0);
    const sRoi = sWag > 0 ? (sPL / sWag * 100) : 0;
    const plS = sPL >= 0 ? `+$${Math.round(sPL).toLocaleString()}` : `-$${Math.abs(Math.round(sPL)).toLocaleString()}`;
    console.log(`  ${side.toUpperCase().padEnd(6)} ${sW}-${sL} (${((sW / (sW + sL)) * 100).toFixed(1)}%)  P/L: ${plS}  ROI: ${sRoi.toFixed(1)}%`);
  }

  // ── Model Prob Calibration ───────────────────────────────
  console.log(`\n🎯 MODEL PROBABILITY CALIBRATION`);
  const calBuckets = [
    { label: '50-60%', min: 0.50, max: 0.60 },
    { label: '60-70%', min: 0.60, max: 0.70 },
    { label: '70-80%', min: 0.70, max: 0.80 },
    { label: '80-90%', min: 0.80, max: 0.90 },
    { label: '90%+',   min: 0.90, max: 1.01 },
  ];
  console.log(`${'Model Prob'.padEnd(12)} ${'Count'.padStart(6)} ${'W-L'.padStart(7)} ${'Actual%'.padStart(8)} ${'Calibration'.padStart(12)}`);
  console.log('─'.repeat(50));
  for (const b of calBuckets) {
    const inB = graded.filter(r => r.modelProb >= b.min && r.modelProb < b.max);
    if (inB.length === 0) continue;
    const bW = inB.filter(r => r.won).length;
    const bL = inB.filter(r => !r.won).length;
    const actual = bW / (bW + bL) * 100;
    const expected = (b.min + b.max) / 2 * 100;
    const diff = actual - expected;
    const arrow = diff > 5 ? '📈 OVER' : diff < -5 ? '📉 UNDER' : '✅ OK';
    console.log(
      `${b.label.padEnd(12)} ${String(bW + bL).padStart(6)} ${(bW + '-' + bL).padStart(7)} ${actual.toFixed(1).padStart(7)}% ${arrow.padStart(12)}`
    );
  }

  console.log(`\n${sep}`);
  console.log(`✅ Grading complete — ${graded.length} picks graded, ${unmatched} unmatched\n`);

  // ── Write JSON output ────────────────────────────────────
  const jsonReport = {
    date: '2026-02-12',
    model: 'Variant B',
    total_picks: picks.length,
    graded: graded.length,
    unmatched,
    wins,
    losses,
    win_pct: parseFloat(winPct),
    total_wagered: totalWagered,
    net_pl: Math.round(totalReturn),
    roi: parseFloat(roi),
    picks: results.map(r => ({
      game: r.game,
      pick: r.pick,
      side: r.side,
      odds: r.odds,
      edge: r.edge,
      model_prob: r.modelProb,
      implied_prob: r.impliedProb,
      bet_size: r.betSize,
      score: r.score || null,
      won: r.won,
      profit: r.profit,
    })),
  };
  const jsonPath = join(OUT_DIR, 'day_report_2026-02-12.json');
  writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  console.log(`📁 JSON → ${jsonPath}`);

  // ── Write Markdown output ────────────────────────────────
  let md = `# 🏀 NCAA MBB Variant B — Feb 12, 2026 Pick Report\n\n`;
  md += `**Record:** ${wins}-${losses} (${winPct}%)  \n`;
  md += `**Total Wagered:** $${totalWagered.toLocaleString()}  \n`;
  md += `**Net P/L:** ${plFmt}  \n`;
  md += `**ROI:** ${roi}%  \n`;
  md += `**Picks:** ${picks.length} | **Graded:** ${graded.length} | **Unmatched:** ${unmatched}  \n\n`;

  md += `## Pick-by-Pick Results\n\n`;
  md += `| Game | Pick | Odds | Edge | Bet | Score | Result | P/L |\n`;
  md += `|------|------|------|------|-----|-------|--------|-----|\n`;
  for (const r of results) {
    const oddsStr = r.odds > 0 ? `+${r.odds}` : `${r.odds}`;
    const plStr = r.profit >= 0 ? `+$${r.profit}` : `-$${Math.abs(r.profit)}`;
    md += `| ${r.game} | ${r.pick} | ${oddsStr} | ${(r.edge * 100).toFixed(1)}% | $${r.betSize} | ${r.score || 'N/A'} | ${r.result} | ${plStr} |\n`;
  }

  md += `\n## Summary\n\n`;
  md += `- **Avg Edge:** ${((picksData.avg_edge || 0) * 100).toFixed(1)}%\n`;
  md += `- **Max Edge:** ${((picksData.max_edge || 0) * 100).toFixed(1)}%\n`;
  md += `- **Home picks:** ${graded.filter(r => r.side === 'home').length} | **Away picks:** ${graded.filter(r => r.side === 'away').length}\n`;

  const mdPath = join(OUT_DIR, 'day_report_2026-02-12.md');
  writeFileSync(mdPath, md);
  console.log(`📁 MD  → ${mdPath}`);
}

main().catch(e => console.error(e));
