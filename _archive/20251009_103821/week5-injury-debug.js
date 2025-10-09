// BROWSER-COMPATIBLE WEEK 5 NFL INJURY DEBUG SCRIPT
// Copy and paste this entire script into your browser console

async function debugWeek5InjuryImpact() {
  console.log('🔥 === WEEK 5 NFL INJURY IMPACT DEBUG (Browser Compatible) ===');
  
  // Detect environment and use appropriate base URL
  const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'https://bgroundrobin.com' 
    : '';
  
  console.log(`🌐 Using base URL: ${baseUrl || 'current domain'}`);
  
  try {
    // 1. First, get the current week's schedule
    console.log('\n📅 === FETCHING WEEK 5 SCHEDULE ===');
    const scheduleUrl = `${baseUrl}/.netlify/functions/nfl-schedule-get`;
    console.log(`Fetching schedule from: ${scheduleUrl}`);
    
    const scheduleResponse = await fetch(scheduleUrl);
    if (!scheduleResponse.ok) {
      throw new Error(`Schedule fetch failed: ${scheduleResponse.status}`);
    }
    
    const scheduleData = await scheduleResponse.json();
    console.log('Schedule response structure:', {
      hasMatchups: !!(scheduleData.matchups),
      hasGames: !!(scheduleData.games),
      totalGames: scheduleData.matchups ? scheduleData.matchups.length : (scheduleData.games ? scheduleData.games.length : 0)
    });
    
    // Extract games from schedule (handle different response formats)
    let games = [];
    if (scheduleData.matchups) {
      games = scheduleData.matchups.map(game => ({
        away: getTeamCode(game.away || game.awayTeam),
        home: getTeamCode(game.home || game.homeTeam), 
        description: `${game.away || game.awayTeam} @ ${game.home || game.homeTeam}`,
        kickoff: game.kickoff || game.start
      }));
    } else if (scheduleData.games) {
      games = scheduleData.games.map(game => ({
        away: getTeamCode(game.away_team || game.away),
        home: getTeamCode(game.home_team || game.home),
        description: `${game.away_team || game.away} @ ${game.home_team || game.home}`,
        kickoff: game.start || game.kickoff
      }));
    }
    
    console.log(`📊 Found ${games.length} games for Week 5`);
    if (games.length === 0) {
      console.warn('⚠️ No games found - using fallback Week 5 schedule');
      // Fallback Week 5 schedule if API doesn't return games
      games = [
        { away: "CAR", home: "CHI", description: "Panthers @ Bears" },
        { away: "BAL", home: "CIN", description: "Ravens @ Bengals" },
        { away: "BUF", home: "HOU", description: "Bills @ Texans" },
        { away: "MIA", home: "NE", description: "Dolphins @ Patriots" },
        { away: "IND", home: "JAX", description: "Colts @ Jaguars" },
        { away: "CLE", home: "WAS", description: "Browns @ Commanders" },
        { away: "LV", home: "DEN", description: "Raiders @ Broncos" },
        { away: "TB", home: "ATL", description: "Buccaneers @ Falcons" },
        { away: "ARI", home: "SF", description: "Cardinals @ 49ers" },
        { away: "LAC", home: "KC", description: "Chargers @ Chiefs" },
        { away: "NYG", home: "SEA", description: "Giants @ Seahawks" },
        { away: "GB", home: "LAR", description: "Packers @ Rams" },
        { away: "DAL", home: "PIT", description: "Cowboys @ Steelers" },
        { away: "NYJ", home: "MIN", description: "Jets @ Vikings" },
        { away: "DET", home: "PHI", description: "Lions @ Eagles" }
      ];
    }
    
    // 2. Load injury data once for all teams
    console.log('\n🏥 === LOADING INJURY DATA ===');
    const injuryUrl = `${baseUrl}/.netlify/functions/nfl-injuries-get`;
    console.log(`Fetching injury data from: ${injuryUrl}`);
    
    const injuryResponse = await fetch(injuryUrl);
    if (!injuryResponse.ok) {
      throw new Error(`Injury data fetch failed: ${injuryResponse.status}`);
    }
    
    const injuryText = await injuryResponse.text();
    let injuryData;
    try {
      injuryData = JSON.parse(injuryText);
    } catch (parseError) {
      console.error('❌ Failed to parse injury data:', parseError);
      console.log('Response preview:', injuryText.substring(0, 300));
      return;
    }
    
    console.log('📋 Injury data overview:', {
      hasTeams: !!(injuryData && injuryData.teams),
      teamCount: injuryData && injuryData.teams ? Object.keys(injuryData.teams).length : 0,
      asOf: injuryData.asOf || 'unknown'
    });
    
    // 3. Analyze injury impacts for each game
    console.log('\n🎯 === ANALYZING INJURY IMPACTS BY GAME ===');
    
    const injurySummary = {
      gamesWithQBOut: [],
      gamesWithKeyInjuries: [],
      totalInjuryImpacts: 0,
      teamsWithInjuries: []
    };
    
    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      console.log(`\n🏈 Game ${i + 1}/${games.length}: ${game.description}`);
      
      // Check injury data for both teams
      const awayInjuries = injuryData.teams?.[game.away] || {};
      const homeInjuries = injuryData.teams?.[game.home] || {};
      
      console.log(`  ${game.away} injuries:`, {
        qb_status: awayInjuries.qb_status || 'active',
        qb_name: awayInjuries.qb_name || 'none',
        rb_out: awayInjuries.rb_injuries?.filter(p => p.status === 'out').length || 0,
        wr_out: awayInjuries.wr_injuries?.filter(p => p.status === 'out').length || 0,
        te_out: awayInjuries.te_injuries?.filter(p => p.status === 'out').length || 0
      });
      
      console.log(`  ${game.home} injuries:`, {
        qb_status: homeInjuries.qb_status || 'active',
        qb_name: homeInjuries.qb_name || 'none',
        rb_out: homeInjuries.rb_injuries?.filter(p => p.status === 'out').length || 0,
        wr_out: homeInjuries.wr_injuries?.filter(p => p.status === 'out').length || 0,
        te_out: homeInjuries.te_injuries?.filter(p => p.status === 'out').length || 0
      });
      
      // Track QB injuries
      if (awayInjuries.qb_status === 'out' || homeInjuries.qb_status === 'out') {
        injurySummary.gamesWithQBOut.push({
          game: game.description,
          qbOut: awayInjuries.qb_status === 'out' ? `${game.away}: ${awayInjuries.qb_name}` : 
                 homeInjuries.qb_status === 'out' ? `${game.home}: ${homeInjuries.qb_name}` : 'unknown'
        });
      }
      
      // Track key skill position injuries
      const awayKeyOut = (awayInjuries.rb_injuries?.filter(p => p.status === 'out').length || 0) +
                        (awayInjuries.wr_injuries?.filter(p => p.status === 'out').length || 0) +
                        (awayInjuries.te_injuries?.filter(p => p.status === 'out').length || 0);
      
      const homeKeyOut = (homeInjuries.rb_injuries?.filter(p => p.status === 'out').length || 0) +
                        (homeInjuries.wr_injuries?.filter(p => p.status === 'out').length || 0) +
                        (homeInjuries.te_injuries?.filter(p => p.status === 'out').length || 0);
      
      if (awayKeyOut > 0 || homeKeyOut > 0) {
        injurySummary.gamesWithKeyInjuries.push({
          game: game.description,
          awayOut: awayKeyOut,
          homeOut: homeKeyOut
        });
      }
      
      // Test prediction impact for this specific game
      try {
        console.log(`  🔍 Testing prediction impact for ${game.description}...`);
        const predictionResponse = await fetch(`${baseUrl}/.netlify/functions/nfl-predictions-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            debug: true,
            games: [{
              game_id: `${game.away}_${game.home}`,
              away_team: game.away,
              home_team: game.home,
              start: game.kickoff || new Date().toISOString()
            }]
          })
        });
        
        if (predictionResponse.ok) {
          const predictionData = await predictionResponse.json();
          const gamePrediction = predictionData.predictions?.[0];
          
          if (gamePrediction) {
            const hasInjuryImpact = !!(
              gamePrediction.modelEnhancements?.injuryAnalysis?.hasInjuryImpact ||
              gamePrediction.teamStats?.home?.injuryImpact?.adjustments?.length ||
              gamePrediction.teamStats?.away?.injuryImpact?.adjustments?.length
            );
            
            console.log(`  📊 Injury impact detected: ${hasInjuryImpact ? 'YES' : 'NO'}`);
            
            if (hasInjuryImpact) {
              injurySummary.totalInjuryImpacts++;
              console.log(`  ✅ Injury adjustments applied:`, {
                home: gamePrediction.teamStats?.home?.injuryImpact?.adjustments?.length || 0,
                away: gamePrediction.teamStats?.away?.injuryImpact?.adjustments?.length || 0
              });
            } else {
              console.log(`  ❌ No injury impact despite injury data available`);
            }
          }
        } else {
          console.log(`  ⚠️ Prediction request failed: ${predictionResponse.status}`);
        }
      } catch (predError) {
        console.log(`  ❌ Prediction test error:`, predError.message);
      }
      
      // Small delay to avoid overwhelming the server
      if (i < games.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // 4. Overall summary
    console.log('\n📊 === WEEK 5 INJURY IMPACT SUMMARY ===');
    console.log(`🏈 Total games analyzed: ${games.length}`);
    console.log(`🚨 Games with QB out: ${injurySummary.gamesWithQBOut.length}`);
    console.log(`⚠️ Games with key skill position injuries: ${injurySummary.gamesWithKeyInjuries.length}`);
    console.log(`🎯 Games with prediction injury impacts: ${injurySummary.totalInjuryImpacts}`);
    
    if (injurySummary.gamesWithQBOut.length > 0) {
      console.log('\n🚨 QB INJURY DETAILS:');
      injurySummary.gamesWithQBOut.forEach(game => {
        console.log(`  - ${game.game}: ${game.qbOut}`);
      });
    }
    
    if (injurySummary.gamesWithKeyInjuries.length > 0) {
      console.log('\n⚠️ KEY SKILL POSITION INJURIES:');
      injurySummary.gamesWithKeyInjuries.forEach(game => {
        console.log(`  - ${game.game}: Away ${game.awayOut} out, Home ${game.homeOut} out`);
      });
    }
    
    // Analysis conclusion
    const effectivenessRate = injurySummary.totalInjuryImpacts / Math.max(injurySummary.gamesWithQBOut.length + injurySummary.gamesWithKeyInjuries.length, 1) * 100;
    console.log(`\n📈 INJURY SYSTEM EFFECTIVENESS: ${effectivenessRate.toFixed(1)}%`);
    
    if (effectivenessRate < 50) {
      console.log('❌ PROBLEM: Injury data exists but impact calculations are not working properly');
      console.log('🔧 Recommendation: Check injury adjustment logic in prediction system');
    } else {
      console.log('✅ SUCCESS: Injury system is working and affecting predictions');
    }
    
  } catch (error) {
    console.error('❌ Week 5 injury debug failed:', error);
    console.log('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack ? error.stack.split('\n').slice(0, 3) : 'No stack'
    });
  }
}

// Helper function to normalize team codes
function getTeamCode(team) {
  const teamMap = {
    'Cardinals': 'ARI', 'Falcons': 'ATL', 'Ravens': 'BAL', 'Bills': 'BUF',
    'Panthers': 'CAR', 'Bears': 'CHI', 'Bengals': 'CIN', 'Browns': 'CLE',
    'Cowboys': 'DAL', 'Broncos': 'DEN', 'Lions': 'DET', 'Packers': 'GB',
    'Texans': 'HOU', 'Colts': 'IND', 'Jaguars': 'JAX', 'Chiefs': 'KC',
    'Raiders': 'LV', 'Chargers': 'LAC', 'Rams': 'LAR', 'Dolphins': 'MIA',
    'Vikings': 'MIN', 'Patriots': 'NE', 'Saints': 'NO', 'Giants': 'NYG',
    'Jets': 'NYJ', 'Eagles': 'PHI', 'Steelers': 'PIT', '49ers': 'SF',
    'Seahawks': 'SEA', 'Buccaneers': 'TB', 'Titans': 'TEN', 'Commanders': 'WAS'
  };
  
  return teamMap[team] || team;
}

// Run the debug
debugWeek5InjuryImpact();