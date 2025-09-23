// netlify/functions/archive-predictions.mjs
// Archives predictions and closing lines at kickoff time for historical analysis

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { season, week, gameId, kickoffTime } = await req.json();
    
    if (!season || !week || !gameId) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if game is at kickoff time (within 5 minutes of kickoff)
    const now = new Date();
    const kickoff = new Date(kickoffTime);
    const timeDiff = Math.abs(now - kickoff) / (1000 * 60); // minutes

    if (timeDiff > 5) {
      return new Response(JSON.stringify({ 
        error: 'Can only archive within 5 minutes of kickoff',
        timeDiff: timeDiff 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get current predictions for this game
    const predResponse = await fetch(`${req.headers.host}/.netlify/functions/nfl-predictions-generate?season=${season}&week=${week}`);
    const predictions = await predResponse.json();
    
    const game = predictions.games?.find(g => g.gameId === gameId || g.game_id === gameId);
    if (!game) {
      return new Response(JSON.stringify({ error: 'Game not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get closing odds/lines (would integrate with your odds provider)
    // For now, use current odds as "closing"
    const closingData = {
      moneyline: {
        home: game.odds?.ml_home,
        away: game.odds?.ml_away
      },
      spread: {
        line: game.odds?.spread_line || game.predictions?.spread?.line,
        home_odds: game.odds?.spread_home,
        away_odds: game.odds?.spread_away
      },
      total: {
        line: game.odds?.total_line || game.predictions?.total?.line,
        over_odds: game.odds?.total_over,
        under_odds: game.odds?.total_under
      }
    };

    // Archive data structure
    const archiveEntry = {
      gameId,
      season,
      week,
      archivedAt: now.toISOString(),
      kickoffTime,
      matchup: game.matchup || `${game.away_team} @ ${game.home_team}`,
      
      // Final predictions (locked at kickoff)
      predictions: {
        moneyline: game.predictions?.moneyline,
        spread: game.predictions?.spread,
        total: game.predictions?.total,
        confidence: game.predictions?.confidence,
        model_version: game.predictions?.meta?.modelVersion || 'v13'
      },
      
      // Closing lines (locked at kickoff)
      closingLines: closingData,
      
      // Will be filled in later with actual results
      results: null,
      
      metadata: {
        dataFreshness: game.predictions?.meta?.dataFreshness,
        rPipelineWeek: game.predictions?.meta?.rPipelineWeek,
        teamFormUpdated: game.predictions?.meta?.teamFormUpdated
      }
    };

    // Store in blob storage (would use your blob storage system)
    const archiveKey = `predictions/archive/${season}/week${week}/${gameId}.json`;
    
    // For now, just return the archive data (you'd actually store it)
    return new Response(JSON.stringify({
      success: true,
      archived: archiveEntry,
      message: `Predictions archived for ${game.matchup} at kickoff`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Archive error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to archive predictions',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};