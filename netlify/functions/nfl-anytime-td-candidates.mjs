
// netlify/functions/nfl-anytime-td-candidates.mjs
// Proxy to comprehensive TD predictions with odds-first EV approach
import comprehensiveHandler from './nfl-td-comprehensive-predictions/index.mjs';

async function getWeekGamesFromSchedule(date, weekMode) {
  const season = '2025';
  const targetDate = new Date(date);
  
  // Simple week calculation from September 5 start
  const seasonStart = new Date('2025-09-04');
  const diffTime = targetDate.getTime() - seasonStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const week = Math.max(1, Math.min(18, Math.floor(diffDays / 7) + 1));
  
  console.log(`📅 Date ${date} maps to Week ${week}`);
  return { season, week };
}

export async function handler(event) {
  try {
    console.log('🔄 nfl-anytime-td-candidates proxy called');
    
    // Parse request params
    const params = event.queryStringParameters || {};
    const date = params.date || new Date().toISOString().split('T')[0];
    const weekMode = params.mode === 'week';
    
    console.log(`📅 Request: date=${date}, mode=${params.mode || 'day'}, weekMode=${weekMode}`);
    
    // Get week number from date
    const { season, week } = await getWeekGamesFromSchedule(date, weekMode);
    
    // Create request object for comprehensive handler
    const comprehensiveRequest = new Request(
      `https://example.com/nfl-td-comprehensive-predictions?season=${season}&week=${week}`,
      {
        method: 'GET',
        headers: event.headers
      }
    );
    
    // Call comprehensive predictions function
    console.log(`🔄 Calling comprehensive TD predictions for Week ${week}...`);
    const response = await comprehensiveHandler(comprehensiveRequest, {});
    
    // Parse the comprehensive response (Response object from Netlify function)
    const responseText = await response.text();
    const comprehensiveData = JSON.parse(responseText);
    
    if (!comprehensiveData.success) {
      throw new Error(comprehensiveData.message || 'Comprehensive predictions failed');
    }
    
    // Transform comprehensive predictions to candidates format expected by UI
    const candidates = [];
    
    for (const game of comprehensiveData.predictions || []) {
      for (const player of game.players || []) {
        // Only include players with positive EV or reasonable probability
        const anytimeData = player.anytime_td || {};
        const prob = anytimeData.probability;
        const edge = anytimeData.edge;
        const hasOdds = anytimeData.books_count > 0;
        
        // Include if: 
        // - Has +EV (even small)
        // - Has odds AND prob >20%
        // - Top starters (prob >30%) - catches RB1s, WR1s in all offenses
        // - Skill positions in top 2 depth spots with >15% - catches TE1s, WR2s in bad offenses
        // - QBs with >8% (mobile QBs who rush TDs)
        const isTopDepth = ['RB', 'WR', 'TE'].includes(player.position) && player.depth_chart_position <= 2;
        const isMobileQB = player.position === 'QB' && prob > 0.08;
        
        const includePlayer = (
          (edge != null && edge > 0) ||
          (hasOdds && prob > 0.20) ||
          (prob > 0.30) ||
          (isTopDepth && prob > 0.15) ||
          isMobileQB
        );
        
        if (!includePlayer) continue;
        
        // Calculate EV for UI display
        const EV = edge; // Already calculated in comprehensive
        
        candidates.push({
          name: player.name,
          position: player.position,
          team: player.team,
          opponent: game.home_team === player.team ? game.away_team : game.home_team,
          isHome: game.home_team === player.team,
          
          // Model probability (0-1 decimal)
          modelProb: prob,
          
          // Market data
          bestOdds: anytimeData.best_odds,
          bestBook: anytimeData.best_book,
          booksCount: anytimeData.books_count,
          impliedProb: anytimeData.implied_prob,
          
          // Edge & EV
          edge: edge,
          EV: EV,
          
          // Additional context
          depthChartPosition: player.depth_chart_position,
          injuryStatus: player.injury_status,
          probPlay: player.prob_play,
          
          // Key factors for analysis
          keyFactors: player.key_factors || {},
          
          // Metadata
          hasOdds: hasOdds,
          oddsQualified: anytimeData.odds_qualified || false
        });
      }
    }
    
    // Sort by EV descending (nulls last)
    candidates.sort((a, b) => {
      if (a.EV == null && b.EV == null) return b.modelProb - a.modelProb;
      if (a.EV == null) return 1;
      if (b.EV == null) return -1;
      return b.EV - a.EV;
    });
    
    console.log(`✅ Generated ${candidates.length} candidates from comprehensive predictions`);
    console.log(`   Metadata: ${JSON.stringify(comprehensiveData.metadata)}`);
    
    // Count games from predictions
    const gamesCount = comprehensiveData.predictions?.length || 0;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        ok: true,
        candidates: candidates,
        info: {
          games: gamesCount,
          props: candidates.length,
          mode: weekMode ? 'week' : 'day',
          model: comprehensiveData.metadata?.model,
          generated_at: comprehensiveData.metadata?.generated_at,
          has_canonical_availability: comprehensiveData.metadata?.uses_canonical_availability,
          data_source: comprehensiveData.metadata?.data_source
        }
      })
    };
    
  } catch (error) {
    console.error('❌ Error in TD candidates proxy:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        ok: false,
        error: error.message,
        candidates: [],
        info: { games: 0, props: 0, mode: 'error' }
      })
    };
  }
}
