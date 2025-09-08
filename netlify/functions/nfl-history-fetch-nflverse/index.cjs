'use strict';
// Fetch history from nflverse public CSVs and write blobs for dynamic depth charts.
// GET /.netlify/functions/nfl-history-fetch-nflverse?season=2025&weeks=1-2 (weeks optional; we store whole-season trimmed to last 3 by default)
//
// Writes:
//   history/{season}/pbp-last3.json
//   history/{season}/weekly-last3.json
//
const { getStore } = require('@netlify/blobs');
const zlib = require('zlib');
const { parse } = require('csv-parse/sync');

function blobsStoreNFL() {
  const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
  const siteID = process.env.SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
  return getStore({ name, siteID, token });
}

function parseWeeksParam(s) {
  if (!s) return null;
  // formats: "1-3", "1,2,3", "2"
  if (s.includes('-')) {
    const [a,b] = s.split('-').map(x=>parseInt(x,10));
    if (a && b) return Array.from({length: b-a+1}, (_,i)=>a+i);
  }
  const arr = s.split(',').map(x=>parseInt(x,10)).filter(Boolean);
  return arr.length ? arr : null;
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = String(qs.season || '2025');
    const weeksParam = parseWeeksParam(qs.weeks || '');
    const wantWeeks = weeksParam && weeksParam.length ? new Set(weeksParam) : null;

    const store = blobsStoreNFL();

    // URLs (csv.gz for pbp, csv for weekly player stats)
    const pbpUrl = `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/seasons/play_by_play_${season}.csv.gz`;
    const wkUrl  = `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/player_stats/player_stats_${season}.csv`;

    // Download PBP gz
    const r1 = await fetch(pbpUrl);
    if (!r1.ok) {
      return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:`Failed to fetch pbp CSV (${r1.status})`, url: pbpUrl }) };
    }
    const gzBuf = Buffer.from(await r1.arrayBuffer());
    const csvBuf = zlib.gunzipSync(gzBuf);
    const pbpCsv = csvBuf.toString('utf8');
    const pbpRows = parse(pbpCsv, { columns:true, skip_empty_lines:true });

    // Filter/trim pbp to the weeks we want or last 3 completed weeks
    let pbpSeason = pbpRows.filter(r => String(r.season||'') === season);
    // Some files already scoped; keep all and rely on 'week'
    const weeksAvail = Array.from(new Set(pbpSeason.map(r => parseInt(r.week||r.week_fixed||r.weekly,10)).filter(Boolean))).sort((a,b)=>a-b);
    let weeksPick;
    if (wantWeeks) {
      weeksPick = Array.from(new Set(Array.from(wantWeeks).filter(w => weeksAvail.includes(w))));
    } else {
      // last 3 weeks available
      weeksPick = weeksAvail.slice(-3);
    }
    const pbpOut = pbpSeason.filter(r => weeksPick.includes(parseInt(r.week,10))).map(r => ({
      season: Number(r.season)||Number(season),
      week: Number(r.week)||null,
      posteam: r.posteam || r.offense_team || r.team || r.pos_team,
      yardline_100: r.yardline_100 || r.yardline || '',
      ydstogo: r.ydstogo || r.yards_to_go || '',
      play_type: r.play_type || r.play_type_nfl || '',
      rusher_player_name: r.rusher_player_name || r.rusher || '',
      receiver_player_name: r.receiver_player_name || r.receiver || '',
      air_yards: r.air_yards || '',
      touchdown: r.touchdown || r.td || '0'
    }));

    // Download weekly stats
    const r2 = await fetch(wkUrl);
    if (!r2.ok) {
      return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:`Failed to fetch weekly stats CSV (${r2.status})`, url: wkUrl }) };
    }
    const wkCsv = await r2.text();
    const wkRows = parse(wkCsv, { columns:true, skip_empty_lines:true });
    const wkSeason = wkRows.filter(r => String(r.season||'') === season);
    // columns vary; map flexibly
    const wkOut = wkSeason.filter(r => weeksPick.includes(parseInt(r.week||r.gsis_week||r.weekly,10))).map(r => ({
      season: Number(r.season)||Number(season),
      week: Number(r.week)||null,
      team: r.recent_team || r.team || r.team_abbr || r.player_team || '',
      player: r.player || r.player_name || r.full_name || r.name || '',
      position: r.position || r.pos || '',
      offense_snaps: r.offense_snaps || r.offense_snaps_played || r.snaps || '',
      rush_att: r.rush_att || r.rushing_attempts || r.carries || '',
      targets: r.targets || r.tgt || '',
      rushing_tds: r.rushing_tds || r.rush_tds || '',
      receiving_tds: r.receiving_tds || r.rec_tds || ''
    }));

    // Save blobs
    const pbpKey = `history/${season}/pbp-last3.json`;
    const weeklyKey = `history/${season}/weekly-last3.json`;
    await store.set(pbpKey, JSON.stringify(pbpOut), { contentType: 'application/json; charset=utf-8' });
    await store.set(weeklyKey, JSON.stringify(wkOut), { contentType: 'application/json; charset=utf-8' });

    return {
      statusCode: 200,
      headers:{'content-type':'application/json'},
      body: JSON.stringify({
        ok:true,
        season,
        weeks: weeksPick,
        wrote: { pbpKey, weeklyKey },
        counts: { pbp: pbpOut.length, weekly: wkOut.length },
        urls: { pbpUrl, wkUrl }
      })
    };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err && err.message ? err.message : err) }) };
  }
};
