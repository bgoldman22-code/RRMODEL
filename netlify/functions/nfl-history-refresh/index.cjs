'use strict';
// Pull previous week's final games from SportsBlaze and append to NFL history blobs
const fetch = global.fetch;
const { appendHistory } = require('../_lib/common.cjs');

const SB_BASE = 'https://api.sportsblaze.com/nfl/v1';

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = parseInt(qs.season || '2025', 10);
    const week = parseInt(qs.week || 'auto', 10);
    const key = process.env.SPORTS_BLAZE_KEY;
    if (!key) return { statusCode: 500, body: JSON.stringify({ ok:false, error:'Missing SPORTS_BLAZE_KEY' }) };

    // If week=auto, pick the most recent week that has Final games within the last 8 days
    const url = `${SB_BASE}/schedule/season/${season}.json?key=${encodeURIComponent(key)}&type=Regular%20Season`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const js = await r.json();
    const games = (js.games || []).filter(g => g.season && g.season.type === 'Regular Season');

    const now = Date.now();
    const finals = games.filter(g => g.status && /Final/i.test(g.status));
    finals.sort((a,b)=> new Date(b.date) - new Date(a.date));
    let targetWeek = isNaN(week) ? (finals[0]?.season?.week || 1) : week;

    const weekGames = games.filter(g => g.season.week === targetWeek);
    const compact = weekGames.map(g => ({
      week: g.season.week,
      date_utc: g.date,
      status: g.status,
      away: g.teams?.away?.name,
      home: g.teams?.home?.name,
      venue: g.venue?.name || null,
      result: g.scores?.total ? { away: g.scores.total.away?.points, home: g.scores.total.home?.points } : null
    }));

    const blobKey = await appendHistory(season, targetWeek, compact);
    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:true, season, week: targetWeek, saved: blobKey, count: compact.length }) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
