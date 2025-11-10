/**
 * NBA Tracking Stats Viewer
 * 
 * Query and display historical tracking data
 * Provides aggregated statistics across all predictions
 */

import { getStore } from '@netlify/blobs';

/**
 * Get comprehensive stats for games
 */
async function getGameStats() {
  const store = getStore('nba-tracking');
  
  const summary = await store.get('games-stats-summary', { type: 'json' }) || {
    byDate: {},
    overall: { total: 0, correct: 0, incorrect: 0, winRate: 0 }
  };
  
  // Calculate additional metrics
  const dates = Object.keys(summary.byDate).sort().reverse();
  const recentDates = dates.slice(0, 7); // Last 7 days
  
  let last7Days = { total: 0, correct: 0 };
  for (const date of recentDates) {
    const day = summary.byDate[date];
    last7Days.total += day.total;
    last7Days.correct += day.correct;
  }
  last7Days.winRate = last7Days.total > 0 
    ? (last7Days.correct / last7Days.total * 100).toFixed(1)
    : 0;
  
  return {
    overall: summary.overall,
    last7Days,
    byDate: summary.byDate,
    datesTracked: dates.length
  };
}

/**
 * Get comprehensive stats for props
 */
async function getPropStats() {
  const store = getStore('nba-tracking');
  
  const summary = await store.get('props-stats-summary', { type: 'json' }) || {
    byDate: {},
    overall: {
      total: 0,
      hits: 0,
      misses: 0,
      dnp: 0,
      winRate: 0,
      rebounds: { total: 0, hits: 0, winRate: 0 },
      assists: { total: 0, hits: 0, winRate: 0 }
    }
  };
  
  // Calculate additional metrics
  const dates = Object.keys(summary.byDate).sort().reverse();
  const recentDates = dates.slice(0, 7);
  
  let last7Days = {
    total: 0,
    hits: 0,
    rebounds: { total: 0, hits: 0 },
    assists: { total: 0, hits: 0 }
  };
  
  for (const date of recentDates) {
    const day = summary.byDate[date];
    last7Days.total += day.total;
    last7Days.hits += day.hits;
    last7Days.rebounds.total += day.rebounds.total;
    last7Days.rebounds.hits += day.rebounds.hits;
    last7Days.assists.total += day.assists.total;
    last7Days.assists.hits += day.assists.hits;
  }
  
  last7Days.winRate = last7Days.total > 0 
    ? (last7Days.hits / last7Days.total * 100).toFixed(1)
    : 0;
  last7Days.rebounds.winRate = last7Days.rebounds.total > 0
    ? (last7Days.rebounds.hits / last7Days.rebounds.total * 100).toFixed(1)
    : 0;
  last7Days.assists.winRate = last7Days.assists.total > 0
    ? (last7Days.assists.hits / last7Days.assists.total * 100).toFixed(1)
    : 0;
  
  return {
    overall: summary.overall,
    last7Days,
    byDate: summary.byDate,
    datesTracked: dates.length
  };
}

/**
 * Get detailed results for a specific date
 */
async function getDateResults(date, type = 'both') {
  const store = getStore('nba-tracking');
  
  const results = {};
  
  if (type === 'games' || type === 'both') {
    const gameResults = await store.get(`games-results:${date}`, { type: 'json' });
    results.games = gameResults || [];
  }
  
  if (type === 'props' || type === 'both') {
    const propResults = await store.get(`props-results:${date}`, { type: 'json' });
    results.props = propResults || [];
  }
  
  return results;
}

/**
 * Get all tracked dates
 */
async function getTrackedDates() {
  const store = getStore('nba-tracking');
  
  const gamesSummary = await store.get('games-stats-summary', { type: 'json' }) || { byDate: {} };
  const propsSummary = await store.get('props-stats-summary', { type: 'json' }) || { byDate: {} };
  
  const gameDates = Object.keys(gamesSummary.byDate);
  const propDates = Object.keys(propsSummary.byDate);
  
  const allDates = [...new Set([...gameDates, ...propDates])].sort().reverse();
  
  return allDates.map(date => ({
    date,
    hasGames: gameDates.includes(date),
    hasProps: propDates.includes(date)
  }));
}

/**
 * Netlify Function handler
 */
export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'summary';
    const date = url.searchParams.get('date');
    const type = url.searchParams.get('type') || 'both';
    
    let result;
    
    switch (action) {
      case 'summary':
        const [gameStats, propStats] = await Promise.all([
          getGameStats(),
          getPropStats()
        ]);
        result = {
          games: gameStats,
          props: propStats,
          generatedAt: new Date().toISOString()
        };
        break;
        
      case 'games':
        result = await getGameStats();
        break;
        
      case 'props':
        result = await getPropStats();
        break;
        
      case 'date':
        if (!date) {
          return new Response(JSON.stringify({
            error: 'Date parameter required for date action'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        result = await getDateResults(date, type);
        break;
        
      case 'dates':
        result = await getTrackedDates();
        break;
        
      default:
        return new Response(JSON.stringify({
          error: 'Invalid action. Use: summary, games, props, date, or dates'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300' // Cache for 5 minutes
      }
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Export functions for internal use
export { getGameStats, getPropStats, getDateResults, getTrackedDates };
