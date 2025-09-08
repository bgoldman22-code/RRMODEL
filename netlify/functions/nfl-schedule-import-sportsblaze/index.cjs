'use strict';
// Enhanced importer with debug + broader field mappings + force daily option
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
const ABBR_BY_TEAM_NAME = Object.fromEntries(Object.entries(TEAM_NAME_BY_ABBR).map(([abbr, name]) => [name, abbr]));

// DST heuristic: Sep/Oct = -04:00; otherwise -05:00 for regular season
function toIsoET(dateStr, timeStr) {
  if (!dateStr) return null;
  let d = String(dateStr).trim();
  let t = (timeStr ? String(timeStr).trim() : '00:00');
  // Normalize date (allow 'YYYY/MM/DD', etc.)
  d = d.replace(/\//g, '-');
  const month = parseInt(d.slice(5,7),10);
  const offset = (month===9 || month===10) ? '-04:00' : '-05:00';
  // Accept 24h 'HH:MM' or 12h 'HH:MM AM/PM'
  const ampm = (t.match(/(AM|PM)$/i)||[])[1];
  let [h,m] = t.replace(/ ?(AM|PM)/i,'').split(':').map(n=>parseInt(n||'0',10));
  if (ampm) {
    const up = ampm.toUpperCase();
    if (up==='PM' && h!==12) h += 12;
    if (up==='AM' && h===12) h = 0;
  }
  return `${d}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00${offset}`;
}
function toUTC(isoET) {
  if (!isoET) return null;
  const add = isoET.endsWith('-04:00') ? 4 : 5;
  return new Date(new Date(isoET).getTime() + add*3600*1000).toISOString().replace('.000','Z');
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return null;
}

function normalizeTeam(obj, fallback) {
  if (!obj) return { name: fallback || null, abbr: ABBR_BY_TEAM_NAME[fallback] || null };
  const name = pick(obj, ['name','teamName','fullName','displayName','longName']) || (typeof obj === 'string' ? obj : null) || fallback;
  const abbr = pick(obj, ['abbr','abbreviation','code','shortName']) || ABBR_BY_TEAM_NAME[name] || (typeof obj === 'string' ? ABBR_BY_TEAM_NAME[obj] : null);
  return { name, abbr };
}

function normalizeGame(season, g) {
  const home = normalizeTeam(pick(g, ['home','homeTeam','home_team']), pick(g, ['home_name']));
  const away = normalizeTeam(pick(g, ['away','awayTeam','away_team']), pick(g, ['away_name']));
  const week = pick(g, ['week','weekNumber','week_num','week_no','weekOfSeason']);
  const dateET = pick(g, ['date_et','date','startDateEt','gameDateEt','dateET','start_date']);
  const timeET = pick(g, ['time_et','time','startTimeEt','gameTimeEt','timeET','start_time']);
  const kickoff_et = toIsoET(dateET, timeET);
  const start_utc = toUTC(kickoff_et);
  const start_unix = start_utc ? Math.floor(new Date(start_utc).getTime()/1000) : null;
  const venueRaw = pick(g, ['venue','stadium']) || {};
  const venue = {
    name: pick(venueRaw, ['name','stadium','venueName']) || null,
    city: pick(venueRaw, ['city']) || null,
    state_province: pick(venueRaw, ['state','state_province','region']) || null,
    country: pick(venueRaw, ['country']) || 'USA',
    neutral_site: !!(pick(g, ['neutral_site','neutralSite','isNeutralSite']) || pick(venueRaw, ['neutral']))
  };
  const homeAbbr = home.abbr || ABBR_BY_TEAM_NAME[home.name] || home.name;
  const awayAbbr = away.abbr || ABBR_BY_TEAM_NAME[away.name] || away.name;

  return {
    game_id: `${season}-W${Number(week)}-${awayAbbr}-${homeAbbr}`,
    week: Number(week),
    kickoff_et, start_utc, start_unix, commence_time: start_utc,
    away: awayAbbr, home: homeAbbr,
    away_key: away.name || null, home_key: home.name || null,
    away_sd_id: null, home_sd_id: null,
    venue
  };
}

async function fetchSeason(season, key, forceDaily=false, debug=false) {
  const debugInfo = { tried: [], sample: null };
  if (!forceDaily) {
    const url = `${SB_BASE}/schedule/season/${season}.json?key=${encodeURIComponent(key)}`;
    debugInfo.tried.push(url);
    try {
      const json = await getJSON(url);
      const arr = json.games || json.data || (Array.isArray(json) ? json : null);
      if (Array.isArray(arr) && arr.length) {
        debugInfo.sample = arr[0];
        return { games: arr.map(g => normalizeGame(season, g)), debugInfo };
      }
    } catch (e) {
      debugInfo.error_season = String(e);
    }
  }
  // fallback daily: Aug 1 -> Feb 15
  const games = [];
  const start = new Date(`${season}-08-01T00:00:00Z`);
  const end   = new Date(`${season+1}-02-15T00:00:00Z`);
  let days=0, hits=0;
  for (let d=new Date(start); d<=end; d.setUTCDate(d.getUTCDate()+1)) {
    const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), da=String(d.getUTCDate()).padStart(2,'0');
    const dailyUrl = `${SB_BASE}/schedule/daily/${y}-${m}-${da}.json?key=${encodeURIComponent(key)}`;
    debugInfo.tried.push(dailyUrl);
    days++;
    try {
      const j = await getJSON(dailyUrl);
      const list = j.games || j.data || (Array.isArray(j) ? j : []);
      if (Array.isArray(list) && list.length) {
        hits++;
        if (!debugInfo.sample) debugInfo.sample = list[0];
        for (const g of list) games.push(g);
      }
    } catch(_) {}
  }
  const normalized = games.map(g => normalizeGame(season, g));
  return { games: normalized, debugInfo: Object.assign(debugInfo, { days, hits }) };
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = parseInt(qs.season || '2025', 10);
    const key = process.env.SPORTS_BLAZE_KEY;
    if (!key) return { statusCode: 500, body: JSON.stringify({ ok:false, error:'Missing env SPORTS_BLAZE_KEY' }) };

    const forceDaily = String(qs.source||'').toLowerCase()==='daily';
    const debug = String(qs.debug||'false').toLowerCase()==='true';

    const { games, debugInfo } = await fetchSeason(season, key, forceDaily, debug);

    // Partition by week
    const weeks = {}; for (let w=1; w<=18; w++) weeks[String(w)] = [];
    for (const g of games) {
      if (g.week>=1 && g.week<=18 && g.start_unix) weeks[String(g.week)].push(g);
    }
    for (const k of Object.keys(weeks)) weeks[k].sort((a,b)=>a.start_unix-b.start_unix);
    const counts = Object.fromEntries(Object.entries(weeks).map(([k,v])=>[k, v.length]));

    // Save
    const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
    const siteID = process.env.SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
    const store = getStore({ name, siteID, token });
    const blobKey = `schedules/${season}/full.json`;
    await store.set(blobKey, JSON.stringify({ season, season_type:'REG', weeks }), { contentType: 'application/json; charset=utf-8' });

    const body = { ok:true, season, store:name, blobKey, counts };
    if (debug) {
      body.debug = {
        tried: debugInfo.tried?.slice(0,5), // only echo a few
        days: debugInfo.days,
        hits: debugInfo.hits,
        sample: debugInfo.sample ? Object.keys(debugInfo.sample) : null
      };
    }
    return { statusCode: 200, headers: { 'content-type':'application/json' }, body: JSON.stringify(body) };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type':'application/json' }, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
