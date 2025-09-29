// MNF GAMES INJURY DEBUG - Detailed Player Analysis
// Shows each injured player and overall impact for NYJ @ MIA and CIN @ DEN

async function debugMNFGamesInjuries() {
  console.log('🏈 MNF GAMES INJURY DEBUG - DETAILED ANALYSIS');
  console.log('📅 September 29, 2025 - NYJ @ MIA and CIN @ DEN');
  console.log('=' .repeat(70));
  
  try {
    // First, let's get the raw injury data
    console.log('\n📊 STEP 1: Raw injury data analysis...');
    
    const injuryResponse = await fetch('https://bgroundrobin.com/data/nfl/injuries/latest.json');
    const injuryData = await injuryResponse.json();
    
    console.log(`🔄 Injury data timestamp: ${injuryData.asOf}`);
    
    // Check each MNF team for injuries
    const mnfTeams = ['NYJ', 'MIA', 'CIN', 'DEN'];
    const teamNames = {
      'NYJ': 'New York Jets',
      'MIA': 'Miami Dolphins', 
      'CIN': 'Cincinnati Bengals',
      'DEN': 'Denver Broncos'
    };
    
    mnfTeams.forEach(team => {
      console.log(`\n🏟️ ${teamNames[team]} (${team}):`);
      const teamData = injuryData.teams[team];
      
      if (!teamData) {
        console.log('   ❌ No injury data found');
        return;
      }
      
      // QB Status
      console.log(`   🎯 QB: ${teamData.qb_name} - ${teamData.qb_status.toUpperCase()}`);
      
      // RB Injuries
      const rbInjuries = teamData.rb_injuries || [];
      if (rbInjuries.length > 0) {
        console.log(`   🏃 RB Injuries (${rbInjuries.length}):`);
        rbInjuries.forEach(rb => {
          const statusEmoji = rb.status === 'out' ? '🚫' : rb.status === 'doubtful' ? '❌' : rb.status === 'questionable' ? '❓' : '✅';
          console.log(`     ${statusEmoji} ${rb.name} (Depth ${rb.depth}) - ${rb.status.toUpperCase()}`);
        });
      } else {
        console.log('   🏃 RB: No injuries reported');
      }
      
      // WR Injuries  
      const wrInjuries = teamData.wr_injuries || [];
      if (wrInjuries.length > 0) {
        console.log(`   🎯 WR Injuries (${wrInjuries.length}):`);
        wrInjuries.forEach(wr => {
          const statusEmoji = wr.status === 'out' ? '🚫' : wr.status === 'doubtful' ? '❌' : wr.status === 'questionable' ? '❓' : '✅';
          console.log(`     ${statusEmoji} ${wr.name} (Depth ${wr.depth}) - ${wr.status.toUpperCase()}`);
        });
      } else {
        console.log('   🎯 WR: No injuries reported');
      }
      
      // TE Injuries
      const teInjuries = teamData.te_injuries || [];
      if (teInjuries.length > 0) {
        console.log(`   🎯 TE Injuries (${teInjuries.length}):`);
        teInjuries.forEach(te => {
          const statusEmoji = te.status === 'out' ? '🚫' : te.status === 'doubtful' ? '❌' : te.status === 'questionable' ? '❓' : '✅';
          console.log(`     ${statusEmoji} ${te.name} (Depth ${te.depth}) - ${te.status.toUpperCase()}`);
        });
      } else {
        console.log('   🎯 TE: No injuries reported');
      }
      
      // Other injuries
      const olOut = teamData.ol_starters_out || 0;
      const dbOut = teamData.db_starters_out || 0;
      if (olOut > 0) console.log(`   🛡️ O-Line: ${olOut} starters out`);
      if (dbOut > 0) console.log(`   🛡️ Secondary: ${dbOut} starters out`);
      
      if (teamData.kicker_status !== 'active') console.log(`   🦵 K: ${teamData.kicker_status.toUpperCase()}`);
      if (teamData.punter_status !== 'active') console.log(`   🦵 P: ${teamData.punter_status.toUpperCase()}`);
      if (teamData.returner_status !== 'active') console.log(`   🔄 KR/PR: ${teamData.returner_status.toUpperCase()}`);
    });
    
    // Now test the prediction system with both games
    console.log('\n📊 STEP 2: Prediction system injury integration...');
    
    const testRequest = {
      debug: true,
      includeInjuries: true,
      games: [
        { away: 'NYJ', home: 'MIA' },
        { away: 'CIN', home: 'DEN' }
      ]
    };
    
    const predResponse = await fetch('/.netlify/functions/nfl-predictions-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testRequest)
    });
    
    if (!predResponse.ok) {
      console.log('❌ Prediction endpoint failed:', predResponse.status);
      return;
    }
    
    const predData = await predResponse.json();
    console.log('✅ Prediction endpoint successful');
    
    // Analyze each game prediction
    const predictions = predData.predictions || [];
    
    predictions.forEach((pred, idx) => {
      const gameLabel = `${pred.away_team} @ ${pred.home_team}`;
      console.log(`\n🏈 GAME ${idx + 1}: ${gameLabel}`);
      console.log('=' .repeat(50));
      
      // Check home team injury impact
      if (pred.teamStats?.home?.injuryImpact) {
        const homeInjury = pred.teamStats.home.injuryImpact;
        console.log(`\n🏠 ${pred.home_team} (HOME) Injury Analysis:`);
        console.log(`   📊 Total Impact: ${homeInjury.totalImpact} points`);
        console.log(`   🎯 Confidence Adjustment: ${(homeInjury.confidence * 100).toFixed(1)}%`);
        console.log(`   🔧 Baseline Correction: ${homeInjury.baselineCorrection}`);
        
        if (homeInjury.adjustments && homeInjury.adjustments.length > 0) {
          console.log(`   📋 Individual Adjustments (${homeInjury.adjustments.length}):`);
          homeInjury.adjustments.forEach(adj => {
            const impactStr = adj.impact > 0 ? `+${adj.impact.toFixed(1)}` : adj.impact.toFixed(1);
            console.log(`     • ${adj.name || adj.player || 'Unknown'} (${adj.position}) - ${adj.status}: ${impactStr} pts`);
            if (adj.reason) console.log(`       Reason: ${adj.reason}`);
          });
        } else {
          console.log('   ✅ No individual injury adjustments');
        }
      } else {
        console.log(`\n🏠 ${pred.home_team} (HOME): No injury analysis data`);
      }
      
      // Check away team injury impact
      if (pred.teamStats?.away?.injuryImpact) {
        const awayInjury = pred.teamStats.away.injuryImpact;
        console.log(`\n✈️ ${pred.away_team} (AWAY) Injury Analysis:`);
        console.log(`   📊 Total Impact: ${awayInjury.totalImpact} points`);
        console.log(`   🎯 Confidence Adjustment: ${(awayInjury.confidence * 100).toFixed(1)}%`);
        console.log(`   🔧 Baseline Correction: ${awayInjury.baselineCorrection}`);
        
        if (awayInjury.adjustments && awayInjury.adjustments.length > 0) {
          console.log(`   📋 Individual Adjustments (${awayInjury.adjustments.length}):`);
          awayInjury.adjustments.forEach(adj => {
            const impactStr = adj.impact > 0 ? `+${adj.impact.toFixed(1)}` : adj.impact.toFixed(1);
            console.log(`     • ${adj.name || adj.player || 'Unknown'} (${adj.position}) - ${adj.status}: ${impactStr} pts`);
            if (adj.reason) console.log(`       Reason: ${adj.reason}`);
          });
        } else {
          console.log('   ✅ No individual injury adjustments');
        }
      } else {
        console.log(`\n✈️ ${pred.away_team} (AWAY): No injury analysis data`);
      }
      
      // Show net injury impact on predictions
      const homeImpact = pred.teamStats?.home?.injuryImpact?.totalImpact || 0;
      const awayImpact = pred.teamStats?.away?.injuryImpact?.totalImpact || 0;
      const netImpact = homeImpact - awayImpact;
      
      console.log(`\n💰 NET INJURY IMPACT ON BETTING:`);
      console.log(`   🏠 Home Impact: ${homeImpact > 0 ? '+' : ''}${homeImpact.toFixed(1)} points`);
      console.log(`   ✈️ Away Impact: ${awayImpact > 0 ? '+' : ''}${awayImpact.toFixed(1)} points`);
      console.log(`   ⚖️ Net Impact: ${netImpact > 0 ? '+' : ''}${netImpact.toFixed(1)} points favoring ${netImpact > 0 ? 'HOME' : 'AWAY'}`);
      
      if (Math.abs(netImpact) >= 1.0) {
        console.log(`   🚨 SIGNIFICANT INJURY IMPACT: ${Math.abs(netImpact).toFixed(1)} points`);
        console.log(`   📈 This should affect spread by ~${(Math.abs(netImpact) * 0.3).toFixed(1)} points`);
      } else if (Math.abs(netImpact) >= 0.5) {
        console.log(`   ⚠️ MODERATE INJURY IMPACT: ${Math.abs(netImpact).toFixed(1)} points`);
      } else {
        console.log(`   ✅ MINIMAL INJURY IMPACT: ${Math.abs(netImpact).toFixed(1)} points`);
      }
      
      // Show current predictions
      console.log(`\n📊 CURRENT PREDICTIONS:`);
      console.log(`   ML: ${pred.predictions?.moneyline?.pick} (${pred.predictions?.moneyline?.confidence}% conf)`);
      console.log(`   Spread: ${pred.predictions?.spread?.pick} ${pred.predictions?.spread?.line} (${pred.predictions?.spread?.confidence}% conf)`);
      console.log(`   Total: ${pred.predictions?.total?.pick} ${pred.predictions?.total?.line} (${pred.predictions?.total?.confidence}% conf)`);
    });
    
    // Overall system status
    console.log('\n📊 SYSTEM INJURY INTEGRATION STATUS:');
    if (predData.injuryIntegrationStatus) {
      console.log(predData.injuryIntegrationStatus);
    }
    
    console.log('\n📋 SUMMARY & RECOMMENDATIONS:');
    console.log('=' .repeat(50));
    
    let totalGamesWithImpact = 0;
    let maxImpact = 0;
    
    predictions.forEach(pred => {
      const homeImpact = Math.abs(pred.teamStats?.home?.injuryImpact?.totalImpact || 0);
      const awayImpact = Math.abs(pred.teamStats?.away?.injuryImpact?.totalImpact || 0);
      const gameMaxImpact = Math.max(homeImpact, awayImpact);
      
      if (gameMaxImpact >= 0.5) totalGamesWithImpact++;
      maxImpact = Math.max(maxImpact, gameMaxImpact);
    });
    
    console.log(`🎯 Games with meaningful injury impact: ${totalGamesWithImpact}/${predictions.length}`);
    console.log(`📈 Maximum single-team impact: ${maxImpact.toFixed(1)} points`);
    
    if (totalGamesWithImpact === 0) {
      console.log('⚠️ NO SIGNIFICANT INJURIES DETECTED for MNF games');
      console.log('   • This could be accurate (healthy teams)');
      console.log('   • Or injury data source may be missing key players');
      console.log('   • Check official injury reports for discrepancies');
    } else {
      console.log('✅ INJURY SYSTEM IS DETECTING AND APPLYING IMPACTS');
      console.log('   • Review individual adjustments above');
      console.log('   • Consider injury impact in your betting decisions');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Auto-run the debug
console.log('🚀 Starting MNF games injury debug...\n');
debugMNFGamesInjuries().then(() => {
  console.log('\n✅ MNF injury debug complete!');
  console.log('💡 Use this analysis to understand injury impacts on your MNF bets');
}).catch(err => {
  console.error('💥 Debug failed:', err);
});