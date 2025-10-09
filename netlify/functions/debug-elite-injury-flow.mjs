// netlify/functions/debug-elite-injury-flow.mjs
// Diagnostic to check the complete Elite Injury flow in production

import { loadInjuries } from './_lib/blobs-nfl.js';

export const handler = async (event, context) => {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    step1_loadInjuries: null,
    step2_conversion: null,
    step3_eliteCalculation: null,
    error: null
  };

  try {
    // STEP 1: Load injuries
    console.log('🔍 Step 1: Loading injuries...');
    const injuries = await loadInjuries();
    
    diagnostics.step1_loadInjuries = {
      success: !!injuries,
      hasTeams: !!(injuries && injuries.teams),
      teamCount: injuries?.teams ? Object.keys(injuries.teams).length : 0,
      source: injuries?.source || 'unknown',
      sfHasData: !!(injuries?.teams?.SF),
      tbHasData: !!(injuries?.teams?.TB),
      sfInjuryCount: injuries?.teams?.SF?.injuries?.length || 0,
      tbInjuryCount: injuries?.teams?.TB?.injuries?.length || 0
    };

    if (injuries?.teams && Object.keys(injuries.teams).length > 0) {
      // STEP 2: Convert to Elite format
      console.log('🔍 Step 2: Converting to Elite format...');
      const injuriesArray = [];
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

      diagnostics.step2_conversion = {
        success: true,
        totalConverted: injuriesArray.length,
        sfInjuries: injuriesArray.filter(i => i.team === 'SF').length,
        tbInjuries: injuriesArray.filter(i => i.team === 'TB').length,
        sampleSF: injuriesArray.filter(i => i.team === 'SF').map(i => `${i.player} (${i.position}) - ${i.status}`),
        sampleTB: injuriesArray.filter(i => i.team === 'TB').map(i => `${i.player} (${i.position}) - ${i.status}`)
      };

      if (injuriesArray.length > 0) {
        // STEP 3: Test Elite calculation for SF @ TB
        console.log('🔍 Step 3: Testing Elite calculation...');
        try {
          const { calculateEliteInjuryAdjustment } = await import('./_lib/elite-injury-penalty-calculator.mjs');
          
          const homeInjuries = injuriesArray.filter(i => i.team === 'TB');
          const awayInjuries = injuriesArray.filter(i => i.team === 'SF');
          
          const eliteResult = calculateEliteInjuryAdjustment(homeInjuries, awayInjuries, -3);
          
          diagnostics.step3_eliteCalculation = {
            success: true,
            homeTotal: eliteResult.home.total,
            awayTotal: eliteResult.away.total,
            netSpreadImpact: eliteResult.netSpreadImpact,
            kellyReduction: eliteResult.stakingReduction.factor,
            shouldShowIcons: {
              home: homeInjuries.length > 0 && eliteResult.home.total > 1.0,
              away: awayInjuries.length > 0 && eliteResult.away.total > 1.0
            }
          };
        } catch (calcError) {
          diagnostics.step3_eliteCalculation = {
            success: false,
            error: calcError.message
          };
        }
      } else {
        diagnostics.step2_conversion.success = false;
        diagnostics.step2_conversion.error = 'No injuries converted';
      }
    } else {
      diagnostics.step1_loadInjuries.success = false;
      diagnostics.step1_loadInjuries.error = 'No injury teams data';
    }

  } catch (error) {
    console.error('❌ Elite Injury diagnostic error:', error);
    diagnostics.error = {
      message: error.message,
      stack: error.stack
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(diagnostics, null, 2)
  };
};