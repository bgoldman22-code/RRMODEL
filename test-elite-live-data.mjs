// Test Elite Injury system with live data
const { loadInjuries } = await import('./netlify/functions/_lib/blobs-nfl.js');
const { calculateEliteInjuryAdjustment } = await import('./netlify/functions/_lib/elite-injury-penalty-calculator.mjs');

console.log('🏥 Testing Elite Injury system with live data...');

try {
  const injuries = await loadInjuries();
  console.log('✅ Injuries loaded');
  
  // Convert to Elite system format (like the backend does)
  const injuriesArray = [];
  if (injuries && injuries.teams) {
    for (const [teamCode, teamData] of Object.entries(injuries.teams)) {
      if (teamData && teamData.injuries && Array.isArray(teamData.injuries)) {
        for (const inj of teamData.injuries) {
          if (inj && inj.playerName && inj.position) {
            injuriesArray.push({
              team: teamCode,
              player: inj.playerName,
              position: inj.position.toUpperCase(),
              status: (inj.status || 'QUESTIONABLE').toUpperCase(),
              availability: inj.availability || null
            });
          }
        }
      }
    }
  }
  
  console.log(`🔄 Converted ${injuriesArray.length} injuries to Elite format`);
  
  // Test SF @ TB specifically
  const homeCode = 'TB';
  const awayCode = 'SF';
  const homeInjuries = injuriesArray.filter(i => i.team === homeCode);
  const awayInjuries = injuriesArray.filter(i => i.team === awayCode);
  
  console.log(`\n🏈 Testing ${awayCode} @ ${homeCode}:`);
  console.log(`Away (${awayCode}) injuries:`, homeInjuries.map(i => `${i.player} (${i.position}) - ${i.status}`));
  console.log(`Home (${homeCode}) injuries:`, awayInjuries.map(i => `${i.player} (${i.position}) - ${i.status}`));
  
  if (homeInjuries.length > 0 || awayInjuries.length > 0) {
    const eliteResult = calculateEliteInjuryAdjustment(homeInjuries, awayInjuries, -3);
    
    console.log('\n✅ Elite Injury Result:', {
      homeTotal: eliteResult.home.total,
      awayTotal: eliteResult.away.total,
      netSpreadImpact: eliteResult.netSpreadImpact,
      kellyReduction: eliteResult.stakingReduction.factor,
      showIcons: {
        home: homeInjuries.length > 0 && eliteResult.home.total > 1.0,
        away: awayInjuries.length > 0 && eliteResult.away.total > 1.0
      }
    });
    
    // This is what should be in modelEnhancements.eliteInjury
    const modelEnhancementData = {
      home: {
        offensive: eliteResult.home.offensive,
        defensive: eliteResult.home.defensive,
        total: eliteResult.home.total,
        uncertainty: eliteResult.home.uncertainty,
        injuries: homeInjuries
      },
      away: {
        offensive: eliteResult.away.offensive,
        defensive: eliteResult.away.defensive,
        total: eliteResult.away.total,
        uncertainty: eliteResult.away.uncertainty,
        injuries: awayInjuries
      },
      netSpreadImpact: eliteResult.netSpreadImpact,
      kellyReduction: eliteResult.stakingReduction.factor,
      kellyRecommendation: eliteResult.stakingReduction.recommendation,
      sanityCheck: eliteResult.sanityCheck,
      metadata: eliteResult.metadata
    };
    
    console.log('\n📊 modelEnhancements.eliteInjury structure:', modelEnhancementData);
  } else {
    console.log('❌ No injuries found for this matchup');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Stack:', error.stack);
}