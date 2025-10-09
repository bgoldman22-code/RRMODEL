// NFL Injury Impact Analysis for Live Predictions
// Analyzes how current injury data affects spread, moneyline, and total predictions

import fs from 'fs/promises';

// Injury impact weights based on position and status
const INJURY_IMPACT_WEIGHTS = {
  QB: { out: -8.5, doubtful: -5.2, questionable: -2.1 },
  RB1: { out: -1.8, doubtful: -1.1, questionable: -0.6 },
  WR1: { out: -2.2, doubtful: -1.3, questionable: -0.7 },
  WR2: { out: -1.4, doubtful: -0.8, questionable: -0.4 },
  TE1: { out: -1.1, doubtful: -0.7, questionable: -0.3 },
  OL: { out: -1.5, doubtful: -0.9, questionable: -0.4 },  // per starter
  K: { out: -0.8, doubtful: -0.3, questionable: -0.1 }
};

// Load current injury data
async function loadCurrentInjuryData() {
  try {
    const data = JSON.parse(await fs.readFile('data/nfl/injuries/latest.json', 'utf8'));
    return data.teams;
  } catch (error) {
    console.error('Failed to load injury data:', error);
    return {};
  }
}

// Calculate total injury impact for a team
function calculateTeamInjuryImpact(teamData) {
  let totalImpact = 0;
  let impactBreakdown = {};
  
  // QB Impact (most critical)
  if (teamData.qb_status !== 'active') {
    const qbImpact = INJURY_IMPACT_WEIGHTS.QB[teamData.qb_status] || 0;
    totalImpact += qbImpact;
    impactBreakdown.QB = {
      player: teamData.qb_name,
      status: teamData.qb_status,
      impact: qbImpact
    };
  }
  
  // Skill position impacts
  ['rb_injuries', 'wr_injuries', 'te_injuries'].forEach(posType => {
    const injuries = teamData[posType] || [];
    injuries.forEach((injury, index) => {
      if (injury.status !== 'active') {
        let posKey = posType.replace('_injuries', '').toUpperCase();
        if (index === 0) posKey += '1'; // Primary player
        else if (index === 1 && posKey === 'WR') posKey += '2'; // Secondary WR
        
        const impact = INJURY_IMPACT_WEIGHTS[posKey]?.[injury.status] || 
                      INJURY_IMPACT_WEIGHTS[posKey.replace(/\d/, '')]?.[injury.status] || 0;
        
        if (impact !== 0) {
          totalImpact += impact;
          impactBreakdown[`${posKey}_${injury.name}`] = {
            player: injury.name,
            status: injury.status,
            impact: impact
          };
        }
      }
    });
  });
  
  // Offensive line impact
  const olOut = teamData.ol_starters_out || 0;
  if (olOut > 0) {
    const olImpact = olOut * INJURY_IMPACT_WEIGHTS.OL.out;
    totalImpact += olImpact;
    impactBreakdown.OL = {
      players: `${olOut} starters`,
      status: 'out',
      impact: olImpact
    };
  }
  
  // Kicker impact
  if (teamData.kicker_status !== 'active') {
    const kImpact = INJURY_IMPACT_WEIGHTS.K[teamData.kicker_status] || 0;
    totalImpact += kImpact;
    impactBreakdown.K = {
      status: teamData.kicker_status,
      impact: kImpact
    };
  }
  
  return {
    totalImpact: Math.round(totalImpact * 10) / 10,
    breakdown: impactBreakdown
  };
}

// Simulate game prediction adjustments
function simulateGameAdjustments(homeTeam, awayTeam, homeInjuries, awayInjuries) {
  const homeImpact = calculateTeamInjuryImpact(homeInjuries);
  const awayImpact = calculateTeamInjuryImpact(awayInjuries);
  
  // Net impact on spread (positive = helps home team, negative = helps away team)
  const spreadAdjustment = awayImpact.totalImpact - homeImpact.totalImpact;
  
  // Total points adjustment (both teams' negative impacts reduce total)
  const totalAdjustment = -(Math.abs(homeImpact.totalImpact) + Math.abs(awayImpact.totalImpact)) * 0.6;
  
  // Moneyline adjustment (convert spread adjustment to ML shift)
  let mlAdjustment = 0;
  if (Math.abs(spreadAdjustment) > 1) {
    mlAdjustment = spreadAdjustment * 15; // Rough conversion: 1 point = ~15 ML points
  }
  
  return {
    homeTeam,
    awayTeam,
    homeImpact,
    awayImpact,
    adjustments: {
      spread: Math.round(spreadAdjustment * 10) / 10,
      total: Math.round(totalAdjustment * 10) / 10,
      moneyline: Math.round(mlAdjustment)
    }
  };
}

