// Monday Night Football Injury Debug - NYJ @ MIA and CIN @ DEN
// Enhanced version with multiple data sources
// Run this in your web console to check injury impacts

async function debugMNFInjuries() {
  console.log('🏈 MONDAY NIGHT FOOTBALL INJURY DEBUG - ENHANCED');
  console.log('📅 September 29, 2025');
  console.log('🎯 Games: NYJ @ MIA, CIN @ DEN\n');
  
  try {
    const teams = ['NYJ', 'MIA', 'CIN', 'DEN'];
    const injuryData = {};
    
    // Method 1: Try ESPN API first
    console.log('🔍 Method 1: ESPN API injury reports...');
    for (const team of teams) {
      try {
        const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.toLowerCase()}/injuries`);
        const data = await response.json();
        
        injuryData[team] = {
          espn_injuries: data.items || [],
          espn_updated: data.timestamp || 'Unknown'
        };
        
        console.log(`   ${team}: ${injuryData[team].espn_injuries.length} ESPN injury reports`);
      } catch (e) {
        console.log(`   ❌ ${team}: ESPN failed - ${e.message}`);
        injuryData[team] = { espn_injuries: [], espn_error: e.message };
      }
    }
    
    // Method 2: Try alternative ESPN endpoint
    console.log('\n🔍 Method 2: ESPN team roster with injury status...');
    for (const team of teams) {
      try {
        const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.toLowerCase()}/roster`);
        const data = await response.json();
        
        const injuredPlayers = [];
        if (data.athletes) {
          data.athletes.forEach(group => {
            group.items?.forEach(player => {
              if (player.status?.type && player.status.type !== 'active') {
                injuredPlayers.push({
                  name: player.displayName,
                  position: player.position?.abbreviation,
                  status: player.status?.type,
                  statusName: player.status?.name
                });
              }
            });
          });
        }
        
        injuryData[team].roster_injuries = injuredPlayers;
        console.log(`   ${team}: ${injuredPlayers.length} players with non-active status`);
        
        if (injuredPlayers.length > 0) {
          injuredPlayers.forEach(p => {
            console.log(`      📋 ${p.name} (${p.position}) - ${p.statusName || p.status}`);
          });
        }
        
      } catch (e) {
        console.log(`   ❌ ${team}: Roster failed - ${e.message}`);
        injuryData[team].roster_error = e.message;
      }
    }
    
    // Method 3: Check our internal injury system
    console.log('\n🔍 Method 3: Internal injury system check...');
    try {
      const internalResponse = await fetch('/.netlify/functions/debug-injury-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teams: teams })
      });
      
      if (internalResponse.ok) {
        const internalData = await internalResponse.json();
        console.log('   ✅ Internal system data available');
        
        teams.forEach(team => {
          if (internalData[team]) {
            injuryData[team].internal_data = internalData[team];
            console.log(`   ${team}: ${Object.keys(internalData[team]).length} internal injury records`);
          }
        });
      } else {
        console.log('   ⚠️ Internal system not accessible from browser');
      }
    } catch (e) {
      console.log('   ⚠️ Internal system not accessible:', e.message);
    }
    
    // Method 4: Check known injury situations (manual override)
    console.log('\n🔍 Method 4: ACTUAL MNF Injury Report (Sept 29, 2025)...');
    const knownInjuries = {
      NYJ: [
        { name: 'Jarvis Brownlee Jr.', position: 'CB', status: 'Out', injury: 'Ankle - Did Not Participate In Practice' },
        { name: 'Jermaine Johnson II', position: 'DE', status: 'Out', injury: 'Ankle - Did Not Participate In Practice' },
        { name: 'Kene Nwangwu', position: 'RB', status: 'Out', injury: 'Hamstring - Did Not Participate In Practice' },
        { name: 'Tony Adams', position: 'S', status: 'Active', injury: 'Full Participation in Practice' },
        { name: 'Justin Fields', position: 'QB', status: 'Active', injury: 'Full Participation in Practice' },
        { name: 'Josh Reynolds', position: 'WR', status: 'Active', injury: 'Full Participation in Practice' },
        { name: 'Jay Tufele', position: 'DT', status: 'Active', injury: 'Full Participation in Practice' }
      ],
      MIA: [
        { name: 'Storm Duck', position: 'CB', status: 'Out', injury: 'Ankle - Did Not Participate In Practice' },
        { name: 'Jason Marshall Jr.', position: 'CB', status: 'Out', injury: 'Hamstring - Did Not Participate In Practice' },
        { name: 'Ethan Bonner', position: 'CB', status: 'Questionable', injury: 'Hamstring - Full Participation in Practice' },
        { name: 'Tyreek Hill', position: 'WR', status: 'Unknown', injury: 'Did Not Participate In Practice - NO INJURY LISTED' },
        { name: 'Darren Waller', position: 'TE', status: 'Probable', injury: 'Limited Participation in Practice' },
        { name: 'Jaylen Waddle', position: 'WR', status: 'Active', injury: 'Full Participation in Practice' },
        { name: 'Ifeatu Melifonwu', position: 'S', status: 'Active', injury: 'Full Participation in Practice' }
      ],
      CIN: [
        { name: 'Noah Fant', position: 'TE', status: 'Out', injury: 'Concussion - Did Not Participate In Practice' },
        { name: 'Shemar Stewart', position: 'DE', status: 'Out', injury: 'Ankle - Did Not Participate In Practice' },
        { name: 'Samaje Perine', position: 'RB', status: 'Active', injury: 'Full Participation in Practice' },
        { name: 'Dalton Risner', position: 'G', status: 'Active', injury: 'Full Participation in Practice' },
        { name: 'Cam Taylor-Britt', position: 'CB', status: 'Active', injury: 'Full Participation in Practice' }
      ],
      DEN: [
        { name: 'Marvin Mims Jr.', position: 'WR', status: 'Questionable', injury: 'Hip - Limited Participation in Practice' },
        { name: 'Nate Adkins', position: 'TE', status: 'Active', injury: 'Full Participation in Practice' },
        { name: 'Nik Bonitto', position: 'LB', status: 'Active', injury: 'Full Participation in Practice' },
        { name: 'Evan Engram', position: 'TE', status: 'Active', injury: 'Full Participation in Practice' },
        { name: 'John Franklin-Myers', position: 'DE', status: 'Active', injury: 'Full Participation in Practice' },
        { name: 'Alex Singleton', position: 'LB', status: 'Active', injury: 'Full Participation in Practice' }
      ]
    };
    
    teams.forEach(team => {
      injuryData[team].known_issues = knownInjuries[team] || [];
      console.log(`   ${team}: ${knownInjuries[team]?.length || 0} known situations`);
      knownInjuries[team]?.forEach(p => {
        const emoji = getStatusEmoji(p.status);
        console.log(`      ${emoji} ${p.name} (${p.position}) - ${p.status}: ${p.injury}`);
      });
    });
    
    console.log('\n📊 COMPREHENSIVE INJURY ANALYSIS:\n');
    
    // Analyze each game with all data sources
    const games = [
      { away: 'NYJ', home: 'MIA', name: 'Jets @ Dolphins' },
      { away: 'CIN', home: 'DEN', name: 'Bengals @ Broncos' }
    ];
    
    for (const game of games) {
      console.log(`🏟️ ${game.name.toUpperCase()}`);
      console.log('=' .repeat(60));
      
      for (const teamCode of [game.away, game.home]) {
        const teamData = injuryData[teamCode];
        const isHome = teamCode === game.home;
        
        console.log(`\n${isHome ? '🏠' : '✈️'} ${teamCode} ${isHome ? '(HOME)' : '(AWAY)'}:`);
        
        // Combine all injury sources
        const allInjuries = new Map(); // Use Map to avoid duplicates
        
        // Add ESPN injuries
        teamData.espn_injuries?.forEach(injury => {
          const player = injury.athlete;
          const key = player?.displayName || 'Unknown';
          allInjuries.set(key, {
            name: key,
            position: player?.position?.abbreviation || 'Unknown',
            status: injury.status || 'Unknown',
            source: 'ESPN API',
            details: injury.details
          });
        });
        
        // Add roster status injuries
        teamData.roster_injuries?.forEach(player => {
          const key = player.name;
          if (!allInjuries.has(key)) {
            allInjuries.set(key, {
              name: player.name,
              position: player.position || 'Unknown',
              status: player.statusName || player.status,
              source: 'ESPN Roster'
            });
          }
        });
        
        // Add known issues
        teamData.known_issues?.forEach(player => {
          const key = player.name;
          if (!allInjuries.has(key)) {
            allInjuries.set(key, {
              name: player.name,
              position: player.position,
              status: player.status,
              source: 'Known Issues',
              details: player.injury
            });
          } else {
            // Update with known info if more detailed
            const existing = allInjuries.get(key);
            existing.details = existing.details || player.injury;
            existing.status = player.status; // Use known status as most current
          }
        });
        
        if (allInjuries.size === 0) {
          console.log('   ✅ No injury concerns identified');
        } else {
          // Group by severity
          const critical = [];
          const questionable = [];
          const monitoring = [];
          
          allInjuries.forEach(player => {
            const statusLower = player.status.toLowerCase();
            if (statusLower.includes('out') || statusLower.includes('doubtful')) {
              critical.push(player);
            } else if (statusLower.includes('questionable')) {
              questionable.push(player);
            } else {
              monitoring.push(player);
            }
          });
          
          if (critical.length > 0) {
            console.log('   🚨 CRITICAL INJURIES:');
            critical.forEach(p => {
              const emoji = getStatusEmoji(p.status);
              console.log(`      ${emoji} ${p.name} (${p.position}) - ${p.status}`);
              if (p.details) console.log(`         � ${p.details}`);
              console.log(`         📊 Source: ${p.source}`);
            });
          }
          
          if (questionable.length > 0) {
            console.log('   ❓ QUESTIONABLE/GAME-TIME DECISIONS:');
            questionable.forEach(p => {
              const emoji = getStatusEmoji(p.status);
              console.log(`      ${emoji} ${p.name} (${p.position}) - ${p.status}`);
              if (p.details) console.log(`         💬 ${p.details}`);
              console.log(`         📊 Source: ${p.source}`);
            });
          }
          
          if (monitoring.length > 0) {
            console.log('   👀 MONITORING:');
            monitoring.forEach(p => {
              const emoji = getStatusEmoji(p.status);
              console.log(`      ${emoji} ${p.name} (${p.position}) - ${p.status}`);
              if (p.details) console.log(`         💬 ${p.details}`);
              console.log(`         📊 Source: ${p.source}`);
            });
          }
        }
        
        // Show data freshness
        console.log(`\n   � Data Sources:`);
        if (teamData.espn_updated) console.log(`      ESPN API: ${teamData.espn_updated}`);
        if (teamData.internal_data) console.log(`      Internal: Available`);
        console.log(`      Known Issues: Sept 29, 2025 - Pre-game`);
      }
      
      console.log('\n');
    }
    
    // Enhanced betting impact analysis
    console.log('💰 ENHANCED BETTING IMPACT ANALYSIS:');
    console.log('=' .repeat(60));
    
    console.log('\n🎯 KEY PLAYER IMPACT SCENARIOS:');
    
    // NYJ @ MIA Analysis
    console.log('\n✈️ JETS @ DOLPHINS 🏠:');
    console.log('   🚨 Tyreek Hill (MIA WR): Did not practice - NO INJURY LISTED! Game time decision');
    console.log('   🚫 Jermaine Johnson II (NYJ DE): OUT - Ankle injury affects pass rush');
    console.log('   🚫 Storm Duck (MIA CB): OUT - Ankle, depth chart impact');
    console.log('   🚫 Jason Marshall Jr. (MIA CB): OUT - Hamstring, secondary depth');
    console.log('   ❓ Ethan Bonner (MIA CB): QUESTIONABLE - Hamstring but practiced full');
    console.log('   ⚠️ Darren Waller (MIA TE): Limited practice - Target share monitor');
    
    // CIN @ DEN Analysis  
    console.log('\n✈️ BENGALS @ BRONCOS 🏠:');
    console.log('   🚫 Noah Fant (CIN TE): OUT - Concussion protocol');
    console.log('   🚫 Shemar Stewart (CIN DE): OUT - Ankle injury');
    console.log('   ❓ Marvin Mims Jr. (DEN WR): QUESTIONABLE - Hip injury, limited practice');
    console.log('   📊 Impact: CIN missing key TE, DEN WR depth affected');
    
    console.log('\n🚨 CRITICAL MONITORING POINTS:');
    console.log('• 🔥 TYREEK HILL STATUS: Did not practice but NO injury listed - suspicious!');
    console.log('• 📱 Check @MiamiDolphins Twitter 90 min before kickoff for Hill update');
    console.log('• 🏥 Noah Fant concussion = Major TE target void for Bengals');
    console.log('• 🎯 Multiple CB injuries for Miami = Potential secondary weakness');
    console.log('• ⏰ Hill decision affects ALL Dolphins receiving props');
    
    console.log('\n💡 BETTING STRATEGY:');
    console.log('• WAIT on Hill status before any Dolphins WR bets');
    console.log('• If Hill sits → Waddle props SPIKE, other WRs get more targets');
    console.log('• Fant OUT → Bengals TE props avoid, more targets to WRs/RBs');
    console.log('• Miami CB injuries → Consider Bengals passing props UP');
    console.log('• Jets missing pass rusher → Miami QB has more time');
    
    console.log('\n📊 PROP BET ADJUSTMENTS TO WATCH:');
    console.log('• Hill OUT → Waddle receptions 6.5+ becomes STRONG play');
    console.log('• Hill OUT → Dolphins team total drops 3-4 points');
    console.log('• Fant OUT → Bengals TE props completely avoid');
    console.log('• Waller limited → Reduced target share for Miami TEs');
    console.log('• Multiple Miami CBs out → Bengals WR props trending UP');    console.log('\n🚨 CRITICAL MONITORING POINTS:');
    console.log('• 📱 Check team Twitter accounts 90 min before kickoff');
    console.log('• 📈 Watch for line movement on QB props specifically');
    console.log('• 🏥 Aaron Rodgers status = 3-4 point swing on spread');
    console.log('• 🎯 WR injuries = Major target share redistribution');
    console.log('• ⏰ Game time decisions often leak via beat reporters');
    
    console.log('\n� BETTING STRATEGY:');
    console.log('• Wait for final injury reports before placing bets');
    console.log('• Focus on player props for confirmed healthy players');
    console.log('• Consider live betting if key players are late scratches');
    console.log('• Monitor team totals - QB injuries drastically affect scoring');
    
    console.log('\n📊 PROP BET ADJUSTMENTS TO WATCH:');
    console.log('• Rodgers OUT → Jets total drops 6+ points');
    console.log('• Tua questionable → Dolphins passing props reduced');
    console.log('• Hill OUT → Waddle/other WRs props spike up');
    console.log('• Burrow limited → Mixon rushing attempts increase');
    
    return injuryData;
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    return null;
  }
}

function getStatusEmoji(status) {
  const statusLower = (status || '').toLowerCase();
  if (statusLower.includes('out')) return '🚫';
  if (statusLower.includes('doubtful')) return '❌';
  if (statusLower.includes('questionable')) return '❓';
  if (statusLower.includes('probable')) return '⚠️';
  if (statusLower.includes('ir') || statusLower.includes('injured reserve')) return '🏥';
  return '📋';
}

// Auto-run the debug
console.log('🚀 Starting MNF Injury Debug...\n');
debugMNFInjuries().then(data => {
  console.log('\n✅ MNF Injury Debug Complete!');
  console.log('💡 Tip: Re-run this closer to game time for latest updates');
}).catch(err => {
  console.error('💥 Debug failed:', err);
});