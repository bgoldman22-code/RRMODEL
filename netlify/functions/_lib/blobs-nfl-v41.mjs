// netlify/functions/_lib/blobs-nfl-v41.mjs
// Blob storage helper for NFL V4.1 predictions
// ISOLATED from legacy NFL functions - can coexist or replace independently

import { getStore as getBlobStore } from '@netlify/blobs';

const V41_BUCKET = 'nfl-v41';
const PREFIX = 'predictions';

export function getStore() {
  return getBlobStore({ name: V41_BUCKET, siteID: process.env.SITE_ID });
}

export const LATEST_KEY = `${PREFIX}/latest.json`;
export const SUMMARY_KEY = `${PREFIX}/summary.json`;

export function keyForDate(dateStr) {
  return `${PREFIX}/${dateStr}/bundle.json`;
}

// Helper to read schedule (shared with legacy NFL but independent function)
export async function getSchedule(season, week) {
  try {
    // Schedule can be shared across systems - read from blobs or fetch fresh
    const scheduleStore = getBlobStore({ name: 'nfl-schedules' });
    const key = `${season}/week_${week}.json`;
    const schedule = await scheduleStore.get(key, { type: 'json' });
    
    if (schedule) {
      console.log(`📅 Loaded schedule for ${season} Week ${week} from blobs`);
      return schedule;
    }
    
    // Fallback: fetch from ESPN or other source
    console.warn(`No cached schedule for ${season} Week ${week}, fetching...`);
    // TODO: Add ESPN API or other schedule source
    return null;
  } catch (error) {
    console.error('Error loading schedule:', error);
    return null;
  }
}