// Analyze current Week 4 games
async function analyzeCurrentInjuryImpacts() {
  console.log('🏥 NFL INJURY IMPACT ANALYSIS - Week 4 2025');
  console.log('='.repeat(60));
  
  const injuryData = await loadCurrentInjuryData();
  
  if (Object.keys(injuryData).length === 0) {
    console.log('❌ No injury data available');
    return;
  }
  
  console.log(`📊 Analyzing injury impacts for ${Object.keys(injuryData).length} teams`);
  console.log(`📅 Data as of: ${new Date().toLocaleString()}`);
  
  // Sample Week 4 games (in production, this would come from schedule API)
  const week4Games = [
    { home: 'ATL', away: 'WAS' },  // Jayden Daniels out
    { home: 'SF', away: 'JAX' },   // Brock Purdy/Mac Jones uncertainty
    { home: 'TB', away: 'PHI' },   // Mike Evans out
    { home: 'HOU', away: 'CIN' },  // Joe Burrow out
    { home: 'BUF', away: 'NO' }    // Buffalo defensive injuries
  ];
  
  console.log('\n🎯 GAME-BY-GAME INJURY IMPACT ANALYSIS:');
  console.log('='.repeat(60));
  
  let totalGamesAnalyzed = 0;
  let significantImpactGames = 0;
  
  for (const game of week4Games) {
    const homeInjuries = injuryData[game.home];
    const awayInjuries = injuryData[game.away];
    
    if (!homeInjuries || !awayInjuries) {
      console.log(`⚠️ ${game.away} @ ${game.home}: Missing injury data`);
      continue;
    }
    
    const analysis = simulateGameAdjustments(
      game.home, 
      game.away, 
      homeInjuries, 
      awayInjuries
    );
    
    totalGamesAnalyzed++;
    
    console.log(`\n🏈 ${analysis.awayTeam} @ ${analysis.homeTeam}`);
    console.log('-'.repeat(30));
    
    // Show significant injuries
    if (Object.keys(analysis.homeImpact.breakdown).length > 0) {
      console.log(`🏠 ${analysis.homeTeam} injuries:`);
      Object.entries(analysis.homeImpact.breakdown).forEach(([pos, data]) => {
        const impact = data.impact;
        const icon = impact <= -3 ? '🚨' : impact <= -1 ? '⚠️' : '📝';
        console.log(`   ${icon} ${data.player || pos}: ${data.status} (${impact > 0 ? '+' : ''}${impact})`);
      });
    }
    
    if (Object.keys(analysis.awayImpact.breakdown).length > 0) {
      console.log(`✈️ ${analysis.awayTeam} injuries:`);
      Object.entries(analysis.awayImpact.breakdown).forEach(([pos, data]) => {
        const impact = data.impact;
        const icon = impact <= -3 ? '🚨' : impact <= -1 ? '⚠️' : '📝';
        console.log(`   ${icon} ${data.player || pos}: ${data.status} (${impact > 0 ? '+' : ''}${impact})`);
      });
    }
    
    // Show prediction adjustments
    const adj = analysis.adjustments;
    console.log('\n📊 Predicted adjustments:');
    
    if (Math.abs(adj.spread) >= 0.5) {
      const direction = adj.spread > 0 ? `${analysis.homeTeam} +${adj.spread}` : `${analysis.awayTeam} +${Math.abs(adj.spread)}`;
      console.log(`   📏 Spread: ${direction} points`);
    } else {
      console.log('   📏 Spread: No significant change');
    }
    
    if (Math.abs(adj.total) >= 1) {
      console.log(`   🎲 Total: ${adj.total > 0 ? '+' : ''}${adj.total} points`);
    } else {
      console.log('   🎲 Total: No significant change');
    }
    
    if (Math.abs(adj.moneyline) >= 10) {
      const mlDirection = adj.moneyline > 0 ? analysis.homeTeam : analysis.awayTeam;
      console.log(`   💰 Moneyline: ${mlDirection} ${Math.abs(adj.moneyline)} points better`);
    } else {
      console.log('   💰 Moneyline: No significant change');
    }
    
    // Track significant impact games
    if (Math.abs(adj.spread) >= 1.5 || Math.abs(adj.total) >= 2.5) {
      significantImpactGames++;
      console.log('   🔥 SIGNIFICANT INJURY IMPACT GAME');
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📈 INJURY IMPACT SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`Games analyzed: ${totalGamesAnalyzed}`);
  console.log(`Significant impact games: ${significantImpactGames}`);
  console.log(`Impact rate: ${totalGamesAnalyzed > 0 ? Math.round(significantImpactGames/totalGamesAnalyzed*100) : 0}%`);
  
  // Highlight most impactful injuries
  console.log('\n🚨 HIGHEST IMPACT INJURIES THIS WEEK:');
  
  const allImpacts = [];
  for (const team in injuryData) {
    const impact = calculateTeamInjuryImpact(injuryData[team]);
    if (impact.totalImpact < -2) {
      allImpacts.push({
        team,
        impact: impact.totalImpact,
        keyInjuries: Object.values(impact.breakdown)
          .filter(inj => inj.impact <= -2)
          .map(inj => `${inj.player || 'Starters'} (${inj.status})`)
      });
    }
  }
  
  allImpacts.sort((a, b) => a.impact - b.impact);
  
  allImpacts.slice(0, 5).forEach((teamImpact, idx) => {
    console.log(`${idx + 1}. ${teamImpact.team}: ${teamImpact.impact} total impact`);
    console.log(`   Key injuries: ${teamImpact.keyInjuries.join(', ')}`);
  });
  
  console.log('\n✅ Injury impact analysis complete');
  console.log('🔄 This data automatically feeds into live prediction adjustments');
}

// Run the analysis
analyzeCurrentInjuryImpacts().catch(console.error);