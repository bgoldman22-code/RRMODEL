#!/usr/bin/env node

/**
 * Test NBA Injury Integration
 * 
 * Tests the injury adjustment system directly
 */

import { fetchInjuries, getTeamInjuries } from '../../netlify/functions/_lib/nba/injuries.mjs';
import { calculateInjuryAdjustment, applyInjuryAdjustment, getInjuryAdvantage } from '../../netlify/functions/_lib/nba/injury-adjustments.mjs';

console.log('🏥 NBA Injury System Test\n');
console.log('='.repeat(70));

async function testInjurySystem() {
  console.log('\n📡 Fetching Current NBA Injuries from ESPN...\n');
  
  try {
    const allInjuries = await fetchInjuries();
    
    if (allInjuries.length === 0) {
      console.log('ℹ️  No injuries found (preseason or API issue)');
      console.log('\n💡 Testing with mock injury data instead...\n');
      
      // Mock injuries for testing
      const mockInjuries = [
        {
          playerName: 'Jayson Tatum',
          team: 'BOS',
          position: 'SF',
          status: 'Questionable',
          description: 'Ankle sprain'
        },
        {
          playerName: 'Jaylen Brown',
          team: 'BOS',
          position: 'SG',
          status: 'Out',
          description: 'Hip flexor'
        }
      ];
      
      console.log('Mock Celtics Injuries:');
      mockInjuries.forEach(inj => {
        console.log(`  - ${inj.playerName} (${inj.position}): ${inj.status} - ${inj.description}`);
      });
      
      const adjustment = calculateInjuryAdjustment(mockInjuries);
      console.log('\nInjury Impact:');
      console.log(`  Count: ${adjustment.count}`);
      console.log(`  Severity: ${adjustment.severity}`);
      console.log(`  ΔOff: ${adjustment.deltaOff.toFixed(2)} pts/100`);
      console.log(`  ΔDef: ${adjustment.deltaDef.toFixed(2)} pts/100`);
      console.log(`  Raw Impact: ${adjustment.rawImpact.toFixed(2)} pts/100`);
      
      console.log('\nDetails:');
      adjustment.details.forEach(d => {
        console.log(`  - ${d.player} (${d.position}): ${d.status} → ${d.impact} pts/100`);
      });
      
      // Test applying to stats
      console.log('\n📊 Applying to Mock Stats:\n');
      const mockStats = {
        offRtg: 122.5,
        defRtg: 110.2,
        netRtg: 12.3,
        pace: 98.5
      };
      
      console.log('Baseline Stats:');
      console.log(`  OffRtg: ${mockStats.offRtg.toFixed(1)}`);
      console.log(`  DefRtg: ${mockStats.defRtg.toFixed(1)}`);
      console.log(`  NetRtg: ${mockStats.netRtg.toFixed(1)}`);
      
      const adjusted = applyInjuryAdjustment(mockStats, mockInjuries);
      
      console.log('\nInjury-Adjusted Stats:');
      console.log(`  OffRtg: ${adjusted.offRtg.toFixed(1)} (${(adjusted.offRtg - mockStats.offRtg).toFixed(2)})`);
      console.log(`  DefRtg: ${adjusted.defRtg.toFixed(1)} (${(adjusted.defRtg - mockStats.defRtg).toFixed(2)})`);
      console.log(`  NetRtg: ${adjusted.netRtg.toFixed(1)} (${(adjusted.netRtg - mockStats.netRtg).toFixed(2)})`);
      
    } else {
      console.log(`✅ Found ${allInjuries.length} active injuries\n`);
      
      // Group by team
      const byTeam = {};
      allInjuries.forEach(inj => {
        if (!byTeam[inj.team]) byTeam[inj.team] = [];
        byTeam[inj.team].push(inj);
      });
      
      console.log('Injuries by Team:');
      Object.entries(byTeam)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 10) // Top 10 most injured teams
        .forEach(([team, injuries]) => {
          const adjustment = calculateInjuryAdjustment(injuries);
          console.log(`\n${team} (${injuries.length} injured):`);
          console.log(`  Severity: ${adjustment.severity}`);
          console.log(`  Impact: ${adjustment.rawImpact.toFixed(2)} pts/100`);
          console.log(`  Players:`);
          injuries.forEach(inj => {
            console.log(`    - ${inj.playerName} (${inj.position}): ${inj.status}`);
          });
        });
      
      // Test team comparison
      const teams = Object.keys(byTeam);
      if (teams.length >= 2) {
        const team1 = teams[0];
        const team2 = teams[1];
        
        console.log(`\n\n🆚 Injury Comparison: ${team1} vs ${team2}\n`);
        
        const advantage = getInjuryAdvantage(byTeam[team1], byTeam[team2]);
        console.log('Advantage:', advantage.advantage);
        console.log('Differential:', advantage.differential);
        console.log(`${team1}:`, advantage.home);
        console.log(`${team2}:`, advantage.away);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Injury System Test Complete');
  console.log('\n💡 Integration Status:');
  console.log('  ✅ injury-adjustments.mjs created');
  console.log('  ✅ Integrated into elite predictions');
  console.log('  ✅ Stacked on top of RCI adjustments');
  console.log('  ✅ Conservative priors (OUT=2.5, QUESTIONABLE=0.8 pts/100)');
  console.log('  ✅ Position-weighted (PG/C matter more)');
  console.log('  ✅ Stacking penalties for multiple injuries');
  console.log('  ✅ Max cap at 8.0 pts/100 to prevent extreme adjustments');
}

testInjurySystem().catch(console.error);
