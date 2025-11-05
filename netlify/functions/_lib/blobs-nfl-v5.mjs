import { getStore } from '@netlify/blobs'

// V5 Blob Storage Helper - Isolated namespace for V5 predictions
// Uses 'nfl-v5' bucket (separate from V4.1's 'nfl-v41')

export function getV5Store() {
  return getStore({
    name: 'nfl-v5',
    consistency: 'strong'
  })
}

// Blob keys
export const LATEST_KEY = 'predictions/latest.json'
export const SUMMARY_KEY = 'predictions/summary.json'

export function keyForDate(date) {
  // date should be YYYY-MM-DD
  return `predictions/${date}/bundle.json`
}

// Optional: shared schedule access (read-only, safe)
export async function getSchedule() {
  const store = getStore({ name: 'nfl' }) // Legacy schedule bucket
  const schedule = await store.get('schedule/current.json', { type: 'json' })
  return schedule
}
