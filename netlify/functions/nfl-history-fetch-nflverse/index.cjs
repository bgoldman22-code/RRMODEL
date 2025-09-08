'use strict';
// Robust nflverse history fetcher with multiple mirrors.
// Tries current season first, then prior season as "priors" if 404/unavailable.

const https = require('https');
const zlib = require('zlib');
const { parse } = require('csv-parse/sync');
const { getBlobsStore } = require('../_blobs.cjs');

function fetchRaw(url, timeoutMs=20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'netlify-nfl-history/1.0' }}, res => {
      if (res.statusCode !== 200) {
        reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { statusCode: res.statusCode }));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('ETIMEDOUT')); });
  });
}

async function fetchCSVMaybeGzip(url) {
  const buf = await fetchRaw(url);
  if (url.endsWith('.gz')) return zlib.gunzipSync(buf).toString('utf8');
  return buf.toString('utf8');
}

function mirrorsForSeason(season) {
  return [
    // raw repo (legacy location)
    `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/seasons/play_by_play_${season}.csv.gz`,
    // jsDelivr CDN mirror of the same path
    `https://cdn.jsdelivr.net/gh/nflverse/nflfastR-data@master/data/seasons/play_by_play_${season}.csv.gz`,
    // new consolidated releases repo
    `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`,
  ];
}

function toInt(x, def=0){ const n=parseInt(x,10); return Number.isFinite(n)?n:def; }

function aggregatePriors(pbpRows) {
  const byPlayer = new Map();
  for (const r of pbpRows) {
    const posteam = r.posteam || r.offense_team || r.possession_team || '';
    const player = r.rusher_player_name || r.receiver_player_name || r.passer_player_name || '';
    const ppos = r.rusher_player_name ? 'RB' : (r.receiver_player_name ? 'WR' : (r.passer_player_name ? 'QB' : null));
    if (!ppos || !player || !posteam) continue;
    const pid = `${posteam}|${player}|${ppos}`;
    const ydline_100 = toInt(r.yardline_100);
    const rush = r.rush == '1' || r.play_type == 'run';
    const pass = r.pass == '1' || r.play_type == 'pass';
    const target = pass && !!r.receiver_player_name;
    const gl = ydline_100 > 0 && ydline_100 <= 5;

    const o = byPlayer.get(pid) || { team: posteam, player, pos: ppos, rush_att:0, gl_carries:0, targets:0, pass_att:0 };
    if (rush && ppos === 'RB') { o.rush_att += 1; if (gl) o.gl_carries += 1; }
    if (target && (ppos === 'WR' || ppos === 'TE')) { o.targets += 1; }
    if (pass && ppos === 'QB') { o.pass_att += 1; }
    byPlayer.set(pid, o);
  }
  const byTeam = {};
  for (const o of byPlayer.values()) {
    const t = o.team;
    if (!byTeam[t]) byTeam[t] = { QB:[], RB:[], WR:[], TE:[] };
    byTeam[t][o.pos].push(o);
  }
  for (const t of Object.keys(byTeam)) {
    byTeam[t].QB.sort((a,b)=>b.pass_att - a.pass_att);
    byTeam[t].RB.sort((a,b)=> (b.gl_carries*3 + b.rush_att) - (a.gl_carries*3 + a.rush_att));
    byTeam[t].WR.sort((a,b)=>b.targets - a.targets);
    byTeam[t].TE.sort((a,b)=>b.targets - a.targets);
    for (const k of ['QB','RB','WR','TE']) byTeam[t][k] = byTeam[t][k].slice(0,4);
  }
  return byTeam;
}

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const season = String(qs.season || '2025');
  const prev = String(toInt(season)-1);
  const store = getBlobsStore(process.env.BLOBS_STORE_NFL || 'nfl-td');

  const tried = [];
  let csv = null;
  let seasonUsed = season;

  // Try current season across mirrors
  for (const url of mirrorsForSeason(season)) {
    tried.push(url);
    try {
      csv = await fetchCSVMaybeGzip(url);
      if (csv && csv.length > 1000) break;
    } catch (_) {}
  }

  // If still nothing, fall back to previous season priors
  let saved = [];
  if (!csv) {
    seasonUsed = prev;
    for (const url of mirrorsForSeason(prev)) {
      tried.push(url);
      try {
        csv = await fetchCSVMaybeGzip(url);
        if (csv && csv.length > 1000) break;
      } catch (_) {}
    }
    if (!csv) {
      return { statusCode: 200, headers:{'content-type':'application/json'},
        body: JSON.stringify({ ok:false, error:'Failed to fetch pbp CSV (and priors fallback)', tried }) };
    }
    const rows = parse(csv, { columns:true, skip_empty_lines:true });
    const byTeam = aggregatePriors(rows);
    const key = `history/${season}/pbp-priors.json`;
    await store.set(key, JSON.stringify({ season, fromSeason: prev, byTeam }, null, 2), { contentType:'application/json; charset=utf-8' });
    saved.push(key);
    return { statusCode: 200, headers:{'content-type':'application/json'},
      body: JSON.stringify({ ok:true, season, pbp404:true, mirrors:true, saved, tried }) };
  }

  // If we did get current-season CSV, store the raw (optional bootstrap)
  const key = `history/${season}/pbp-raw.csv.gz`;
  await store.set(key, Buffer.from(csv, 'utf8'), { contentType:'application/gzip' });
  saved.push(key);

  return { statusCode: 200, headers:{'content-type':'application/json'},
    body: JSON.stringify({ ok:true, season, saved, tried }) };
};
