// netlify/functions/_lib/blobs.js
import { getStore } from '@netlify/blobs'

export function nflStore() {
  // Prefer NFL-specific store, then generic, then fallback default
  const name =
    process.env.BLOBS_STORE_NFL ||
    process.env.BLOBS_STORE ||
    'nfl-td'
  return getStore({ name })
}
