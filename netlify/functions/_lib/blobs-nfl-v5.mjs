/**
 * NFL V5 Blob Storage Helper
 * 
 * Provides simple utilities for storing and retrieving V5 prediction bundles
 * in Netlify Blobs. Uses a dedicated store named "nfl-v5" to isolate from V1.
 * 
 * KEY NAMING CONVENTION:
 * ======================
 * nfl-v5-<season>-week-<week>
 * 
 * Example: nfl-v5-2025-week-11
 * 
 * STORAGE:
 * ========
 * - Store name: "nfl-v5"
 * - Content type: JSON (stored as stringified JSON, parsed on retrieval)
 * - No TTL (bundles persist indefinitely for historical reference)
 */

import { getStore } from '@netlify/blobs';

/**
 * Get the V5 blob store
 */
function getV5Store() {
  return getStore('nfl-v5');
}

/**
 * Generate blob key for a given season and week
 * 
 * @param {number} season - NFL season year (e.g., 2025)
 * @param {number} week - NFL week number (1-18)
 * @returns {string} Blob key (e.g., "nfl-v5-2025-week-11")
 */
export function getBundleKey(season, week) {
  return `nfl-v5-${season}-week-${week}`;
}

/**
 * Retrieve a prediction bundle from Blobs
 * 
 * @param {number} season - NFL season year
 * @param {number} week - NFL week number
 * @returns {Promise<Object|null>} Parsed JSON bundle or null if not found
 */
export async function getBundle(season, week) {
  try {
    const store = getV5Store();
    const key = getBundleKey(season, week);
    
    const bundleJson = await store.get(key, { type: 'text' });
    
    if (!bundleJson) {
      return null;
    }
    
    return JSON.parse(bundleJson);
  } catch (error) {
    console.error(`Error retrieving bundle for ${season} week ${week}:`, error);
    return null;
  }
}

/**
 * Store a prediction bundle in Blobs
 * 
 * @param {number} season - NFL season year
 * @param {number} week - NFL week number
 * @param {Object} bundle - Complete prediction bundle (will be JSON stringified)
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function setBundle(season, week, bundle) {
  try {
    const store = getV5Store();
    const key = getBundleKey(season, week);
    
    // Store as JSON string
    await store.set(key, JSON.stringify(bundle));
    
    console.log(`✅ Stored bundle: ${key}`);
    return true;
  } catch (error) {
    console.error(`Error storing bundle for ${season} week ${week}:`, error);
    return false;
  }
}

/**
 * Get the key for the latest bundle in a season
 * 
 * This attempts to find the most recent week bundle by checking in reverse order.
 * Note: This is a simple implementation that checks weeks 18 down to 1.
 * 
 * @param {number} season - NFL season year
 * @returns {Promise<string|null>} Key of latest bundle or null if none found
 */
export async function getLatestBundleKey(season) {
  try {
    const store = getV5Store();
    
    // Check weeks in reverse order (18 down to 1)
    for (let week = 18; week >= 1; week--) {
      const key = getBundleKey(season, week);
      const exists = await store.get(key, { type: 'text' });
      
      if (exists) {
        console.log(`Latest bundle found: ${key}`);
        return key;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error finding latest bundle for ${season}:`, error);
    return null;
  }
}
