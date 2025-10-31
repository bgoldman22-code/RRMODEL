import { readFile } from 'fs/promises';

const PICKS_CSV = '/Users/brentgoldman/Downloads/nba-picks-2025-10-30.csv';
const BOXSCORES = '/tmp/player-boxscores-2024.json';

async function main() {
  console.log('🔍 ANALYZING PLAYER ROLE PATTERNS IN HIGH-EDGE PICKS\n');
  
  // Load picks
  const csvData = await readFile(PICKS_CSV, 'utf-8');
  const lines = csvData.split('\n').slice(1);
  
  const picks = lines.filter(l => l.trim()).map(line => {
    const parts = line.split(',');
    return {
      player: parts[0],
      prop: parts[1],
      line: parseFloat(parts[2]),
      pick: parts[3],
      predicted: parseFloat(parts[4]),
      edge: parseFloat(parts[6]),
      confidence: parseFloat(parts[7])
    };
  });
  
  // Load historical boxscores
  const boxscoresData = await readFile(BOXSCORES, 'utf-8');
  const boxscores = JSON.parse(boxscoresData);
  
  // Get high-edge picks (>15%)
  const highEdgePicks = picks.filter(p => p.edge >= 15).slice(0, 30);
  
  console.log(`Analyzing ${highEdgePicks.length} high-edge picks (>15%)\n`);
  console.log('=' .repeat(100));
  
  for (const pick of highEdgePicks) {
    // Get player's last 10 games
    const playerGames = boxscores
      .filter(b => b.playerName === pick.player)
      .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate))
      .slice(0, 10);
    
    if (playerGames.length === 0) {
      console.log(`\n❌ ${pick.player} - NO HISTORICAL DATA`);
      continue;
    }
    
    // Calculate minute variance
    const minutes = playerGames.map(g => {
      const mins = g.minutes;
      if (!mins || mins === 'DNP' || mins === 'NWT') return 0;
      const minsStr = String(mins);
      if (minsStr.includes(':')) {
        const [m, s] = minsStr.split(':').map(Number);
        return m + s/60;
      }
      return parseFloat(mins) || 0;
    }).filter(m => m > 0);
    
    const avgMinutes = minutes.reduce((a, b) => a + b, 0) / minutes.length;
    const minStdev = Math.sqrt(minutes.reduce((sq, n) => sq + Math.pow(n - avgMinutes, 2), 0) / minutes.length);
    const coefficientOfVariation = (minStdev / avgMinutes) * 100;
    
    // Get stat variance for the prop type
    const statKey = pick.prop.includes('rebounds') ? 'rebounds' : 'assists';
    const statValues = playerGames.map(g => g[statKey] || 0);
    const avgStat = statValues.reduce((a, b) => a + b, 0) / statValues.length;
    const statStdev = Math.sqrt(statValues.reduce((sq, n) => sq + Math.pow(n - avgStat, 2), 0) / statValues.length);
    const statCV = (statStdev / avgStat) * 100;
    
    // Calculate consistency (% of games within 1 of average)
    const withinOne = statValues.filter(v => Math.abs(v - avgStat) <= 1).length;
    const consistency = (withinOne / statValues.length) * 100;
    
    // Determine role
    let role = '';
    if (avgMinutes > 32) role = '⭐ STARTER';
    else if (avgMinutes > 24) role = '🔄 6TH MAN';
    else if (avgMinutes > 15) role = '📊 ROTATION';
    else role = '⚠️  BENCH';
    
    let volatility = '';
    if (coefficientOfVariation > 30) volatility = '🔴 HIGH VARIANCE';
    else if (coefficientOfVariation > 20) volatility = '🟡 MED VARIANCE';
    else volatility = '🟢 STABLE';
    
    console.log(`\n${pick.player}`);
    console.log(`  Prop: ${pick.prop} ${pick.pick} ${pick.line} | Edge: ${pick.edge}% | Predicted: ${pick.predicted}`);
    console.log(`  Role: ${role} | ${volatility}`);
    console.log(`  Minutes: ${avgMinutes.toFixed(1)} ± ${minStdev.toFixed(1)} (CV: ${coefficientOfVariation.toFixed(1)}%)`);
    console.log(`  ${statKey}: ${avgStat.toFixed(1)} ± ${statStdev.toFixed(1)} (CV: ${statCV.toFixed(1)}%) | Consistency: ${consistency.toFixed(0)}%`);
    console.log(`  L10 ${statKey}: ${statValues.join(', ')}`);
  }
  
  console.log('\n' + '=' .repeat(100));
  console.log('\n📊 THEORY TESTING:\n');
  
  // Group by role and volatility
  const roleGroups = { starter: [], sixthMan: [], rotation: [], bench: [] };
  const volatilityGroups = { high: [], med: [], stable: [] };
  
  for (const pick of highEdgePicks) {
    const playerGames = boxscores
      .filter(b => b.playerName === pick.player)
      .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate))
      .slice(0, 10);
    
    if (playerGames.length === 0) continue;
    
    const minutes = playerGames.map(g => {
      const mins = g.minutes;
      if (!mins || mins === 'DNP' || mins === 'NWT') return 0;
      const minsStr = String(mins);
      if (minsStr.includes(':')) {
        const [m, s] = minsStr.split(':').map(Number);
        return m + s/60;
      }
      return parseFloat(mins) || 0;
    }).filter(m => m > 0);
    
    const avgMinutes = minutes.reduce((a, b) => a + b, 0) / minutes.length;
    const minStdev = Math.sqrt(minutes.reduce((sq, n) => sq + Math.pow(n - avgMinutes, 2), 0) / minutes.length);
    const cv = (minStdev / avgMinutes) * 100;
    
    // Categorize
    if (avgMinutes > 32) roleGroups.starter.push(pick.player);
    else if (avgMinutes > 24) roleGroups.sixthMan.push(pick.player);
    else if (avgMinutes > 15) roleGroups.rotation.push(pick.player);
    else roleGroups.bench.push(pick.player);
    
    if (cv > 30) volatilityGroups.high.push(pick.player);
    else if (cv > 20) volatilityGroups.med.push(pick.player);
    else volatilityGroups.stable.push(pick.player);
  }
  
  console.log('BY ROLE:');
  console.log(`  ⭐ Starters (>32 min): ${roleGroups.starter.length} players`);
  console.log(`  🔄 6th Men (24-32 min): ${roleGroups.sixthMan.length} players`);
  console.log(`  📊 Rotation (15-24 min): ${roleGroups.rotation.length} players`);
  console.log(`  ⚠️  Bench (<15 min): ${roleGroups.bench.length} players`);
  
  console.log('\nBY MINUTE VOLATILITY:');
  console.log(`  🔴 High Variance (CV >30%): ${volatilityGroups.high.length} players`);
  console.log(`  🟡 Med Variance (CV 20-30%): ${volatilityGroups.med.length} players`);
  console.log(`  🟢 Stable (CV <20%): ${volatilityGroups.stable.length} players`);
  
  console.log('\n💡 HYPOTHESIS:');
  console.log('If high-edge picks are failing due to unpredictable roles/minutes:');
  console.log('  → Expect MORE rotation/bench players in high-edge picks');
  console.log('  → Expect MORE high-variance players');
  console.log('  → Expect LESS consistency in stat production\n');
}

main().catch(console.error);
