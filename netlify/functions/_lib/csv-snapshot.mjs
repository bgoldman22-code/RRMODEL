/**
 * CSV Snapshot System for Pick Locking at Kickoff
 * 
 * Purpose: Write a timestamped CSV snapshot of all predictions with market odds
 * at the time of each prediction refresh. This enables honest CLV tracking by
 * locking in the exact picks and closing lines that were available.
 * 
 * After each week, download the CSV and grade offline.
 * 
 * NOTE: Uses Netlify Blobs for storage since function filesystem is read-only
 */

import { getStore } from '@netlify/blobs';

/**
 * Write predictions snapshot to CSV
 * 
 * @param {Object} payload - The full predictions response object
 * @param {number} week - The NFL week number
 * @param {number} season - The NFL season year
 */
export async function writePicksSnapshot(payload, week, season) {
  try {
    const timestamp = new Date().toISOString();
    const blobKey = `picks_snapshots_${season}_week${week}`;
    
    // Get blob store
    const store = getStore({
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN,
      name: 'nfl-td'
    });
    
    // Get existing CSV content (or empty string if first write)
    let existingContent = '';
    let needsHeader = false;
    try {
      const blob = await store.get(blobKey);
      if (blob) {
        existingContent = await blob.text();
      } else {
        needsHeader = true;
      }
    } catch {
      needsHeader = true;
    }
    
    // Build CSV rows
    const rows = [];
    
    if (needsHeader) {
      rows.push([
        'timestamp',
        'game_id',
        'home_team',
        'away_team',
        'kickoff',
        'model_version',
        
        // Spread data
        'spread_pick',
        'spread_pick_side',
        'spread_model_line',
        'spread_model_home_margin',
        'spread_confidence',
        'spread_edge',
        'spread_market_line',
        'spread_market_price',
        'spread_market_book',
        'spread_deep_link',
        
        // Total data
        'total_pick',
        'total_model_line',
        'total_confidence',
        'total_edge',
        'total_market_line',
        'total_market_price',
        'total_market_book',
        'total_deep_link',
        
        // Moneyline data
        'ml_pick',
        'ml_confidence',
        'ml_edge',
        'ml_market_home_price',
        'ml_market_away_price',
        'ml_market_book',
        'ml_deep_link',
        
        // Model probabilities
        'home_win_prob',
        'away_win_prob',
        
        // Display/recommended pick
        'display_market',
        'display_pick',
        'display_line',
        'display_price',
        'overall_confidence',
        'bet_recommendation'
      ].join(','));
    }
    
    // Add data rows
    for (const game of payload.rows || []) {
      const row = [
        timestamp,
        game.id || '',
        game.homeTeam || '',
        game.awayTeam || '',
        game.kickoff || '',
        game._advanced?.modelVersion || '',
        
        // Spread data
        game.predictions?.spread?.pick || '',
        game.model_choice?.market === 'spread' ? (game.model_choice?.side === 'home' ? game.homeTeam : game.awayTeam) : '',
        game.predictions?.spread?.line || '',
        game.predictions?.spread?.model_home_margin || '',
        game.predictions?.spread?.confidence || '',
        game.predictions?.spread?.edge || '',
        game.odds?.spread?.home_line || game.odds?.spread?.away_line || '',
        game.odds?.spread?.home_price || game.odds?.spread?.away_price || '',
        game.predictions?.spread?.best_book || game.odds?.spread?.book || '',
        game.spread_deep_link || '',
        
        // Total data
        game.predictions?.total?.pick || '',
        game.predictions?.total?.line || '',
        game.predictions?.total?.confidence || '',
        game.predictions?.total?.edge || '',
        game.odds?.total?.line || game.odds?.total?.over_line || '',
        game.odds?.total?.over_price || game.odds?.total?.under_price || '',
        game.predictions?.total?.best_book || game.odds?.total?.book || '',
        game.total_deep_link || '',
        
        // Moneyline data
        game.predictions?.moneyline?.pick || '',
        game.predictions?.moneyline?.confidence || '',
        game.predictions?.moneyline?.edge || '',
        game.odds?.moneyline?.home || game.odds?.h2h?.home || '',
        game.odds?.moneyline?.away || game.odds?.h2h?.away || '',
        game.predictions?.moneyline?.best_book || game.odds?.moneyline?.book || '',
        game.ml_deep_link || '',
        
        // Model probabilities
        game._advanced?.homeWinProb || '',
        game._advanced?.awayWinProb || '',
        
        // Display/recommended pick
        game.displayMarket || '',
        game.displayPick || '',
        game.displayLine || '',
        game.displayPrice || '',
        game.confidence || '',
        game._advanced?.betRecommendations?.[game.displayMarket] || ''
      ];
      
      // Escape and quote fields that might contain commas
      const escapedRow = row.map(field => {
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      
      rows.push(escapedRow.join(','));
    }
    
    // Append to blob (no metadata - keep it simple)
    const newContent = existingContent + rows.join('\n') + '\n';
    await store.set(blobKey, newContent);
    
    return {
      success: true,
      blobKey: blobKey,
      games_count: payload.rows?.length || 0,
      timestamp,
      total_rows: newContent.split('\n').length - 1 // Subtract 1 for trailing newline
    };
    
  } catch (error) {
    console.error('❌ CSV snapshot error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get snapshot CSV content from blob storage
 */
export async function getSnapshotCSV(season, week) {
  try {
    const store = getStore({
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN,
      name: 'nfl-td'
    });
    
    const blobKey = `picks_snapshots_${season}_week${week}`;
    console.log(`[CSV] Attempting to get blob: ${blobKey}`);
    
    // Use getWithMetadata instead of get for better debugging
    const result = await store.getWithMetadata(blobKey);
    console.log(`[CSV] getWithMetadata result:`, result ? 'found' : 'not found');
    
    if (!result || !result.data) {
      console.log(`[CSV] Blob not found for key: ${blobKey}`);
      return null;
    }
    
    // Get as text
    const content = await result.data.text();
    console.log(`[CSV] Retrieved ${content.length} chars`);
    return content;
  } catch (error) {
    console.error('[CSV] Error fetching snapshot:', error, error.stack);
    return null;
  }
}

/**
 * List all snapshot keys for a season
 */
export async function listSnapshots(season) {
  try {
    const store = getStore({
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN,
      name: 'nfl-td'
    });
    
    const { blobs } = await store.list({ prefix: `picks_snapshots_${season}_` });
    return blobs.map(b => b.key);
  } catch (error) {
    console.error('Error listing snapshots:', error);
    return [];
  }
}
