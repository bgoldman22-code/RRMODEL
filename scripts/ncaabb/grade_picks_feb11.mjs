#!/usr/bin/env node
/**
 * Grade NCAA MBB Picks for Feb 11, 2026
 * Fetches picks from GitHub + scores from ESPN, grades ML picks
 */

const PICKS_URL = 'https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_2026-02-11.json';
// ESPN dates games by tipoff date in UTC — many Feb 11 evening games show as Feb 12 in ESPN
const ESPN_URLS = [
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=20260211&limit=300&groups=50',
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=20260212&limit=300&groups=50',
];

async function main() {
  // Fetch picks
  const picksRes = await fetch(PICKS_URL);
  const picksData = await picksRes.json();
  const picks = picksData.picks;

  // Fetch ESPN scores from both date windows
  const espnGames = [];
  for (const url of ESPN_URLS) {
    const espnRes = await fetch(url);
    const espnData = await espnRes.json();
    for (const event of (espnData.events || [])) {
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
  }

  console.log(`\n🏀 NCAA MBB Pick Grading — Feb 11, 2026`);
  console.log(`${'='.repeat(90)}`);
  console.log(`Picks: ${picks.length} | ESPN games found: ${espnGames.length}\n`);

  // Normalize team name for fuzzy matching
  function normalize(name) {
    return name.toLowerCase()
      .replace(/\./g, '')
      .replace(/['']/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Extract key words from a team name for matching
  function keyWords(name) {
    const n = normalize(name);
    // Remove common suffixes that differ between sources
    const stripped = n
      .replace(/(leopards|greyhounds|paladins|bears|governors|royals|wolves|lions|lobos|antelopes|eagles|mountain hawks|dolphins|hatters|bulls|cardinals|flames|aggies|monarchs|thundering herd|coyotes|fighting hawks|yellow jackets|demon deacons|bluejays|bisons|colonels|terriers|blue demons|falcons|huskies|owls|tigers|hokies|gators|bulldogs|buffaloes|red raiders|wildcats|wolverines|golden)$/g, '')
      .trim();
    return stripped.split(' ').filter(w => w.length > 2);
  }

  // Try to match a pick's team to ESPN game
  function findGame(pick) {
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

      // Method 2: Key word overlap (at least 1 key word from each team matches)
      const espnHomeKeys = keyWords(g.homeName);
      const espnAwayKeys = keyWords(g.awayName);
      const homeOverlap = homeKeys.some(k => espnHomeKeys.includes(k) || espnHome.includes(k));
      const awayOverlap = awayKeys.some(k => espnAwayKeys.includes(k) || espnAway.includes(k));
      if (homeOverlap && awayOverlap) return g;
    }
    return null;
  }

  let wins = 0, losses = 0, unmatched = 0;
  let totalWagered = 0, totalReturn = 0;
  const results = [];

  for (const pick of picks) {
    const game = findGame(pick);
    const pickedSide = pick.side; // 'home' or 'away'
    const pickedTeam = pickedSide === 'home' ? pick.home_team : pick.away_team;
    const odds = pick.odds;
    const betSize = pick.bet_size_dollars;
    const edge = (pick.edge * 100).toFixed(1);

    if (!game) {
      results.push({
        game: `${pick.away_team} @ ${pick.home_team}`,
        pick: pickedTeam,
        odds,
        edge,
        betSize,
        result: '⚪ NO SCORE',
        profit: 0,
      });
      unmatched++;
      continue;
    }

    const actualWinner = game.winner;
    const won = actualWinner === pickedSide;
    totalWagered += betSize;

    let profit = 0;
    if (won) {
      if (odds > 0) {
        profit = betSize * (odds / 100);
      } else {
        profit = betSize * (100 / Math.abs(odds));
      }
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
      betSize,
      result: won ? '✅ WIN' : '❌ LOSS',
      profit: Math.round(profit),
    });
  }

  // Print results table
  console.log(`${'Game'.padEnd(45)} ${'Pick'.padEnd(18)} ${'Odds'.padStart(6)} ${'Edge'.padStart(6)} ${'Bet'.padStart(6)} ${'Score'.padStart(10)} ${'Result'.padStart(10)} ${'P/L'.padStart(8)}`);
  console.log('-'.repeat(115));

  for (const r of results) {
    const gameStr = r.game.substring(0, 44).padEnd(45);
    const pickStr = r.pick.substring(0, 17).padEnd(18);
    const oddsStr = (r.odds > 0 ? `+${r.odds}` : `${r.odds}`).padStart(6);
    const edgeStr = `${r.edge}%`.padStart(6);
    const betStr = `$${r.betSize}`.padStart(6);
    const scoreStr = (r.score || 'N/A').padStart(10);
    const resultStr = r.result.padStart(10);
    const plStr = (r.profit >= 0 ? `+$${r.profit}` : `-$${Math.abs(r.profit)}`).padStart(8);
    console.log(`${gameStr} ${pickStr} ${oddsStr} ${edgeStr} ${betStr} ${scoreStr} ${resultStr} ${plStr}`);
  }

  console.log('-'.repeat(115));
  console.log(`\n📊 SUMMARY`);
  console.log(`  Record: ${wins}-${losses} (${((wins/(wins+losses))*100).toFixed(1)}%)`);
  console.log(`  Total Wagered: $${totalWagered.toLocaleString()}`);
  console.log(`  Net P/L: ${totalReturn >= 0 ? '+' : ''}$${Math.round(totalReturn).toLocaleString()}`);
  console.log(`  ROI: ${((totalReturn / totalWagered) * 100).toFixed(1)}%`);
  if (unmatched > 0) {
    console.log(`  ⚠️  ${unmatched} picks could not be matched to ESPN scores (smaller conferences)`);
  }
  console.log();
}

main().catch(e => console.error(e));
