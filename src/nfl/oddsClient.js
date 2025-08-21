// src/nfl/oddsClient.js
// Client helper to fetch odds from our Netlify function and normalize into { offers, usingOddsApi }.

export async function fetchNflOdds(week) {
  try {
    const res = await fetch("/.netlify/functions/nfl-odds");
    const j = await res.json();
    // tolerate both shapes {offers: [...]} and legacy {props: [...]}
    const offers = Array.isArray(j.offers) ? j.offers
      : Array.isArray(j.props) ? j.props
      : [];
    return { usingOddsApi: !!j.usingOddsApi, offers, market: j.market, bookmaker: j.bookmaker, note: j.note };
  } catch (e) {
    return { usingOddsApi: false, offers: [], error: String(e) };
  }
}
