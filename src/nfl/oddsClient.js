// src/nfl/oddsClient.js
export async function fetchNflOdds({ week } = {}) {
  const q = new URLSearchParams();
  if (week) q.set('week', String(week));
  const url = `/.netlify/functions/nfl-odds${q.toString() ? '?' + q.toString() : ''}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    return data;
  } catch (e) {
    return { provider: 'theoddsapi', usingOddsApi: false, offers: [], error: String(e) };
  }
}
