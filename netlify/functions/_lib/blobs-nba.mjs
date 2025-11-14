/**
 * Netlify Blobs Helper for NBA DD/TD Picks
 * Provides caching layer for pre-generated picks from NBA-DDTD-RESEARCH repo
 */

import { getStore } from '@netlify/blobs';

/**
 * Get the NBA DD/TD blob store
 */
export function getNBAStore() {
  return getStore('nba-ddtd');
}

/**
 * Get JSON data from blob store
 * @param {string} key - Blob key
 * @returns {Promise<Object|null>} - Parsed JSON or null if not found
 */
export async function getJson(key) {
  try {
    const store = getNBAStore();
    const data = await store.get(key, { type: 'json' });
    return data;
  } catch (error) {
    console.error(`Error getting blob ${key}:`, error);
    return null;
  }
}

/**
 * Set JSON data in blob store with TTL
 * @param {string} key - Blob key
 * @param {Object} value - JSON data to store
 * @param {number} ttl - Time to live in seconds (default 24 hours)
 * @returns {Promise<boolean>} - Success status
 */
export async function setJson(key, value, ttl = 86400) {
  try {
    const store = getNBAStore();
    await store.setJSON(key, value, {
      metadata: {
        cached_at: new Date().toISOString(),
        ttl: ttl
      }
    });
    return true;
  } catch (error) {
    console.error(`Error setting blob ${key}:`, error);
    return false;
  }
}

/**
 * Delete a blob
 * @param {string} key - Blob key to delete
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteBlob(key) {
  try {
    const store = getNBAStore();
    await store.delete(key);
    return true;
  } catch (error) {
    console.error(`Error deleting blob ${key}:`, error);
    return false;
  }
}

/**
 * List all blobs in store
 * @returns {Promise<Array>} - List of blob entries
 */
export async function listBlobs() {
  try {
    const store = getNBAStore();
    const { blobs } = await store.list();
    return blobs;
  } catch (error) {
    console.error('Error listing blobs:', error);
    return [];
  }
}
