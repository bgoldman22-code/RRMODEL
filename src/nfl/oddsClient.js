// src/nfl/oddsClient.js
export async function fetchNflOdds({ week }) {
  try {
    const q = week ? `?week=${encodeURIComponent(week)}` : '';
    const res = await fetch(`/.netlify/functions/nfl-odds${q}`, { cache: 'no-store' });
    if (!res.ok) return { usingOddsApi: false, offers: [], count: 0, error: `HTTP ${res.status}` };
    const json = await res.json();
    return json;
  } catch (e) {
    return { usingOddsApi: false, offers: [], count: 0, error: String(e) };
  }
}
