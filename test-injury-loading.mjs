// Quick test of injury data loading
const { loadInjuries } = await import('./netlify/functions/_lib/blobs-nfl.js');

console.log('🏥 Testing injury data loading...');

try {
  const injuries = await loadInjuries();
  console.log('✅ Injuries loaded:', {
    hasTeams: !!injuries.teams,
    teamCount: injuries.teams ? Object.keys(injuries.teams).length : 0,
    teamKeys: injuries.teams ? Object.keys(injuries.teams) : [],
    structure: injuries
  });
  
  // Check specific teams for current games
  ['SF', 'TB', 'LAR', 'SEA', 'GB', 'ARI'].forEach(team => {
    const teamData = injuries.teams?.[team];
    if (teamData) {
      console.log(`${team} injuries:`, {
        hasInjuries: !!teamData.injuries,
        count: teamData.injuries?.length || 0,
        players: teamData.injuries?.map(i => `${i.playerName} (${i.position}) - ${i.status}`) || []
      });
    } else {
      console.log(`${team}: No injury data`);
    }
  });
  
} catch (error) {
  console.error('❌ Error loading injuries:', error.message);
  console.error('Stack:', error.stack);
}