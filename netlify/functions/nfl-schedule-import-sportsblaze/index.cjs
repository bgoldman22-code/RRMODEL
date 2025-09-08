'use strict';
// nfl-schedule-import-sportsblaze uses NFL-only store (BLOBS_STORE_NFL)
const { getStore } = require('@netlify/blobs');
const fetch = global.fetch;
const SB_BASE = 'https://api.sportsblaze.com/nfl/v1';

const TEAM_NAME_BY_ABBR = {
  "ARI": "Arizona Cardinals","ATL":"Atlanta Falcons","BAL":"Baltimore Ravens","BUF":"Buffalo Bills",
  "CAR":"Carolina Panthers","CHI":"Chicago Bears","CIN":"Cincinnati Bengals","CLE":"Cleveland Browns",
  "DAL":"Dallas Cowboys","DEN":"Denver Broncos","DET":"Detroit Lions","GB":"Green Bay Packers",
  "HOU":"Houston Texans","IND":"Indianapolis Colts","JAX":"Jacksonville Jaguars","KC":"Kansas City Chiefs",
  "LAC":"Los Angeles Chargers","LAR":"Los Angeles Rams","LV":"Las Vegas Raiders","MIA":"Miami Dolphins",
  "MIN":"Minnesota Vikings","NE":"New England Patriots","NO":"New Orleans Saints","NYG":"New York Giants",
  "NYJ":"New York Jets","PHI":"Philadelphia Eagles","PIT":"Pittsburgh Steelers","SEA":"Seattle Seahawks",
  "SF":"San Francisco 49ers","TB":"Tampa Bay Buccaneers","TEN":"Tennessee Titans","WAS":"Washington Commanders"
};
const ABBR_BY_TEAM_NAME = Object.fromEntries(Object.entries(TEAM_NAME_BY_ABBR).map(([abbr,name])=>[name,abbr]));

function toIsoET(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const month = parseInt(dateStr.slice(5,7),10);
  const offset = (month===9||month===10) ? '-04:00' : '-05:00';
  let t = String(timeStr).trim();
  const ampm = (t.match(/(AM|PM)$/i)||[])[1];
  let [h,m] = t.replace(/ ?(AM|PM)/i,'').split(':').map(n=>parseInt(n,10));
  if (ampm && ampm.toUpperCase()==='PM' && h!==12) h+=12;
  if (ampm && ampm.toUpperCase()==='AM' && h===12) h=0;
  return `${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00${offset}`;
}
function toUTC(isoET) {
  if (!isoET) return null;
  const add = isoET.endsWith('-04:00') ? 4 : 5;
  return new Date(new Date(isoET).getTime() + add*3600*1000).toISOString().replace('.000','Z');
}
async function getJSON(url) { const r = await fetch(url); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }

function normalizeGame(season, g) {
  const homeName = g.home_name || g.homeTeam || g.home?.name || g.home || '';
  const awayName = g.away_name || g.awayTeam || g.away?.name || g.away || '';
  const home = g.home_abbr || g.homeCode || ABBR_BY_TEAM_NAME[homeName] || homeName;
  const away = g.away_abbr || g.awayCode || ABBR_BY_TEAM_NAME[awayName] || awayName;
  const dateET = g.date_et || g.date || g.startDateEt || g.gameDateEt;
  const timeET = g.time_et || g.time || g.startTimeEt || g.gameTimeEt;
  const kickoff_et = toIsoET(dateET, timeET);
  const start_utc = toUTC(kickoff_et);
  const start_unix = start_utc ? Math.floor(new Date(start_utc).getTime()/1000) : null;
  const venueObj = g.venue || {};
  const neutral = !!(g.neutral_site || g.neutralSite || g.isNeutralSite || venueObj.neutral);
  const week = g.week || g.weekNumber || g.week_num || g.week_no || null;
  return {
    game_id: `${season}-W${week}-${away}-${home}`,
    week: Number(week),
    kickoff_et, start_utc, start_unix, commence_time: start_utc,
    away, home,
    away_key: awayName || null, home_key: homeName || null,
    away_sd_id: null, home_sd_id: null,
    venue: { name: venueObj.name || null, city: venueObj.city || null, state_province: venueObj.state || venueObj.state_province || null, country: venueObj.country || 'USA', neutral_site: neutral }
  };
}

async function fetchSeason(season, key) {
  const url = `${SB_BASE}/schedule/season/${season}.json?key=${encodeURIComponent(key)}`;
  try {
    const json = await getJSON(url);
    const games = json.games || json.data || json || [];
    return games.map(g => normalizeGame(season, g));
  } catch (e) {
    const games = [];
    const start = new Date(`${season}-08-01T00:00:00Z`);
    const end   = new Date(`${season+1}-01-15T00:00:00Z`);
    for (let d=new Date(start); d<=end; d.setUTCDate(d.getUTCDate()+1)) {
      const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), da=String(d.getUTCDate()).padStart(2,'0');
      const dailyUrl = `${SB_BASE}/schedule/daily/${y}-${m}-${da}.json?key=${encodeURIComponent(key)}`;
      try {
        const j = await getJSON(dailyUrl);
        for (const g of (j.games || j.data || [])) games.push(normalizeGame(season, g));
      } catch(_) {}
    }
    return games;
  }
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = parseInt(qs.season || '2025', 10);
    const key = process.env.SPORTS_BLAZE_KEY;
    if (!key) return { statusCode: 500, body: JSON.stringify({ ok:false, error:'Missing env SPORTS_BLAZE_KEY' }) };

    const allGames = await fetchSeason(season, key);
    const weeks = {}; for (let w=1; w<=18; w++) weeks[String(w)] = [];
    for (const g of allGames) if (g.week>=1 && g.week<=18) weeks[String(g.week)].push(g);
    for (const k of Object.keys(weeks)) weeks[k].sort((a,b)=>(a.start_unix||0)-(b.start_unix||0));

    const full = { season, season_type: 'REG', weeks };

    // Use the NFL-only store
    const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
    const siteID = process.env.SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
    const store = getStore({ name, siteID, token });
    const blobKey = `schedules/${season}/full.json`;
    await store.set(blobKey, JSON.stringify(full), { contentType: 'application/json; charset=utf-8' });

    const counts = Object.fromEntries(Object.entries(weeks).map(([k,v])=>[k, v.length]));
    return { statusCode: 200, headers: {'content-type':'application/json'}, body: JSON.stringify({ ok:true, season, store:name, blobKey, counts }) };
  } catch (err) {
    return { statusCode: 500, headers: {'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
