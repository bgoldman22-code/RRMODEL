/**
 * Manual Cache Warmup Endpoint
 * Allows manual cache priming for incident recovery
 * 
 * Updated: November 12, 2025
 * Requires: NBA_WARMUP_SECRET environment variable
 */

import { getStore } from '@netlify/blobs';
import fetch from 'node-fetch';
import { FEATURE_FLAGS, BLOB_SCHEMA_VERSION, formatESPNDate, daysAgo } from './lib/constants.mjs';

export default async function handler(event, context) {
  // ==========================================================================
  // AUTH CHECK
  // ==========================================================================
  
  const providedSecret = event.headers['x-warmup-secret'] || event.headers['X-Warmup-Secret'];
  const expectedSecret = FEATURE_FLAGS.WARMUP_SECRET || process.env.NBA_WARMUP_SECRET;
  
  if (!expectedSecret) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Warmup endpoint not configured',
        message: 'Set NBA_WARMUP_SECRET environment variable to enable'
      })
    };
  }
  
  if (providedSecret !== expectedSecret) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Invalid or missing secret',
        message: 'Provide x-warmup-secret header with correct value'
      })
    };
  }
  
  // ==========================================================================
  // WARMUP EXECUTION
  // ==========================================================================
  
  console.log('🔥 Manual cache warmup triggered');
  const startTime = Date.now();
  
  try {
    // Parse optional parameters
    const daysBack = parseInt(event.queryStringParameters?.days) || 15;
    
    console.log(`📥 Fetching last ${daysBack} days of boxscores...`);
    
    const boxscores = [];
    const teamSet = new Set();
    let gamesSpanDays = 0;
    let firstDate = null;
    let lastDate = null;
    
    // Fetch boxscores from ESPN
    for (let i = daysBack; i >= 1; i--) {
      const date = daysAgo(i);
      const dateStr = formatESPNDate(date);
      
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
        const response = await fetch(url, { timeout: 5000 });
        
        if (!response.ok) continue;
        
        const data = await response.json();
        
        if (!data.events || data.events.length === 0) continue;
        
        const completedGames = data.events.filter(e => e.status.type.completed === true);
        
        if (completedGames.length === 0) continue;
        
        console.log(`   ${dateStr}: ${completedGames.length} games`);
        
        // Track date range
        if (!firstDate) firstDate = dateStr;
        lastDate = dateStr;
        
        // Parse each game
        for (const game of completedGames) {
          try {
            const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${game.id}`;
            const summaryResp = await fetch(summaryUrl, { timeout: 5000 });
            
            if (!summaryResp.ok) continue;
            
            const summary = await summaryResp.json();
            
            if (summary.boxscore?.players) {
              const comp = game.competitions[0];
              const homeTeam = comp.competitors.find(c => c.homeAway === 'home');
              const awayTeam = comp.competitors.find(c => c.homeAway === 'away');
              
              for (const teamData of summary.boxscore.players) {
                const teamId = teamData.team.id;
                const teamAbbr = teamData.team.abbreviation;
                const isHome = teamId === homeTeam.id;
                const oppAbbr = isHome ? awayTeam.team.abbreviation : homeTeam.team.abbreviation;
                
                teamSet.add(teamAbbr);
                
                if (teamData.statistics && teamData.statistics[0]) {
                  for (const athlete of teamData.statistics[0].athletes) {
                    const stats = athlete.stats;
                    const minutes = parseFloat(stats[0]) || 0;
                    
                    if (minutes > 0) {
                      boxscores.push({
                        gameDate: game.date.split('T')[0],
                        playerName: athlete.athlete.displayName,
                        teamTricode: teamAbbr,
                        opponentTricode: oppAbbr,
                        homeAway: isHome ? 'home' : 'away',
                        minutes,
                        points: parseInt(stats[1]) || 0,
                        rebounds: parseInt(stats[4]) || 0,
                        assists: parseInt(stats[5]) || 0,
                        team: teamAbbr
                      });
                    }
                  }
                }
              }
            }
            
            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 300));
            
          } catch (err) {
            // Skip this game
          }
        }
        
      } catch (err) {
        console.log(`   ${dateStr}: Error`);
      }
      
      // Rate limit between days
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Calculate span
    if (firstDate && lastDate) {
      const first = new Date(firstDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
      const last = new Date(lastDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
      gamesSpanDays = Math.ceil((last - first) / (1000 * 60 * 60 * 24)) + 1;
    }
    
    console.log(`✅ Collected ${boxscores.length} player-game records from ${teamSet.size} teams`);
    
    // Save to Blobs with metadata
    const store = getStore('nba-data');
    const key = `player-boxscores-current.v${BLOB_SCHEMA_VERSION}`;
    
    const payload = {
      schema: BLOB_SCHEMA_VERSION,
      lastUpdated: new Date().toISOString(),
      source: 'manual-warmup',
      teamSet: Array.from(teamSet).sort(),
      gamesSpanDays,
      recordCount: boxscores.length,
      boxscores
    };
    
    await store.set(key, JSON.stringify(payload));
    
    const elapsed = Date.now() - startTime;
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Cache warmed successfully',
        recordCount: boxscores.length,
        teamCount: teamSet.size,
        gamesSpanDays,
        daysRequested: daysBack,
        elapsedMs: elapsed,
        timestamp: new Date().toISOString()
      }, null, 2)
    };
    
  } catch (err) {
    console.error('❌ Warmup failed:', err);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Warmup failed',
        message: err.message
      })
    };
  }
}
