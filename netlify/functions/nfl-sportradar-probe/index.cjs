'use strict';
// Probes Sportradar weekly depth charts and returns a concise schema snapshot
// GET /.netlify/functions/nfl-sportradar-probe?season=2025&week=1&season_type=REG
const fetch = global.fetch;

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const key = process.env.SPORTRADAR_API_KEY;
    if (!key) return { statusCode: 500, body: JSON.stringify({ ok:false, error:'Missing SPORTRADAR_API_KEY' }) };
    const season = parseInt(qs.season || '2025', 10);
    const week = parseInt(qs.week || '1', 10);
    const stype = (qs.season_type || 'REG').toUpperCase();
    const access = qs.access_level || process.env.SPORTRADAR_ACCESS_LEVEL || 'trial';
    const lang = qs.lang || process.env.SPORTRADAR_LANG || 'en';
    const url = `https://api.sportradar.com/nfl/official/${access}/v7/${lang}/seasons/${season}/${stype}/${week}/depth_charts.json?api_key=${encodeURIComponent(key)}`;

    const r = await fetch(url);
    const text = await r.text();
    if (!r.ok) return { statusCode: r.status, body: JSON.stringify({ ok:false, status:r.status, text: text.slice(0,2000) }) };
    const data = JSON.parse(text);

    const teams = data.teams || [];
    const out = { ok:true, url, teamCount: teams.length, teams: [] };
    for (const t of teams.slice(0, 5)) {
      const alias = t.alias || t.abbr || t.name || t.market;
      const positions = t.depth_chart && t.depth_chart.offense && (t.depth_chart.offense.positions || t.depth_chart.offense) || [];
      const posNames = Array.isArray(positions) ? positions.map(p => p.name || p.position || p.abbreviation) : Object.keys(positions);
      const firstPlayers = Array.isArray(positions) && positions[0] && positions[0].players ? positions[0].players.slice(0,3) : [];
      const playerKeys = firstPlayers[0] ? Object.keys(firstPlayers[0]).slice(0, 12) : [];
      out.teams.push({
        alias,
        posNames,
        samplePlayerKeys: playerKeys
      });
    }
    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify(out) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error: String(err && err.message ? err.message : err) }) };
  }
};
