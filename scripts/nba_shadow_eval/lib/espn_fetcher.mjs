/**
 * Shadow Eval – ESPN Data Fetcher
 * 
 * Fetches schedule + results from ESPN for historical dates.
 * Pure data-fetching module – no production side effects.
 * 
 * SAFETY: Only used by shadow eval scripts. Never imported by Netlify functions.
 */

import fetch from 'node-fetch';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

// ESPN → NBA abbreviation normalization (mirrors production mapping)
const ESPN_TO_NBA_ABBR = {
  'GS': 'GSW', 'SA': 'SAS', 'NO': 'NOP', 'NY': 'NYK',
  'PHO': 'PHX', 'UTAH': 'UTA', 'WSH': 'WAS',
};

function normalizeAbbr(abbr) {
  return ESPN_TO_NBA_ABBR[abbr] || abbr;
}

/**
 * Fetch all games for a given date from ESPN scoreboard.
 * Returns completed games with scores (actuals).
 * 
 * @param {string} dateStr - YYYY-MM-DD format
 * @returns {Promise<Array>} games with home/away teams, scores, status
 */
export async function fetchGamesForDate(dateStr) {
  const espnDate = dateStr.replace(/-/g, ''); // YYYYMMDD
  const url = `${ESPN_BASE}/scoreboard?dates=${espnDate}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[ShadowESPN] ESPN ${res.status} for ${dateStr}`);
    return [];
  }

  const data = await res.json();
  if (!data.events || data.events.length === 0) return [];

  const games = [];

  for (const event of data.events) {
    const comp = event.competitions[0];
    const home = comp.competitors.find(c => c.homeAway === 'home');
    const away = comp.competitors.find(c => c.homeAway === 'away');

    const homeAbbr = normalizeAbbr(home.team.abbreviation);
    const awayAbbr = normalizeAbbr(away.team.abbreviation);
    const homeScore = parseInt(home.score) || 0;
    const awayScore = parseInt(away.score) || 0;
    const completed = comp.status?.type?.completed === true;

    games.push({
      date: dateStr,
      game_id: event.id,
      home: homeAbbr,
      away: awayAbbr,
      home_score: homeScore,
      away_score: awayScore,
      actual_margin: homeScore - awayScore, // positive = home won
      actual_home_win: homeScore > awayScore ? 1 : 0,
      total: homeScore + awayScore,
      completed,
      status: comp.status?.type?.name || 'unknown',
    });
  }

  return games;
}

/**
 * Fetch closing odds for games on a date from The Odds API (historical).
 * Falls back gracefully if no API key or data.
 * 
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<Object>} map of `away_home` → { closingSpread, closingTotal }
 */
export async function fetchClosingLines(dateStr) {
  const apiKey = process.env.SHADOW_ODDS_API_KEY || process.env.ODDS_API_KEY;
  if (!apiKey) return {};

  try {
    // The Odds API historical endpoint
    const isoDate = `${dateStr}T00:00:00Z`;
    const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds-history/?apiKey=${apiKey}&regions=us&markets=spreads,totals&oddsFormat=american&date=${isoDate}`;
    const res = await fetch(url);
    if (!res.ok) return {};

    const data = await res.json();
    const linesMap = {};

    const teamAbbrevMap = {
      'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
      'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
      'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
      'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
      'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM',
      'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN',
      'New Orleans Pelicans': 'NOP', 'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC',
      'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX',
      'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS',
      'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS',
    };

    for (const game of (data.data || data || [])) {
      const homeAbbr = teamAbbrevMap[game.home_team] || game.home_team;
      const awayAbbr = teamAbbrevMap[game.away_team] || game.away_team;
      const key = `${awayAbbr}_${homeAbbr}`;

      let closingSpread = null;
      let closingTotal = null;

      for (const bm of (game.bookmakers || [])) {
        for (const mkt of (bm.markets || [])) {
          if (mkt.key === 'spreads' && closingSpread === null) {
            const homeOutcome = mkt.outcomes.find(o => teamAbbrevMap[o.name] === homeAbbr || o.name === homeAbbr);
            if (homeOutcome) closingSpread = homeOutcome.point;
          }
          if (mkt.key === 'totals' && closingTotal === null) {
            const overOutcome = mkt.outcomes.find(o => o.name === 'Over');
            if (overOutcome) closingTotal = overOutcome.point;
          }
        }
        if (closingSpread !== null && closingTotal !== null) break;
      }

      linesMap[key] = { closingSpread, closingTotal };
    }

    return linesMap;
  } catch (err) {
    console.warn(`[ShadowESPN] Closing lines fetch failed for ${dateStr}: ${err.message}`);
    return {};
  }
}

/**
 * Rate-limited delay.
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
