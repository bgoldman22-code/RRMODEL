// Simplified background processor - no imports
export const handler = async (event, context) => {
  const startTime = Date.now();
  
  console.log('🚀 Simple background processor v4.0 starting...');
  
  try {
    // Test ESPN API with a single team
    const teamId = '19'; // NYG
    const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) throw new Error(`ESPN API error: ${response.status}`);

    const data = await response.json();
    const injuryRefs = data.items || [];
    
    console.log(`📊 NYG has ${injuryRefs.length} injury reports`);
    
    const injuries = [];
    
    // Process first 6 injuries to get more details
    for (const ref of injuryRefs.slice(0, 6)) {
      try {
        const injuryResponse = await fetch(ref.$ref, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)' }
        });
        
        if (!injuryResponse.ok) continue;
        
        const injuryData = await injuryResponse.json();
        
        // Get player details if available
        let playerName = 'Unknown';
        let position = 'UNK';
        
        if (injuryData.athlete?.$ref) {
          try {
            const playerResponse = await fetch(injuryData.athlete.$ref, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)' }
            });
            
            if (playerResponse.ok) {
              const playerData = await playerResponse.json();
              playerName = playerData.displayName || playerData.name || 'Unknown';
              position = playerData.position?.abbreviation || 'UNK';
            }
          } catch {
            // Skip player details if it fails
          }
        }
        
        injuries.push({
          player: playerName,
          position: position,
          status: injuryData.status || 'Unknown',
          description: injuryData.description || 'Undisclosed',
          injuryType: injuryData.type || 'Unknown',
          lastUpdated: new Date().toISOString(),
          espnRef: ref.$ref.split('/').pop() // ESPN ID
        });

      } catch (error) {
        console.warn(`Injury processing error:`, error.message);
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    const result = {
      success: true,
      version: 'v4.0-simple',
      team: 'NYG',
      injuries: injuries,
      injuryCount: injuries.length,
      processingTimeMs: processingTime,
      timestamp: new Date().toISOString(),
      currentWeek: getCurrentWeek(),
      message: 'Simplified processor working - ESPN API accessible'
    };
    
    console.log(`✅ Simple processor complete: ${injuries.length} injuries in ${processingTime}ms`);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result, null, 2)
    };
    
  } catch (error) {
    console.error('❌ Simple processor failed:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message,
        version: 'v4.0-simple',
        processingTimeMs: Date.now() - startTime
      })
    };
  }
};

function getCurrentWeek({ now = new Date(), tz = 'America/New_York' } = {}) {
  const year = now.getFullYear();
  const sept1 = new Date(year, 8, 1);
  const firstThursday = new Date(sept1);
  firstThursday.setDate(1 + ((4 - sept1.getDay() + 7) % 7));
  
  const etNow = new Date(now.toLocaleString("en-US", {timeZone: tz}));
  const etTuesday3am = new Date(etNow);
  etTuesday3am.setDate(etTuesday3am.getDate() - ((etTuesday3am.getDay() + 5) % 7));
  etTuesday3am.setHours(3, 0, 0, 0);
  
  if (etNow < etTuesday3am) {
    etTuesday3am.setDate(etTuesday3am.getDate() - 7);
  }
  
  const weeksSinceStart = Math.floor((etTuesday3am - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  const weekNum = Math.max(1, Math.min(18, weeksSinceStart + 1));
  
  return `${year}_W${weekNum}`;
}