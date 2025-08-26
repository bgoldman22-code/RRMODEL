// src/nfl/oddsClient.js
// Fetch NFL odds from Netlify function. Always returns { offers: [] } shape and a modelOnly flag if empty.
export async function fetchNflOdds(week) {
  try {
    const res = await fetch(`/.netlify/functions/nfl-odds`);
    const json = await res.json();
    const offers = Array.isArray(json.offers) ? json.offers : Array.isArray(json.props) ? json.props : [];
    return {
      ok: !!json.ok,
      usingOddsApi: !!json.usingOddsApi,
      offers,
      modelOnly: offers.length === 0, // UI/engine can use this to display model-only results
      meta: json.meta || {},
      error: json.error || json.message || null
    };
  } catch (e) {
    return { ok: false, usingOddsApi: false, offers: [], modelOnly: true, meta: { error: String(e) } };
  }
}
