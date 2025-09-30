// Debug ESPN API structure
export const handler = async (event, context) => {
  const startTime = Date.now();
  
  try {
    // Test ESPN API with NYG
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
    
    // Get first injury details
    if (injuryRefs.length > 0) {
      const firstInjuryResponse = await fetch(injuryRefs[0].$ref, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)' }
      });
      
      if (firstInjuryResponse.ok) {
        const injuryData = await firstInjuryResponse.json();
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            team: 'NYG',
            totalInjuries: injuryRefs.length,
            firstInjuryStructure: injuryData,
            athleteRef: injuryData.athlete?.$ref,
            hasAthlete: !!injuryData.athlete,
            processingTimeMs: Date.now() - startTime,
            timestamp: new Date().toISOString()
          }, null, 2)
        };
      }
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        team: 'NYG',
        totalInjuries: injuryRefs.length,
        message: 'No injuries found or unable to fetch details',
        processingTimeMs: Date.now() - startTime
      })
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message,
        processingTimeMs: Date.now() - startTime
      })
    };
  }
};