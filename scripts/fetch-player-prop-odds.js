// scripts/fetch-player-prop-odds.js
// Fetches player prop odds for NFL from TheODDSAPI for key markets

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const BASE_ROOT = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl';
const MARKETS = [
  'player_anytime_td',
  'player_1st_td',
  'player_tds_over'
];
const REGIONS = 'us';
const ODDS_FORMAT = 'american';

async function fetchPlayerPropOdds() {
  if (!ODDS_API_KEY) throw new Error('Missing ODDS_API_KEY');
  const allOdds = {};
  // Fetch events first
  const eventsUrl = `${BASE_ROOT}/events?apiKey=${ODDS_API_KEY}&dateFormat=iso`;
  const eventsRes = await fetch(eventsUrl, { headers: { 'User-Agent': 'bgroundrobin-nfl-td/1.0', 'Accept': 'application/json' } });
  if (!eventsRes.ok) throw new Error(`Events fetch failed: ${eventsRes.status}`);
  const events = await eventsRes.json();

  for (const ev of events || []) {
    const url = `${BASE_ROOT}/events/${encodeURIComponent(ev.id)}/odds?markets=${MARKETS.join(',')}&regions=${REGIONS}&oddsFormat=${ODDS_FORMAT}&bookmakers=fanduel,draftkings,caesars,betmgm,betfanatics,espnbet&apiKey=${ODDS_API_KEY}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'bgroundrobin-nfl-td/1.0', 'Accept': 'application/json' } });
    if (!res.ok) {
      console.warn(`Failed to fetch odds for event ${ev.id}: ${res.status}`);
      continue;
    }
    const evData = await res.json();
    for (const bookmaker of evData.bookmakers || []) {
      for (const marketObj of bookmaker.markets || []) {
        const market = marketObj.key;
        for (const outcome of marketObj.outcomes || []) {
          const player = outcome.description || outcome.name;
          if (!player) continue;
          if (!allOdds[player]) allOdds[player] = {};
          if (!allOdds[player][market]) allOdds[player][market] = [];
          allOdds[player][market].push({
            price: outcome.price,
            bookmaker: bookmaker.key,
            label: outcome.name || outcome.description
          });
        }
      }
    }
  }
  return allOdds;
}

module.exports = { fetchPlayerPropOdds };
