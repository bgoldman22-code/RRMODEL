'use strict';
// SportsBlaze importer aligned to documented response shape:
// {
//   league: {...},
//   games: [{
//     season: { year, type, week },
//     id,
//     teams: { away: { id, name }, home: { id, name } },
//     date: "2025-09-07T17:00:00Z",
//     status,
//     venue: { name, location }
//   }],
//   updated: "..."
// }
const { getStore } = require('@netlify/blobs');
const fetch = global.fetch;
const SB_BASE = 'https://api.sportsblaze.com/nfl/v1';

const TEAM_NAME_BY_ABBR = {
  "ARI":"Arizona Cardinals","ATL":"Atlanta Falcons","BAL":"Baltimore Ravens","BUF":"Buffalo Bills",
  "CAR":"Carolina Panthers","CHI":"Chicago Bears","CIN":"Cincinnati Bengals","CLE":"Cleveland Browns",
  "DAL":"Dallas Cowboys","DEN":"Denver Broncos","DET":"Detroit Lions","GB":"Green Bay Packers",
  "HOU":"Houston Texans","IND":"Indianapolis Colts","JAX":"Jacksonville Jaguars","KC":"Kansas City Chiefs",
  "LAC":"Los Angeles Chargers","LAR":"Los Angeles Rams","LV":"Las Vegas Raiders","MIA":"Miami Dolphins",
  "MIN":"Minnesota Vikings","NE":"New England Patriots","NO":"New Orleans Saints","NYG":"New York Giants",
  "NYJ":"New York Jets","PHI":"Philadelphia Eagles","PIT":"Pittsburgh Steelers","SEA":"Seattle Seahawks",
  "SF":"San Francisco 49ers","TB":"Tampa Bay Buccaneers","TEN":"Tennessee Titans","WAS":"Washington Commanders"
};
const ABBR_BY_TEAM_NAME = Object.fromEntries(Object.entries(TEAM_NAME_BY_ABBR).map(([abbr,name])=>[name,abbr]));

function toETfromUTC(utcIso) {
  // Convert UTC string to ET with simple DST heuristic (Sep/Oct -04:00 else -05:00)
  if (!utcIso) return null;
  const d = new Date(utcIso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth()+1; // 1-12
  const off = (m===9 || m===10) ? -4 : -5;
  const etMs = d.getTime() + off*3600*1000;
  const et = new Date(etMs);
  const pad = n => String(n).padStart(2,'0');
  const offsetStr = off === -4 ? '-04:00' : '-05:00';
  return `${et.getUTCFullYear()}-${pad(et.getUTCMonth()+1)}-${pad(et.getUTCDate())}T${pad(et.getUTCHours())}:${pad(et.getUTCMinutes())}:00${offsetStr}`;
}

async function fetchSeason(season, key, seasonTypes) {
  const typeParam = seasonTypes ? `&type=${encodeURIComponent(seasonTypes)}` : '';
  const url = `${SB_BASE}/schedule/season/${season}.json?key=${encodeURIComponent(key)}${typeParam}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const json = await r.json();
  const games = Array.isArray(json.games) ? json.games : [];
  return games;
}

function normalize(season, g) {
  const seasonType = g.season?.type || 'Regular Season';
  const week = g.season?.week;
  const homeName = g.teams?.home?.name || '';
  const awayName = g.teams?.away?.name || '';
  const home = ABBR_BY_TEAM_NAME[homeName] || homeName;
  const away = ABBR_BY_TEAM_NAME[awayName] || awayName;

  const start_utc = g.date || null; // already UTC ISO per docs
  const start_unix = start_utc ? Math.floor(new Date(start_utc).getTime()/1000) : null;
  const kickoff_et = toETfromUTC(start_utc);

  const venueName = g.venue?.name || null;
  const venueLoc = g.venue?.location || null;

  return {
    game_id: `${season}-W${Number(week)}-${away}-${home}`,
    week: Number(week),
    kickoff_et,
    start_utc,
    start_unix,
    commence_time: start_utc,
    away, home,
    away_key: awayName || null,
    home_key: homeName || null,
    away_sd_id: null,
    home_sd_id: null,
    venue: {
      name: venueName,
      city: venueLoc,
      state_province: null,
      country: venueLoc && /London|Frankfurt|Munich|Berlin|Mexico|Dublin|Sao Paulo|Toronto|Vancouver/i.test(venueLoc) ? 'INTL' : 'USA',
      neutral_site: venueLoc ? /London|Frankfurt|Munich|Berlin|Mexico|Dublin|Sao Paulo|Toronto|Vancouver/i.test(venueLoc) : false
    },
    season_type: seasonType
  };
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = parseInt(qs.season || '2025', 10);
    const types = qs.types || 'Regular Season'; // allow override e.g. 'Preseason,Regular Season'
    const key = process.env.SPORTS_BLAZE_KEY;
    if (!key) return { statusCode: 500, body: JSON.stringify({ ok:false, error:'Missing env SPORTS_BLAZE_KEY' }) };

    const raw = await fetchSeason(season, key, types);
    // Normalize and partition
    const weeks = {}; for (let w=1; w<=18; w++) weeks[String(w)] = [];
    for (const g of raw) {
      const wk = g.season?.week;
      const type = g.season?.type;
      if (!wk || type !== 'Regular Season') continue; // keep regular season only by default
      const n = normalize(season, g);
      weeks[String(wk)].push(n);
    }
    for (const k of Object.keys(weeks)) weeks[k].sort((a,b)=>(a.start_unix||0)-(b.start_unix||0));
    const counts = Object.fromEntries(Object.entries(weeks).map(([k,v])=>[k, v.length]));

    // Save to NFL-only Blobs store
    const { getStore } = require('@netlify/blobs');
    const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
    const siteID = process.env.SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
    const store = getStore({ name, siteID, token });
    const blobKey = `schedules/${season}/full.json`;
    await store.set(blobKey, JSON.stringify({ season, season_type:'REG', weeks }), { contentType: 'application/json; charset=utf-8' });

    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, season, store:name, blobKey, counts }) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
