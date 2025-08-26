// netlify/functions/odds-list-markets.mjs
// Lists available MLB odds markets from TheOddsAPI (v4).
// Returns the full list and highlights HRR and Hits markets support.
const SPORT = 'baseball_mlb';

function jsonResponse(obj, status=200) {
  return { statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) };
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'odds-list-markets/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return await r.json();
}

export const handler = async (event) => {
  try {
    const key = process.env.THEODDSAPI_KEY;
    if (!key) return jsonResponse({ ok:false, error:'missing THEODDSAPI_KEY' });
    const regions = process.env.ODDS_REGIONS || 'us,us2';

    const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds-markets?apiKey=${encodeURIComponent(key)}&regions=${encodeURIComponent(regions)}`;
    const data = await fetchJson(url); // array of market keys

    const want = [
      'batter_hits',
      'batter_hits_alternate',
      'batter_hits_runs_rbis',
      'batter_hits_runs_rbis_alternate',
      'batter_home_runs',
    ];

    const present = want.filter(k => data.includes(k));
    return jsonResponse({ ok:true, sport: SPORT, regions, count: data.length, markets: data, present });
  } catch (e) {
    return jsonResponse({ ok:false, step:'odds-markets', error: String(e) });
  }
};
