// BallDontLie.io NFL Injury Integration
// Fetches live injury data from balldontlie.io API and formats for our injury system
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
  console.log('🏥 BallDontLie Injury Integration Starting...');
  
  try {
    const qs = event.queryStringParameters || {};
    const key = process.env.BALLDONTLIE_API_KEY;
    
    if (!key) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: 'Missing BALLDONTLIE_API_KEY environment variable',
          instructions: 'Add your API key at: https://app.netlify.com/sites/YOUR_SITE/settings/env'
        })
      };
    }
    
    // BallDontLie NFL injury endpoint
    const url = 'https://api.balldontlie.io/nfl/v1/player_injuries?per_page=100';
    
    console.log(`📡 Fetching from BallDontLie: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': key
      }
    });
    
    const text = await response.text();
    
    if (!response.ok) {
      console.error(`❌ BallDontLie API Error: ${response.status}`);
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: `BallDontLie API returned ${response.status}`,
          details: text.slice(0, 500)
        })
      };
    }
    
    const data = JSON.parse(text);
    console.log(`📦 Received ${data.data?.length || 0} injuries from BallDontLie`);
    
    // Parse BallDontLie injury format
    const teams = {};
    const allInjuries = [];
    let parseErrors = 0;
    
    // BallDontLie format: { data: [ { player: {...}, status: "Out", comment: "...", date: "..." } ] }
    if (data.data && Array.isArray(data.data)) {
      for (const inj of data.data) {
        try {
          const player = inj.player || {};
          const team = player.team || {};
          const teamCode = (team.abbreviation || '').toUpperCase();
          
          if (!teamCode) continue;
          
          const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown';
          const position = (player.position_abbreviation || player.position || '').toUpperCase();
          const status = (inj.status || '').toLowerCase();
          const description = inj.comment || '';
          
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
          
          const injuryRecord = {
            playerName,
            position,
            status,
            depthOrder: position + '1',
            description: description.slice(0, 200), // Truncate long comments
            impact,
            source: 'BALLDONTLIE',
            updated: inj.date || new Date().toISOString()
          };
          
          // Initialize team if not exists
          if (!teams[teamCode]) {
            teams[teamCode] = {
              teamName: team.full_name || team.name || teamCode,
              teamCode,
              injuries: [],
              significantInjuries: 0,
              totalImpact: { spread: 0, total: 0 }
            };
          }
          
          teams[teamCode].injuries.push(injuryRecord);
          allInjuries.push({ teamCode, playerName, position, status, impact });
          
        } catch (err) {
          console.warn(`⚠️ Failed to parse injury: ${err.message}`);
          parseErrors++;
        }
      }
    }
    
    // Calculate team totals
    for (const teamCode in teams) {
      const team = teams[teamCode];
      team.significantInjuries = team.injuries.filter(i => i.impact.isSignificant).length;
      team.totalImpact = team.injuries.reduce((sum, i) => ({
        spread: sum.spread + i.impact.spreadImpact,
        total: sum.total + i.impact.totalImpact
      }), { spread: 0, total: 0 });
      
      team.totalImpact.spread = Math.round(team.totalImpact.spread * 10) / 10;
      team.totalImpact.total = Math.round(team.totalImpact.total * 10) / 10;
    }

    // NORMALIZATION LAYER: Add legacy fields (qb_name, qb_status, *_injuries arrays) so
    // prediction engine's applyInjuryAdjustments() can operate on BallDontLie data
    // without further changes. This mirrors the expected structure from the previous
    // comprehensive injury system.
    for (const teamCode in teams) {
      const team = teams[teamCode];
      if (!team || !Array.isArray(team.injuries)) continue;

      const rbInj = [];
      const wrInj = [];
      const teInj = [];
      let qbSet = false;

      team.injuries.forEach(inj => {
        const pos = (inj.position || '').toUpperCase();
        const status = (inj.status || '').toLowerCase();
        // Only propagate meaningful injury statuses
        const tracked = ['out', 'doubtful', 'questionable'];
        if (!tracked.includes(status)) return;
        if (pos === 'QB' && !qbSet) {
          team.qb_name = inj.playerName;
          team.qb_status = status; // prediction code lowercases before normalization
          qbSet = true;
        } else if (pos === 'RB') {
          rbInj.push({ name: inj.playerName, status, depth: 1 });
        } else if (pos === 'WR') {
          wrInj.push({ name: inj.playerName, status, depth: 1 });
        } else if (pos === 'TE') {
          teInj.push({ name: inj.playerName, status, depth: 1 });
        }
      });

      // Attach arrays only if we have entries (keeps payload concise)
      if (rbInj.length) team.rb_injuries = rbInj;
      if (wrInj.length) team.wr_injuries = wrInj;
      if (teInj.length) team.te_injuries = teInj;
      // Marker to avoid double-normalization if future processing reuses object
      team._normalized_legacy_fields = true;
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
      source: 'BALLDONTLIE',
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
      },
      meta: data.meta || {}
    };
    
    console.log(`✅ Processed ${allInjuries.length} injuries, ${significantTotal} significant across ${Object.keys(teams).length} teams`);
    
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
