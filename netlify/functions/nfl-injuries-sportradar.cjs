// Sportradar NFL Injury Report Integration
// Fetches live injury data from Sportradar API and formats for our injury system
const fetch = global.fetch;

// Import injury calculation functions
const calcReplacementAdjusted = (playerInfo, playerPriors = {}, weeksOut = 0) => {
  const { position, status, depthOrder } = playerInfo;
  const pos = (position || '').toUpperCase();
  const stat = (status || '').toLowerCase();
  const depth = (depthOrder || '').toUpperCase();
  
  // Base impact by position
  const posImpact = {
    QB: 7.0, RB: 3.5, WR: 2.8, TE: 2.2,
    OL: 1.5, DL: 1.8, LB: 1.6, DB: 1.4, K: 1.0
  };
  
  let base = posImpact[pos] || posImpact[pos.slice(0,2)] || 1.0;
  
  // Status multiplier
  const statusMult = {
    'out': 1.0,
    'doubtful': 0.75,
    'questionable': 0.40,
    'probable': 0.15
  };
  let mult = statusMult[stat] || 0.3;
  
  // Depth adjustment - starters hurt more
  if (depth.includes('1') || depth === 'QB' || depth === 'RB' || depth === 'WR') {
    mult *= 1.2;
  }
  
  const finalPoints = base * mult;
  const spreadImpact = finalPoints * 0.9;
  const totalImpact = finalPoints * 0.6;
  
  return {
    positionCategory: pos,
    finalPoints: Math.round(finalPoints * 10) / 10,
    spreadImpact: Math.round(spreadImpact * 10) / 10,
    totalImpact: Math.round(totalImpact * 10) / 10,
    isSignificant: finalPoints >= 1.5
  };
};

exports.handler = async (event) => {
  console.log('🏥 Sportradar Injury Integration Starting...');
  
  try {
    const qs = event.queryStringParameters || {};
    const key = process.env.SPORTRADAR_API_KEY;
    
    if (!key) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: 'Missing SPORTRADAR_API_KEY - trial may have expired' 
        })
      };
    }
    
    const season = parseInt(qs.season || '2024', 10);
    const week = parseInt(qs.week || '5', 10);
    const stype = (qs.season_type || 'REG').toUpperCase();
    const access = qs.access_level || process.env.SPORTRADAR_ACCESS_LEVEL || 'trial';
    const lang = qs.lang || process.env.SPORTRADAR_LANG || 'en';
    
    // Sportradar Injury endpoint
    const url = `https://api.sportradar.com/nfl/official/${access}/v7/${lang}/seasons/${season}/${stype}/${week}/injuries.json?api_key=${encodeURIComponent(key)}`;
    
    console.log(`📡 Fetching from Sportradar: ${url.replace(key, 'KEY_HIDDEN')}`);
    
    const response = await fetch(url);
    const text = await response.text();
    
    if (!response.ok) {
      console.error(`❌ Sportradar API Error: ${response.status}`);
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: `Sportradar API returned ${response.status}`,
          details: text.slice(0, 500)
        })
      };
    }
    
    const data = JSON.parse(text);
    console.log(`📦 Received Sportradar data:`, JSON.stringify(data).slice(0, 200));
    
    // Parse Sportradar injury format
    const teams = {};
    const allInjuries = [];
    let parseErrors = 0;
    
    // Sportradar format: { teams: [ { alias: 'KC', injuries: [...] } ] }
    if (data.teams && Array.isArray(data.teams)) {
      for (const team of data.teams) {
        const teamCode = (team.alias || team.abbr || '').toUpperCase();
        if (!teamCode) continue;
        
        const injuries = [];
        const teamInjuries = team.injuries || [];
        
        for (const inj of teamInjuries) {
          try {
            const playerName = inj.player?.name || inj.name || 'Unknown';
            const position = inj.player?.position || inj.position || '';
            const status = inj.status?.toLowerCase() || 'unknown';
            const description = inj.injury?.description || inj.description || '';
            
            // Calculate impact
            let impact = {
              finalPoints: 0,
              spreadImpact: 0,
              totalImpact: 0,
              isSignificant: false
            };
            
            try {
              impact = calcReplacementAdjusted({
                position,
                status,
                depthOrder: position + '1' // Assume starter if not specified
              });
            } catch (err) {
              console.warn(`⚠️ Impact calc failed for ${playerName}: ${err.message}`);
              parseErrors++;
            }
            
            injuries.push({
              playerName,
              position,
              status,
              depthOrder: position + '1',
              description,
              impact,
              source: 'SPORTRADAR',
              updated: inj.updated || new Date().toISOString()
            });
            
            allInjuries.push({ teamCode, playerName, position, status, impact });
          } catch (err) {
            console.warn(`⚠️ Failed to parse injury: ${err.message}`);
            parseErrors++;
          }
        }
        
        // Calculate team totals
        const significantInjuries = injuries.filter(i => i.impact.isSignificant).length;
        const totalImpact = injuries.reduce((sum, i) => ({
          spread: sum.spread + i.impact.spreadImpact,
          total: sum.total + i.impact.totalImpact
        }), { spread: 0, total: 0 });
        
        teams[teamCode] = {
          teamName: team.name || team.market || teamCode,
          teamCode,
          injuries,
          significantInjuries,
          totalImpact: {
            spread: Math.round(totalImpact.spread * 10) / 10,
            total: Math.round(totalImpact.total * 10) / 10
          }
        };
      }
    }
    
    // Generate summary
    const significantTotal = allInjuries.filter(i => i.impact.isSignificant).length;
    const criticalAlerts = allInjuries
      .filter(i => i.impact.finalPoints >= 1.5)
      .sort((a, b) => b.impact.finalPoints - a.impact.finalPoints)
      .slice(0, 10)
      .map(i => `${i.teamCode}: ${i.playerName} (${i.position}, ${i.status}) ~${i.impact.finalPoints} pts`);
    
    const result = {
      success: true,
      source: 'SPORTRADAR',
      version: 'v1.0',
      asOf: new Date().toISOString(),
      teams,
      summary: {
        totalInjuriesFound: allInjuries.length,
        significantInjuries: significantTotal,
        replacementAdjustedCount: allInjuries.length,
        parseErrors,
        criticalAlerts,
        systemEffectiveness: parseErrors > 0 ? 0.9 : 1.0
      }
    };
    
    console.log(`✅ Processed ${allInjuries.length} injuries, ${significantTotal} significant`);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
    
  } catch (err) {
    console.error('❌ Fatal error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: err.message,
        stack: err.stack 
      })
    };
  }
};
