// scripts/fetch-player-prop-odds.js
// Fetches player prop odds for NFL from TheODDSAPI for key markets

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_URL = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/players/';
const MARKETS = [
  'player_anytime_td',
  'player_first_td',
  'player_tds_over'
];
const REGIONS = 'us';
const ODDS_FORMAT = 'american';

async function fetchPlayerPropOdds() {
  if (!ODDS_API_KEY) throw new Error('Missing ODDS_API_KEY');
  const allOdds = {};
  for (const market of MARKETS) {
    const url = `${ODDS_API_URL}odds?markets=${market}&regions=${REGIONS}&oddsFormat=${ODDS_FORMAT}&apiKey=${ODDS_API_KEY}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'bgroundrobin-nfl-td/1.0', 'Accept': 'application/json' }
    });
    if (!res.ok) {
      console.warn(`Failed to fetch odds for ${market}: ${res.status}`);
      continue;
    }
    const data = await res.json();
    for (const event of data) {
      for (const bookmaker of event.bookmakers || []) {
        for (const marketObj of bookmaker.markets || []) {
          if (marketObj.key !== market) continue;
          for (const outcome of marketObj.outcomes || []) {
            // Key by player name and market
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
  }
  return allOdds;
}

module.exports = { fetchPlayerPropOdds };
