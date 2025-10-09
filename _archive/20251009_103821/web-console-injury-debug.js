// Web Console Injury Debug - Test on Live Site
// Copy and paste this into your browser console to test injury impact analysis

(async function testInjuryImpactOnLiveSite() {
  console.log('🏥 LIVE SITE INJURY IMPACT TEST');
  console.log('='.repeat(50));
  
  // Injury impact weights
  const INJURY_WEIGHTS = {
    QB: { out: -8.5, doubtful: -5.2, questionable: -2.1 },
    RB1: { out: -1.8, doubtful: -1.1, questionable: -0.6 },
    WR1: { out: -2.2, doubtful: -1.3, questionable: -0.7 },
    WR2: { out: -1.4, doubtful: -0.8, questionable: -0.4 },
    TE1: { out: -1.1, doubtful: -0.7, questionable: -0.3 },
    OL: { out: -1.5, doubtful: -0.9, questionable: -0.4 },
    K: { out: -0.8, doubtful: -0.3, questionable: -0.1 }
  };
  
  // Try to fetch injury data from your live site
  let injuryData = null;
  
  try {
    console.log('🔍 Attempting to fetch injury data...');
    
    // Try multiple potential endpoints
    const endpoints = [
      '/data/nfl/injuries/latest.json',
      '/api/nfl/injuries/current',
      './data/nfl/injuries/latest.json',
      'data/nfl/injuries/latest.json'
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`📡 Trying: ${endpoint}`);
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Found injury data at: ${endpoint}`);
          injuryData = data.teams || data;
          break;
        }
      } catch (e) {
        console.log(`❌ Failed: ${endpoint} - ${e.message}`);
      }
    }
    
    if (!injuryData) {
      console.log('⚠️ No injury data found via fetch. Checking window globals...');
      
      // Check for global variables that might contain injury data
      const globalChecks = ['window.injuryData', 'window.nflInjuries', 'window.injuries'];
      for (const check of globalChecks) {
        try {
          const globalData = eval(check);
          if (globalData) {
            console.log(`✅ Found injury data in: ${check}`);
            injuryData = globalData.teams || globalData;
            break;
          }
        } catch (e) {
          // Silent fail for undefined globals
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error fetching injury data:', error);
  }
  
  if (!injuryData) {
    console.log('🚨 No injury data available. Simulating with sample data...');
    
    // Sample data for testing
    injuryData = {
      WAS: {
        team: 'WAS',
        qb_status: 'out',
        qb_name: 'Jayden Daniels',
        rb_injuries: [{ name: 'Brian Robinson Jr.', status: 'questionable' }],
        wr_injuries: [
          { name: 'Terry McLaurin', status: 'out' },
          { name: 'Jahan Dotson', status: 'questionable' }
        ],
        te_injuries: [{ name: 'Zach Ertz', status: 'active' }],
        ol_starters_out: 1,
        kicker_status: 'active'
      },
      ATL: {
        team: 'ATL',
        qb_status: 'active',
        qb_name: 'Kirk Cousins',
        rb_injuries: [{ name: 'Bijan Robinson', status: 'active' }],
        wr_injuries: [
          { name: 'Drake London', status: 'questionable' },
          { name: 'Darnell Mooney', status: 'active' }
        ],
        te_injuries: [{ name: 'Kyle Pitts', status: 'active' }],
        ol_starters_out: 0,
        kicker_status: 'active'
      }
    };
    
    console.log('📋 Using sample injury data for Washington vs Atlanta');
  }
  
  // Calculate injury impact
  function calculateInjuryImpact(teamData) {
    let totalImpact = 0;
    let breakdown = {};
    
    // QB Impact
    if (teamData.qb_status !== 'active') {
      const impact = INJURY_WEIGHTS.QB[teamData.qb_status] || 0;
      totalImpact += impact;
      breakdown.QB = {
        player: teamData.qb_name || 'QB',
        status: teamData.qb_status,
        impact: impact
      };
    }
    
    // RB Impact
    if (teamData.rb_injuries) {
      teamData.rb_injuries.forEach((injury, idx) => {
        if (injury.status !== 'active') {
          const impact = INJURY_WEIGHTS.RB1[injury.status] || 0;
          totalImpact += impact;
          breakdown[`RB${idx + 1}`] = {
            player: injury.name,
            status: injury.status,
            impact: impact
          };
        }
      });
    }
    
    // WR Impact
    if (teamData.wr_injuries) {
      teamData.wr_injuries.forEach((injury, idx) => {
        if (injury.status !== 'active') {
          const posKey = idx === 0 ? 'WR1' : 'WR2';
          const impact = INJURY_WEIGHTS[posKey][injury.status] || 0;
          totalImpact += impact;
          breakdown[`${posKey}_${injury.name}`] = {
            player: injury.name,
            status: injury.status,
            impact: impact
          };
        }
      });
    }
    
    // OL Impact
    if (teamData.ol_starters_out > 0) {
      const impact = teamData.ol_starters_out * INJURY_WEIGHTS.OL.out;
      totalImpact += impact;
      breakdown.OL = {
        player: `${teamData.ol_starters_out} starters`,
        status: 'out',
        impact: impact
      };
    }
    
    return {
      totalImpact: Math.round(totalImpact * 10) / 10,
      breakdown: breakdown
    };
  }
  
  // Analyze available teams
  console.log(`\n📊 Analyzing ${Object.keys(injuryData).length} teams:`);
  
  const teamImpacts = {};
  for (const [teamCode, teamData] of Object.entries(injuryData)) {
    const impact = calculateInjuryImpact(teamData);
    teamImpacts[teamCode] = impact;
    
    console.log(`\n🏈 ${teamCode.toUpperCase()}:`);
    
    if (Object.keys(impact.breakdown).length === 0) {
      console.log('   ✅ No significant injuries');
    } else {
      Object.entries(impact.breakdown).forEach(([pos, data]) => {
        const emoji = data.impact <= -3 ? '🚨' : data.impact <= -1 ? '⚠️' : '📝';
        console.log(`   ${emoji} ${data.player}: ${data.status} (${data.impact})`);
      });
      console.log(`   📈 Total Impact: ${impact.totalImpact}`);
    }
  }
  
  // Game simulation if we have multiple teams
  const teams = Object.keys(injuryData);
  if (teams.length >= 2) {
    const team1 = teams[0];
    const team2 = teams[1];
    
    console.log(`\n🎯 SIMULATED GAME: ${team1} @ ${team2}`);
    console.log('-'.repeat(40));
    
    const impact1 = teamImpacts[team1];
    const impact2 = teamImpacts[team2];
    
    const spreadAdjustment = impact1.totalImpact - impact2.totalImpact;
    const totalAdjustment = -(Math.abs(impact1.totalImpact) + Math.abs(impact2.totalImpact)) * 0.6;
    const mlAdjustment = spreadAdjustment * 15;
    
    console.log(`📏 Spread adjustment: ${spreadAdjustment > 0 ? '+' : ''}${spreadAdjustment.toFixed(1)} points`);
    console.log(`🎲 Total adjustment: ${totalAdjustment > 0 ? '+' : ''}${totalAdjustment.toFixed(1)} points`);
    console.log(`💰 Moneyline shift: ${Math.abs(mlAdjustment).toFixed(0)} points`);
    
    if (Math.abs(spreadAdjustment) >= 1.5 || Math.abs(totalAdjustment) >= 2.5) {
      console.log('🔥 SIGNIFICANT BETTING IMPACT!');
    }
  }
  
  console.log('\n✅ Live site injury impact test complete!');
  console.log('📊 This data should integrate with your prediction models');
  
  // Return data for further inspection
  return {
    injuryData,
    teamImpacts,
    timestamp: new Date().toISOString()
  };
  
})().then(result => {
  console.log('\n🔍 Test results stored in:', result);
  window.injuryTestResult = result; // Store for inspection
}).catch(error => {
  console.error('❌ Test failed:', error);
});