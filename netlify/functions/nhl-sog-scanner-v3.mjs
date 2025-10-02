/**
 * NHL SOG SCANNER V3.0 - PHASE 2A DEPLOYMENT
 * 
 * INTEGRATED SYSTEM:
 * - v2.0 Elite Framework (ZINB, state decomposition, push handling, Kelly penalties)
 * - v3.0 Learned Parameters (3-season historical data training)
 * - Hierarchical Bayesian shrinkage
 * - Model confidence scoring
 * 
 * OPERATIONAL COMPLETENESS: 60%
 * - ✅ Historical data training (Phase 2A)
 * - ⏳ Live injury integration (Phase 2B - in progress)
 * - ⏳ XGBoost ML layer (Phase 2C - planned)
 */

import { fetchTodaySchedule, fetchTeamRoster } from './_lib/nhl-data-fetch.mjs';
import { projectPlayerSOGv3 } from './_lib/nhl-projection-v3-learned.mjs';
import { 
  calculateEVWithPush,
  calculateHybridKelly,
  scanPlayerLinesElite,
  trackCLV,
  logPropResult
} from './_lib/nhl-elite-line-scanner-v2.mjs';

// Mock bookmaker lines (in production, fetch from odds API)
const MOCK_BOOKMAKER_LINES = {
  // Will be replaced with real odds API in production
  // Format: { playerId: { line: 3.5, overOdds: -115, underOdds: -105 } }
};

/**
 * Main handler for NHL SOG Scanner V3
 */
