
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
  let week = Math.max(1, Math.min(18, Math.floor(diffDays / 7) + 1));
  
  // SMART WEEK LOGIC: Check if current week has upcoming games
  // Load schedule to see if current week games are in the future
  try {
    const fs = await import('fs');
    const schedulePaths = [
      'public/data/nfl-schedule-2025.json',
      '/opt/buildhome/repo/public/data/nfl-schedule-2025.json',
      '/var/task/public/data/nfl-schedule-2025.json',
      process.cwd() + '/public/data/nfl-schedule-2025.json'
    ];
    
    let schedule = null;
    for (const path of schedulePaths) {
      try {
        const content = fs.readFileSync(path, 'utf8');
        schedule = JSON.parse(content);
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (schedule) {
      // Check if current week has games in the future
      const currentWeekGames = schedule.filter(g => g.week === week);
      const upcomingGames = currentWeekGames.filter(g => new Date(g.gameday) > targetDate);
      
      if (upcomingGames.length > 0) {
        console.log(`📅 Week ${week} has ${upcomingGames.length} upcoming games - staying on Week ${week}`);
      } else {
        // Current week games are over, advance to next week
        week = Math.min(18, week + 1);
        console.log(`📅 Week ${week - 1} games complete - advancing to Week ${week}`);
      }
    } else {
      console.log(`⚠️ Could not load schedule, using Week ${week}`);
    }
  } catch (error) {
    console.error('Error checking schedule:', error);
  }
  
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
        
        // Get first_td and multiple_td data too
        const firstTdData = player.first_td || {};
        const multipleTdData = player.multiple_td || {};
        
        candidates.push({
          // Player info (UI expects these exact field names!)
          playerName: player.name,
          playerId: player.player_id,
          position: player.position,
          team: player.team,
          opponent: game.home_team === player.team ? game.away_team : game.home_team,
          isHome: game.home_team === player.team,
          gameId: game.game_id,
          
          // Depth info (UI expects 'depth' not 'depthChartPosition')
          depth: player.depth_chart_position,
          
          // Market data - anytime TD (UI expects nested anytimeTd object)
          anytimeTd: {
            probability: prob,
            bestOdds: anytimeData.best_odds,
            bestBook: anytimeData.best_book,
            edge: edge,
            ev: EV,
            confidence: anytimeData.books_count > 1 ? 80 : 60,
            impliedProb: anytimeData.implied_prob,
            booksCount: anytimeData.books_count,
            books_count: anytimeData.books_count, // UI expects snake_case
            odds_qualified: anytimeData.odds_qualified || (anytimeData.books_count >= 2)
          },
          
          // First TD market
          firstTd: {
            probability: firstTdData.probability || 0,
            bestOdds: firstTdData.best_odds || null,
            bestBook: firstTdData.best_book || null,
            edge: firstTdData.edge || 0,
            ev: firstTdData.edge || 0,
            confidence: firstTdData.books_count > 1 ? 80 : 60,
            booksCount: firstTdData.books_count || 0,
            books_count: firstTdData.books_count || 0,
            odds_qualified: (firstTdData.books_count || 0) >= 2
          },
          
          // Multiple TD market
          multipleTd: {
            probability: multipleTdData.probability || 0,
            bestOdds: multipleTdData.best_odds || null,
            bestBook: multipleTdData.best_book || null,
            edge: multipleTdData.edge || 0,
            ev: multipleTdData.edge || 0,
            confidence: multipleTdData.books_count > 1 ? 80 : 60,
            booksCount: multipleTdData.books_count || 0,
            books_count: multipleTdData.books_count || 0,
            odds_qualified: (multipleTdData.books_count || 0) >= 2
          },
          
          // Additional context
          injuryStatus: player.injury_status,
          probPlay: player.prob_play,
          keyFactors: player.key_factors || {}
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

export { handler };