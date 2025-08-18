// src/lib/oddsClient.js
export async function fetchLiveHROdds() {
  try {
    const res = await fetch('/.netlify/functions/odds-get', { cache: 'no-store' });
    if (!res.ok) return null;
    const snap = await res.json();
    return snap?.players || null;
  } catch (_e) {
    return null;
  }
}
