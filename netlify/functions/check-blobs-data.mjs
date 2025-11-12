import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const store = getStore('nba-data');

  console.log('🔍 Checking Blobs for NBA data...\n');

  try {
    // Check what keys exist
    const [historical, current] = await Promise.all([
      store.get('player-boxscores-historical', { type: 'json' }),
      store.get('player-boxscores-current', { type: 'json' })
    ]);

    const report = {
      historical: null,
      current: null,
      combined: null
    };

    if (historical) {
      const dates = [...new Set(historical.map(b => b.gameDate))].sort();
      const teams = [...new Set(historical.map(b => b.teamTricode))].sort();
      report.historical = {
        entries: historical.length,
        dateRange: { start: dates[0], end: dates[dates.length - 1] },
        totalDates: dates.length,
        teams: teams,
        sampleEntry: historical[0]
      };
    }

    if (current) {
      const dates = [...new Set(current.map(b => b.gameDate))].sort();
      const teams = [...new Set(current.map(b => b.teamTricode))].sort();
      const mostRecent = dates[dates.length - 1];
      const hoursSinceUpdate = (Date.now() - new Date(mostRecent)) / (1000 * 60 * 60);
      
      report.current = {
        entries: current.length,
        dateRange: { start: dates[0], end: dates[dates.length - 1] },
        totalDates: dates.length,
        teams: teams,
        mostRecentGame: mostRecent,
        hoursSinceUpdate: hoursSinceUpdate.toFixed(1),
        sampleEntry: current[0]
      };

      // Check for specific players
      const kdEntries = current.filter(b => b.playerName === 'Kevin Durant');
      if (kdEntries.length > 0) {
        report.current.kevinDurantTeams = [...new Set(kdEntries.map(b => b.teamTricode))];
      }
    }

    // Combined stats
    if (historical && current) {
      const allData = [...historical, ...current];
      const dates = [...new Set(allData.map(b => b.gameDate))].sort();
      report.combined = {
        totalEntries: allData.length,
        dateRange: { start: dates[0], end: dates[dates.length - 1] },
        totalDates: dates.length
      };
    }

    return new Response(JSON.stringify(report, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
