// src/nfl/oddsClient.js
export async function fetchNflOdds(week) {
  const qs = new URLSearchParams();
  if (typeof week === "number") qs.set("week", String(week));
  const url = `/.netlify/functions/nfl-odds?${qs.toString()}`;
  const res = await fetch(url);
  const j = await res.json();
  // tolerate both shapes: {offers:[]} or legacy {props:[]}
  const offers = Array.isArray(j.offers) ? j.offers : (Array.isArray(j.props) ? j.props : []);
  return { usingOddsApi: !!j.usingOddsApi, offers, meta: j.meta, bookmaker: j.bookmaker || j.book, error: j.error };
}
