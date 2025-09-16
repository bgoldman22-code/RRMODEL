// netlify/functions/_lib/blobs-nfl.js

import { getStore } from '@netlify/blobs';

// Constants that some functions expect
export const HELPER_MODE = 'production';
export const HELPER_VERSION = '1.0.0';

// Get the appropriate blob store
function getBlobStore() {
  const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-data';
  return getStore(storeName);
}

// Legacy function names that your existing code expects
export async function nflBlobsGetJSON(path) {
  try {
    const store = getBlobStore();
    const blob = await store.get(path);
    if (!blob) return null;
    
    const text = await blob.text();
    return JSON.parse(text);
  } catch (error) {
    console.warn(`Failed to read blob at ${path}:`, error);
    return null;
  }
}

export async function nflBlobsPutJSON(path, data) {
  try {
    const store = getBlobStore();
    const json = JSON.stringify(data);
    await store.set(path, json, { contentType: 'application/json' });
    return true;
  } catch (error) {
    console.error(`Failed to write blob at ${path}:`, error);
    throw error;
  }
}

export async function nflBlobsDelete(path) {
  try {
    const store = getBlobStore();
    await store.delete(path);
    return true;
  } catch (error) {
    console.warn(`Failed to delete blob at ${path}:`, error);
    return false;
  }
}

// New function names for the advanced metrics system
export async function readBlobJSON(path) {
  return await nflBlobsGetJSON(path);
}

export async function loadAdvancedMetrics(season) {
  return (await readBlobJSON(`nfl/epa/latest.json`)) || null;
}

export async function loadInjuries() {
  return (await readBlobJSON(`nfl/injuries/latest.json`)) || { teams: {}, asOf: null };
}

// Helper function to validate blob data structure
export function validateAdvancedMetrics(data) {
  if (!data || !data.teams || !data.league) {
    return false;
  }
  
  // Check if we have required league normalization data
  const hasLeagueMeans = data.league.means && Object.keys(data.league.means).length > 0;
  const hasLeagueStds = data.league.stds && Object.keys(data.league.stds).length > 0;
  
  return hasLeagueMeans && hasLeagueStds;
}

// Helper to get team data with fallbacks
export function getTeamMetrics(data, teamCode) {
  if (!data || !data.teams || !data.teams[teamCode]) {
    return null;
  }
  
  return data.teams[teamCode];
}
