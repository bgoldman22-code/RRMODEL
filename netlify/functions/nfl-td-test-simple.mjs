/**
 * NFL TD SCANNER - Full Week View
 * 
 * Shows all anytime TD opportunities for the current week
 * with model probabilities and edges from comprehensive predictions
 */

import { handler as candidatesHandler } from './nfl-anytime-td-candidates.mjs';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  try {
    console.log('🏈 NFL TD Scanner - Fetching full week predictions...');
    
    // Get current week's comprehensive predictions
    const params = event.queryStringParameters || {};
    const date = params.date || new Date().toISOString().split('T')[0];
    
    // Call candidates handler (which wraps comprehensive predictions)
    const candidatesEvent = {
      ...event,
      queryStringParameters: {
        date,
        mode: 'week' // Get full week of games
      }
    };
    
    const response = await candidatesHandler(candidatesEvent, context);
    const responseData = JSON.parse(response.body);
    
    if (!responseData.ok) {
      throw new Error(responseData.error || 'Failed to get predictions');
    }
    
    console.log(`✅ Got ${responseData.candidates?.length || 0} candidates`);
    
    // Transform candidates to simple display format
    const players = (responseData.candidates || []).map(c => {
      const anytimeData = c.anytimeTd || {};
      
      return {
        name: c.playerName,
        position: c.position,
        team: c.team,
        opponent: c.opponent,
        game: c.isHome ? `${c.opponent} @ ${c.team}` : `${c.team} @ ${c.opponent}`,
        gameday: c.gameday,
        gametime: c.gametime,
        weekday: c.weekday,
        bestOdds: anytimeData.bestOdds,
        bestBook: anytimeData.bestBook,
        books_count: anytimeData.booksCount || 0,
        implied_probability: anytimeData.impliedProb,
        model_probability: anytimeData.probability,
        edge: anytimeData.edge,
        depth: c.depth
      };
    });
    
    // Sort by edge descending (nulls last)
    players.sort((a, b) => {
      if (a.edge == null && b.edge == null) return (b.model_probability || 0) - (a.model_probability || 0);
      if (a.edge == null) return 1;
      if (b.edge == null) return -1;
      return b.edge - a.edge;
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: players.length,
        players,
        week: responseData.info?.week,
        season: responseData.info?.season,
        generated_at: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('❌ TD Scanner error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        generated_at: new Date().toISOString()
      })
    };
  }
}
