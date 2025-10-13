/**
 * CSV Snapshot System for Pick Locking at Kickoff
 * 
 * Purpose: Write a timestamped CSV snapshot of all predictions with market odds
 * at the time of each prediction refresh. This    // Write as string (Netlify Blobs stores strings directly)
    const newContent = existingContent + rows.join('\n') + '\n';
    
    await store.set(key, newContent, {
      metadata: { 
        season: String(season), 
        week: String(week), 
        kind: 'nfl-picks-csv',
        ygeneratedAt: timestamp,
        contentType: 'text/csv'
      }
    });
    
    // Gentle retry to avoid eventual-consistency read issues
    for (let i = 0; i < 5; i++) {
      const ok = await store.get(key);
      if (ok) break;
      await new Promise(r => setTimeout(r, 150));
    }
    
    return {
      success: true,
      key: key,
      games_count: payload.rows?.length || 0,
      timestamp,
      total_rows: newContent.split('\n').length - 1
    };nest CLV tracking by
 * locking in the exact picks and closing lines that were available.
 * 
 * After each week, download the CSV and grade offline.
 * 
 * NOTE: Uses Netlify Blobs for storage since function filesystem is read-only
 * 
 * CRITICAL: Single source of truth for store name and key format
 */

import { getStore } from '@netlify/blobs';

// SINGLE SOURCE OF TRUTH for store and key format
const STORE_NAME = 'nfl-td'; // Using existing store for simplicity
const pad2 = n => String(n).padStart(2, '0');

export const snapshotKey = ({ season, week }) => {
  if (!season) throw new Error('snapshotKey: season required');
  if (week == null) throw new Error('snapshotKey: week required');
  // Keep this EXACT in writer and reader - zero-padded week
  return `nfl/${season}/week${pad2(week)}.csv`;
};

export const getSnapshotStore = () => {
  return getStore({
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN,
    name: STORE_NAME
  });
};

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
    const key = snapshotKey({ season, week });
    
    // Get blob store
    const store = getSnapshotStore();
    
    // Get existing CSV content (or empty string if first write)
    // Netlify Blobs returns string directly
    let existingContent = '';
    let needsHeader = false;
    try {
      const content = await store.get(key);
      if (content) {
        existingContent = content;
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
    
    // Write as string (Netlify Blobs stores strings directly)
    const newContent = existingContent + rows.join('\n') + '\n';
    
    await store.set(key, newContent, {
      metadata: { 
        season: String(season), 
        week: String(week), 
        kind: 'nfl-picks-csv',
        generatedAt: timestamp,
        contentType: 'text/csv'
      }
    });
    
    // Gentle retry to avoid eventual-consistency read issues
    for (let i = 0; i < 5; i++) {
      const ok = await store.get(key);
      if (ok) break;
      await new Promise(r => setTimeout(r, 150));
    }
    
    return {
      success: true,
      key: key,
      games_count: payload.rows?.length || 0,
      timestamp,
      total_rows: newContent.split('\n').length - 1
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
 * Get snapshot CSV content from blob storage with fallback diagnostics
 */
export async function getSnapshotCSV(season, week, allowListFallback = true) {
  try {
    const store = getSnapshotStore();
    const key = snapshotKey({ season, week: Number(week) });
    
    console.log(`[CSV] Attempting to get blob: ${key}`);
    
    // Netlify Blobs returns string directly
    let content = await store.get(key);
    if (content) {
      console.log(`[CSV] Retrieved ${content.length} chars from ${key}`);
      return { key, content };
    }
    
    // Try legacy key format for backwards compatibility
    const legacyKey = `picks_snapshots_${season}_week${week}`;
    console.log(`[CSV] New key not found, trying legacy: ${legacyKey}`);
    content = await store.get(legacyKey);
    if (content) {
      console.log(`[CSV] Retrieved ${content.length} chars from legacy key ${legacyKey}`);
      return { key: legacyKey, content };
    }
    
    if (!allowListFallback) {
      console.log(`[CSV] Blob not found for keys: ${key}, ${legacyKey}`);
      return { key, content: null };
    }
    
    // List fallback for diagnostics
    const prefix = `nfl/${season}/`;
    const { blobs: items = [] } = await store.list({ prefix });
    const found = items.find(it => it.key === key);
    
    console.log(`[CSV] List fallback - found ${items.length} items with prefix ${prefix}`);
    console.log(`[CSV] Keys:`, items.map(it => it.key));
    
    if (found) {
      const content = await store.get(found.key);
      if (content) {
        return { key: found.key, content, listed: items.map(it => it.key) };
      }
    }
    
    return { key, content: null, listed: items.map(it => it.key) };
  } catch (error) {
    console.error('[CSV] Error fetching snapshot:', error, error.stack);
    return { key: null, content: null, error: error.message };
  }
}

/**
 * List all snapshot keys for a season
 */
export async function listSnapshots(season) {
  try {
    const store = getSnapshotStore();
    const prefix = `nfl/${season}/`;
    const { blobs } = await store.list({ prefix });
    return blobs.map(b => b.key);
  } catch (error) {
    console.error('Error listing snapshots:', error);
    return [];
  }
}
