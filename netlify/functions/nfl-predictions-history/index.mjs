// netlify/functions/nfl-predictions-history/index.mjs
// Retrieve historical predictions and results

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const season = url.searchParams.get('season') || '2025';
    const week = url.searchParams.get('week');
    const format = url.searchParams.get('format') || 'json';

    if (!week) {
      return new Response(JSON.stringify({ 
        error: 'Week parameter is required' 
      }), { status: 400 });
    }

    // In a real implementation, you'd query your database/storage
    // For now, return a mock structure showing what historical data would look like
    
    const mockHistoricalData = {
      season: parseInt(season),
      week: parseInt(week),
      archived_at: `${season}-${String(week).padStart(2, '0')}-15T18:00:00Z`, // Mock kickoff time
      
      // Original predictions at time of archive
      predictions: [
        {
          game_id: `${season}_${String(week).padStart(2, '0')}_SEA_ARI`,
          home_team: 'ARI', 
          away_team: 'SEA',
          kickoff: `${season}-${String(week).padStart(2, '0')}-15T18:00:00Z`,
          
          // Archived predictions
          predictions: {
            moneyline: {
              pick: 'SEA',
              confidence: 54,
              edge: 1.2,
              betRecommendation: 'BET'
            },
            spread: {
              pick: 'SEA',
              confidence: 56,
              line: -1.5,
              predicted: 2.4,
              model_home_margin: -2.4,
              edge: 0.9,
              betRecommendation: 'NO BET'
            },
            total: {
              pick: 'under',
              confidence: 52,
              line: 47.5,
              predicted: 45.2,
              edge: 2.3,
              betRecommendation: 'BET'
            }
          },
          
          // Closing lines (captured at kickoff)
          closing_odds: {
            moneyline: { home: 145, away: -165 },
            spread: { line: -1.5, home: -110, away: -110 },
            total: { line: 47.5, over: -105, under: -115 }
          },
          
          // Actual results (would be populated after game)
          results: {
            final_score: { home: 21, away: 24 },
            moneyline_result: 'away_win', // SEA wins
            spread_result: 'away_cover',  // SEA -1.5 covers (won by 3)
            total_result: 'under'         // 45 total points under 47.5
          },
          
          // Performance analysis
          accuracy: {
            moneyline: { correct: true, edge_realized: 1.2 },
            spread: { correct: true, edge_realized: 0.9 },
            total: { correct: true, edge_realized: 2.3 }
          }
        }
      ],
      
      // Week summary
      week_performance: {
        games_predicted: 16,
        moneyline_accuracy: 0.625,  // 10/16
        spread_accuracy: 0.563,     // 9/16
        total_accuracy: 0.688,      // 11/16
        average_edge: 1.4,
        roi: 0.087 // 8.7% return
      }
    };

    return new Response(JSON.stringify({
      success: true,
      message: `Historical data for Week ${week}, ${season}`,
      data: mockHistoricalData,
      note: "This is mock historical data - in production would query archived predictions"
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('History retrieval error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to retrieve historical predictions',
      details: error.message 
    }), { status: 500 });
  }
};