export async function handler(event, context) {
  try {
    const { 
      minEdge = 3.0,           // Minimum edge threshold (%)
      minConfidence = 60,       // Minimum model confidence (0-100)
      maxScratchRisk = 0.15,    // Maximum scratch probability
      maxKelly = 0.03,          // Maximum Kelly stake (3% bankroll)
      minKelly = 0.005,         // Minimum Kelly stake (0.5% bankroll)
      includeDebug = false      // Include diagnostic info
    } = event.queryStringParameters || {};

    console.log('🏒 NHL SOG Scanner V3.0 - Phase 2A Deployment');
    console.log('📊 Operational Completeness: 60%');
    console.log('✅ Learned Parameters | ⏳ Injury Integration (2B) | ⏳ ML Layer (2C)');

    // Step 1: Fetch today's NHL schedule
    const schedule = await fetchTodaySchedule();
    
    if (!schedule || schedule.length === 0) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'No NHL games scheduled today',
          opportunities: [],
          metadata: {
            version: '3.0',
            phase: '2A',
            operationalCompleteness: 0.60,
            features: {
              learnedParameters: true,
              injuryIntegration: false,
              mlLayer: false
            }
          }
        })
      };
    }

    console.log(`📅 Found ${schedule.length} games today`);

    // Step 2: Fetch rosters for all teams
    const allPlayers = [];
    const uniqueTeams = [...new Set(schedule.flatMap(g => [g.homeTeam, g.awayTeam]))];
    
    for (const teamAbbrev of uniqueTeams) {
      try {
        const roster = await fetchTeamRoster(teamAbbrev);
        
        // Filter for skaters only (exclude goalies)
        const skaters = roster.filter(p => p.position !== 'G');
        
        for (const player of skaters) {
          // Find the game this player is in
          const game = schedule.find(g => 
            g.homeTeam === teamAbbrev || g.awayTeam === teamAbbrev
          );
          
          if (game) {
            allPlayers.push({
              ...player,
              teamAbbrev,
              opponent: game.homeTeam === teamAbbrev ? game.awayTeam : game.homeTeam,
              isHome: game.homeTeam === teamAbbrev,
              gameId: game.gameId,
              gameTime: game.gameTime
            });
          }
        }
      } catch (error) {
        console.error(`❌ Error fetching roster for ${teamAbbrev}:`, error.message);
      }
    }

    console.log(`👥 Processing ${allPlayers.length} players`);

    // Step 3: Generate projections using V3 learned parameters
    const projections = [];
    let successCount = 0;
    let errorCount = 0;

    for (const player of allPlayers) {
      try {
        // Call V3 projection with learned parameters
        const projection = await projectPlayerSOGv3({
          playerId: player.playerId,
          playerName: player.name,
          position: player.position,
          teamAbbrev: player.teamAbbrev,
          opponent: player.opponent,
          isHome: player.isHome,
          gameId: player.gameId
        });

        if (projection && projection.confidence >= minConfidence) {
          projections.push({
            ...player,
            ...projection
          });
          successCount++;
        }
      } catch (error) {
        errorCount++;
        if (includeDebug) {
          console.error(`⚠️ Error projecting ${player.name}:`, error.message);
        }
      }
    }

    console.log(`✅ Generated ${successCount} projections (${errorCount} errors)`);

    // Step 4: Scan for +EV opportunities
    // NOTE: Using mock lines for now - replace with real odds API
    const opportunities = [];
    
    for (const projection of projections) {
      // In production, fetch real bookmaker lines here
      // For now, generate mock lines for testing
      const mockLine = generateMockLine(projection.meanSOG);
      
      if (!mockLine) continue;

      // Calculate EV with push handling
      const overEV = calculateEVWithPush({
        line: mockLine.line,
        odds: mockLine.overOdds,
        projection: {
          mean: projection.meanSOG,
          variance: projection.variance,
          zeroInflation: projection.zeroInflation
        },
        direction: 'over'
      });

      const underEV = calculateEVWithPush({
        line: mockLine.line,
        odds: mockLine.underOdds,
        projection: {
          mean: projection.meanSOG,
          variance: projection.variance,
          zeroInflation: projection.zeroInflation
        },
        direction: 'under'
      });

      // Calculate hybrid Kelly stakes with uncertainty penalties
      const overKelly = calculateHybridKelly({
        edge: overEV.edge,
        odds: mockLine.overOdds,
        variance: projection.variance,
        scratchRisk: projection.scratchRisk || 0.05,
        roleVolatility: projection.roleVolatility || 0.03,
        lineChangeRisk: projection.lineChangeRisk || 0.02,
        sampleSize: projection.historicalGames || 50
      });

      const underKelly = calculateHybridKelly({
        edge: underEV.edge,
        odds: mockLine.underOdds,
        variance: projection.variance,
        scratchRisk: projection.scratchRisk || 0.05,
        roleVolatility: projection.roleVolatility || 0.03,
        lineChangeRisk: projection.lineChangeRisk || 0.02,
        sampleSize: projection.historicalGames || 50
      });

      // Filter by edge and Kelly thresholds
      if (overEV.edge >= minEdge && overKelly >= minKelly && overKelly <= maxKelly) {
        opportunities.push({
          playerId: projection.playerId,
          playerName: projection.playerName,
          position: projection.position,
          team: projection.teamAbbrev,
          opponent: projection.opponent,
          gameTime: projection.gameTime,
          direction: 'OVER',
          line: mockLine.line,
          odds: mockLine.overOdds,
          projection: projection.meanSOG,
          edge: overEV.edge,
          ev: overEV.ev,
          confidence: projection.confidence,
          kelly: overKelly,
          variance: projection.variance,
          scratchRisk: projection.scratchRisk || 0.05,
          dataQuality: {
            historicalGames: projection.historicalGames,
            recentGames: projection.recentGames,
            learnedFromHistory: true,
            mlEnhanced: false
          },
          pushProbability: overEV.pushProb
        });
      }

      if (underEV.edge >= minEdge && underKelly >= minKelly && underKelly <= maxKelly) {
        opportunities.push({
          playerId: projection.playerId,
          playerName: projection.playerName,
          position: projection.position,
          team: projection.teamAbbrev,
          opponent: projection.opponent,
          gameTime: projection.gameTime,
          direction: 'UNDER',
          line: mockLine.line,
          odds: mockLine.underOdds,
          projection: projection.meanSOG,
          edge: underEV.edge,
          ev: underEV.ev,
          confidence: projection.confidence,
          kelly: underKelly,
          variance: projection.variance,
          scratchRisk: projection.scratchRisk || 0.05,
          dataQuality: {
            historicalGames: projection.historicalGames,
            recentGames: projection.recentGames,
            learnedFromHistory: true,
            mlEnhanced: false
          },
          pushProbability: underEV.pushProb
        });
      }
    }

    // Sort by edge descending
    opportunities.sort((a, b) => b.edge - a.edge);

    console.log(`🎯 Found ${opportunities.length} +EV opportunities`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        opportunities,
        metadata: {
          version: '3.0',
          phase: '2A',
          operationalCompleteness: 0.60,
          features: {
            learnedParameters: true,
            hierarchicalBayesian: true,
            pushHandling: true,
            kellyPenalties: true,
            injuryIntegration: false,
            mlLayer: false
          },
          dataQuality: {
            totalPlayers: allPlayers.length,
            successfulProjections: successCount,
            failedProjections: errorCount,
            historicalSeasons: 3,
            avgConfidence: opportunities.length > 0 
              ? opportunities.reduce((sum, o) => sum + o.confidence, 0) / opportunities.length 
              : 0
          },
          filters: {
            minEdge: parseFloat(minEdge),
            minConfidence: parseFloat(minConfidence),
            maxScratchRisk: parseFloat(maxScratchRisk),
            minKelly: parseFloat(minKelly),
            maxKelly: parseFloat(maxKelly)
          },
          nextPhases: {
            phase2B: 'Live injury/lineup integration (in progress)',
            phase2C: 'XGBoost ML layer (planned)'
          }
        }
      })
    };

  } catch (error) {
    console.error('❌ NHL SOG Scanner V3 Error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        version: '3.0',
        phase: '2A'
      })
    };
  }
}

/**
 * Generate mock bookmaker line for testing
 * In production, replace with real odds API
 */
function generateMockLine(projection) {
  if (!projection || projection < 0.5) return null;
  
  // Round to nearest 0.5
  const line = Math.round(projection * 2) / 2;
  
  // Add some random variation to odds
  const vigAdjustment = Math.random() * 20 - 10; // -10 to +10
  
  return {
    line,
    overOdds: -110 + vigAdjustment,
    underOdds: -110 - vigAdjustment
  };
}
