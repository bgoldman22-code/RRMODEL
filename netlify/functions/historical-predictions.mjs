// netlify/functions/historical-predictions.mjs
// Retrieves archived predictions and results for historical analysis

export default async (req, context) => {
  const url = new URL(req.url);
  const season = url.searchParams.get('season') || '2025';
  const week = url.searchParams.get('week');
  const gameId = url.searchParams.get('gameId');

  try {
    // If specific game requested
    if (gameId) {
      // Would retrieve from blob storage
      const archiveKey = `predictions/archive/${season}/week${week}/${gameId}.json`;
      
      // For demo, return sample historical data
      const sampleData = {
        gameId,
        season: parseInt(season),
        week: parseInt(week),
        archivedAt: '2025-09-19T17:00:00Z',
        kickoffTime: '2025-09-19T17:00:00Z',
        matchup: 'SEA @ ARI',
        
        predictions: {
          moneyline: {
            pick: 'ARI',
            confidence: 56,
            edge: 0.9,
            betRecommendation: 'NO BET',
            skipReason: 'low-edge'
          },
          spread: {
            pick: 'ARI',
            confidence: 58,
            line: -1.5,
            predicted: 2.4,
            edge: 3.9,
            betRecommendation: 'NO BET',
            model_home_margin: 2.4
          },
          total: {
            pick: 'Under',
            confidence: 61,
            line: 47.5,
            predicted: 44.2,
            edge: 3.3,
            betRecommendation: 'BET'
          }
        },
        
        closingLines: {
          moneyline: { home: -118, away: +102 },
          spread: { line: -1.5, home_odds: -110, away_odds: -110 },
          total: { line: 47.5, over_odds: -108, under_odds: -112 }
        },
        
        // Actual results (filled in after game)
        results: {
          finalScore: { home: 24, away: 21 },
          margin: 3, // home team margin
          total: 45,
          outcomes: {
            moneyline: 'ARI', // who won
            spread: 'ARI', // who covered
            total: 'Under' // over/under result
          },
          modelAccuracy: {
            moneyline: true, // model picked correctly
            spread: true,
            total: true
          }
        },
        
        performance: {
          moneylineResult: 'CORRECT',
          spreadResult: 'CORRECT', 
          totalResult: 'CORRECT',
          betResults: {
            moneyline: 'NO BET',
            spread: 'NO BET', 
            total: 'WIN' // only bet was total under
          },
          roi: {
            moneyline: 0, // didn't bet
            spread: 0,   // didn't bet
            total: 0.89  // won the under bet
          }
        }
      };

      return new Response(JSON.stringify(sampleData), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If week requested, return all games from that week
    if (week) {
      const weekGames = [
        {
          gameId: 'SEA_ARI_2025_W4',
          matchup: 'SEA @ ARI',
          kickoffTime: '2025-09-19T17:00:00Z',
          status: 'FINAL',
          predictionAccuracy: { correct: 3, total: 3 },
          betResults: { wins: 1, losses: 0, noBets: 2 }
        }
        // ... more games
      ];

      return new Response(JSON.stringify({
        season: parseInt(season),
        week: parseInt(week),
        games: weekGames,
        summary: {
          totalGames: weekGames.length,
          predictionAccuracy: '100%',
          betRecord: '1-0-2'
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return season summary
    const seasonSummary = {
      season: parseInt(season),
      weeks: [1, 2, 3, 4], // available weeks
      overallStats: {
        totalGames: 48,
        predictionAccuracy: {
          moneyline: '67%',
          spread: '58%', 
          total: '71%'
        },
        bettingRecord: {
          wins: 12,
          losses: 8,
          noBets: 28,
          roi: '+4.7%'
        }
      }
    };

    return new Response(JSON.stringify(seasonSummary), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Historical data error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to retrieve historical data',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};