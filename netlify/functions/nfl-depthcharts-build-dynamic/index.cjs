'use strict';
// Build dynamic depth charts from history blobs (nfl-data-py derived JSON uploaded by your GH Action).
// Reads: history/{season}/weekly-last3.json and history/{season}/pbp-last3.json
// Outputs: depth/{season}/week{week}/depth-charts.json (QB/RB/WR/TE with usage shares)
//
// Usage:
//   /.netlify/functions/nfl-depthcharts-build-dynamic?season=2025&week=1&lookback=5
//
// Env:
//   BLOBS_STORE_NFL (default nfl-td), SITE_ID, NETLIFY_API_TOKEN (or BLOBS_TOKEN)
//
const { getStore } = require('@netlify/blobs');

function blobsStoreNFL() {
  const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
  const siteID = process.env.SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
  return getStore({ name, siteID, token });
}

const OFF_POS = new Set(['QB','RB','WR','TE','FB','HB']);

function pct(n,d){ n = Number(n)||0; d = Number(d)||0; return d>0 ? (n/d) : 0; }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function roleListToArray(sorted, posKey){
  // sorted: [{name, depth, shares: {...}}]
  const out = [];
  for (const row of sorted.slice(0,3)) {
    const obj = { name: row.name, role: `${posKey}${row.depth}` };
    if (posKey==='RB'){
      obj.goal_line_share = row.shares?.gl_share ?? 0.2;
    } else if (posKey==='WR'){
      obj.red_zone_target_share = row.shares?.rz_tgt_share ?? 0.18;
      obj.deep_threat = row.shares?.deep_share ?? 0.30;
    } else if (posKey==='TE'){
      obj.red_zone_target_share = row.shares?.rz_tgt_share ?? 0.16;
    } else if (posKey==='QB'){
      obj.rush_td_rate = row.shares?.rush_td_rate ?? 0.03;
    }
    out.push(obj);
  }
  return out;
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const season = String(qs.season || '2025');
    const week = parseInt(String(qs.week || '1'), 10);
    const lookback = Math.max(1, Math.min(8, parseInt(String(qs.lookback || '5'), 10)));

    const store = blobsStoreNFL();
    const weeklyKey = `history/${season}/weekly-last3.json`;
    const pbpKey = `history/${season}/pbp-last3.json`;

    const weeklyTxt = await store.get(weeklyKey, { type: 'text' });
    const pbpTxt = await store.get(pbpKey, { type: 'text' });

    if (!weeklyTxt || !pbpTxt) {
      return {
        statusCode: 200,
        headers:{'content-type':'application/json'},
        body: JSON.stringify({
          ok:false,
          error:'Missing history blobs; make sure the Monday/Tuesday GitHub Action populated them.',
          missing: { weekly: !weeklyTxt, pbp: !pbpTxt },
          expect: [weeklyKey, pbpKey]
        })
      };
    }

    let weekly, pbp;
    try{ weekly = JSON.parse(weeklyTxt); }catch(e){ weekly = []; }
    try{ pbp = JSON.parse(pbpTxt); }catch(e){ pbp = []; }

    // Limit to last N weeks up to target week
    const maxWeek = week - 1; // use only weeks before the target
    const minWeek = Math.max(1, maxWeek - (lookback-1));

    const wRows = weekly.filter(r =>
      Number(r.season) === Number(season) &&
      Number(r.week) >= minWeek && Number(r.week) <= maxWeek &&
      OFF_POS.has(r.position)
    );

    // Compute team-level totals for shares
    // For RB: carries (rush_att); goal-line carries from pbp (yardline_yds <= 2 and rusher)
    // For WR/TE: targets; red-zone targets from pbp (yardline_yds <= 20 and target)
    // For QB: rushing TDs + rush attempts for context

    // Build simple maps: team -> { pos -> player -> metrics }
    const byTeamPos = new Map();

    function teamRec(team){
      if (!byTeamPos.has(team)) {
        byTeamPos.set(team, { QB:{}, RB:{}, WR:{}, TE:{} });
      }
      return byTeamPos.get(team);
    }

    for (const r of wRows) {
      const team = r.team || r.recent_team || r.player_team || r.team_abbr;
      const player = r.player || r.player_name || r.full_name;
      const pos = (r.position || '').toUpperCase();
      if (!team || !player || !OFF_POS.has(pos)) continue;

      const t = teamRec(team);
      if (!t[pos][player]) t[pos][player] = { name: player, snaps:0, rush_att:0, targets:0, rush_tds:0, rec_tds:0 };
      const m = t[pos][player];
      m.snaps += Number(r.offense_snaps || r.snaps || 0);
      m.rush_att += Number(r.rush_att || r.rushing_attempts || 0);
      m.targets += Number(r.targets || 0);
      m.rush_tds += Number(r.rushing_tds || 0);
      m.rec_tds += Number(r.receiving_tds || 0);
    }

    // PBP shares
    const pRows = pbp.filter(p =>
      Number(p.season) === Number(season) &&
      Number(p.week) >= minWeek && Number(p.week) <= maxWeek
    );

    // Helper: increment per player per team
    function inc(map, team, player, key, by){
      const t = teamRec(team);
      const posBuckets = [t.RB, t.WR, t.TE, t.QB];
      // we don't have exact pos here; update whichever bucket contains this player (or make a provisional entry in RB/WR/TE)
      let found = false;
      for (const bucket of posBuckets) {
        if (bucket[player]) { bucket[player][key] = (bucket[player][key]||0) + by; found = true; break; }
      }
      if (!found) {
        // default to RB/WR as unknown; we'll treat WR if 'receiver' present, RB if 'rusher' present
        // this is heuristic and only for share rates
        const dest = key.includes('tgt') ? teamRec(team).WR : teamRec(team).RB;
        if (!dest[player]) dest[player] = { name: player };
        dest[player][key] = (dest[player][key]||0) + by;
      }
    }

    for (const p of pRows) {
      const offenseTeam = p.posteam || p.offense || p.team || p.offense_team;
      if (!offenseTeam) continue;
      const ytg = Number(p.ydstogo || p.yards_to_go || 0);
      const yardline = Number(p.yardline_100 || p.yardline || 99);
      const inRZ = yardline <= 20;
      const inGL = yardline <= 2;

      // Targets (receiver)
      const rec = p.receiver_player_name || p.receiver || p.receiver_name;
      if (rec) {
        inc(byTeamPos, offenseTeam, rec, 'rz_tgts', inRZ ? 1 : 0);
        inc(byTeamPos, offenseTeam, rec, 'deep_tgts', (p.air_yards || 0) >= 15 ? 1 : 0);
        inc(byTeamPos, offenseTeam, rec, 'tgts', 1);
      }
      // Carries (rusher)
      const rusher = p.rusher_player_name || p.rusher || p.rusher_name;
      if (rusher && p.play_type && String(p.play_type).toLowerCase().includes('rush')) {
        inc(byTeamPos, offenseTeam, rusher, 'gl_carries', inGL ? 1 : 0);
        inc(byTeamPos, offenseTeam, rusher, 'carries', 1);
      }
      // QB rush TD marker
      const td = (p.touchdown || p.td || 0) ? 1 : 0;
      if (td && rusher && (p.rusher_player_name || '').length) {
        inc(byTeamPos, offenseTeam, rusher, 'rush_tds_pbp', 1);
      }
    }

    // Build final charts per team
    const charts = {};
    for (const [team, buckets] of byTeamPos.entries()) {
      const out = { QB:[], RB:[], WR:[], TE:[] };
      // Compute totals for shares
      const totCarries = Object.values(buckets.RB).reduce((s,m)=> s + (m.carries||m.rush_att||0), 0);
      const totRZt = Object.values(buckets.WR).reduce((s,m)=> s + (m.rz_tgts||0), 0) + Object.values(buckets.TE).reduce((s,m)=> s + (m.rz_tgts||0), 0);
      const totDeep = Object.values(buckets.WR).reduce((s,m)=> s + (m.deep_tgts||0), 0);

      // Rankers
      function rankRB(a,b){
        // weight GL carries, total carries, snaps
        const aScore = (a.gl_carries||0)*3 + (a.carries||a.rush_att||0)*1.2 + (a.snaps||0)*0.01;
        const bScore = (b.gl_carries||0)*3 + (b.carries||b.rush_att||0)*1.2 + (b.snaps||0)*0.01;
        return bScore - aScore;
      }
      function rankWR(a,b){
        const aScore = (a.rz_tgts||0)*2.0 + (a.deep_tgts||0)*1.0 + (a.targets||a.tgts||0)*0.8 + (a.snaps||0)*0.01;
        const bScore = (b.rz_tgts||0)*2.0 + (b.deep_tgts||0)*1.0 + (b.targets||b.tgts||0)*0.8 + (b.snaps||0)*0.01;
        return bScore - aScore;
      }
      function rankTE(a,b){
        const aScore = (a.rz_tgts||0)*2.2 + (a.targets||a.tgts||0)*0.9 + (a.snaps||0)*0.01;
        const bScore = (b.rz_tgts||0)*2.2 + (b.targets||b.tgts||0)*0.9 + (b.snaps||0)*0.01;
        return bScore - aScore;
      }
      function rankQB(a,b){
        const aScore = (a.rush_tds||0)*2 + (a.rush_tds_pbp||0)*2 + (a.snaps||0)*0.01;
        const bScore = (b.rush_tds||0)*2 + (b.rush_tds_pbp||0)*2 + (b.snaps||0)*0.01;
        return bScore - aScore;
      }

      // Build arrays with depth + shares
      const RBs = Object.values(buckets.RB).sort(rankRB).map((m,i)=> ({
        name: m.name, depth: i+1,
        shares: {
          gl_share: clamp01(pct(m.gl_carries||0, totCarries||1)),
        }
      }));
      const WRs = Object.values(buckets.WR).sort(rankWR).map((m,i)=> ({
        name: m.name, depth: i+1,
        shares: {
          rz_tgt_share: clamp01(pct(m.rz_tgts||0, totRZt||1)),
          deep_share: clamp01(pct(m.deep_tgts||0, totDeep||1)),
        }
      }));
      const TEs = Object.values(buckets.TE).sort(rankTE).map((m,i)=> ({
        name: m.name, depth: i+1,
        shares: {
          rz_tgt_share: clamp01(pct(m.rz_tgts||0, totRZt||1)),
        }
      }));
      const QBs = Object.values(buckets.QB).sort(rankQB).map((m,i)=> ({
        name: m.name, depth: i+1,
        shares: {
          rush_td_rate: clamp01((m.rush_tds||0 + m.rush_tds_pbp||0) / Math.max(1, lookback)),
        }
      }));

      out.RB = roleListToArray(RBs, 'RB');
      out.WR = roleListToArray(WRs, 'WR');
      out.TE = roleListToArray(TEs, 'TE');
      out.QB = roleListToArray(QBs, 'QB');

      charts[team] = out;
    }

    if (!Object.keys(charts).length) {
      return {
        statusCode: 200, headers:{'content-type':'application/json'},
        body: JSON.stringify({ ok:false, error:'No teams built from history range', season, week, lookback, note:'Ensure weekly/pbp blobs exist and contain the requested season.' })
      };
    }

    const outKey = `depth/${season}/week${week}/depth-charts.json`;
    await store.set(outKey, JSON.stringify(charts, null, 2), { contentType: 'application/json; charset=utf-8' });

    const sampleTeam = Object.keys(charts)[0];
    return {
      statusCode: 200,
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ ok:true, source:'dynamic-history', season, week, lookback, saved: outKey, teams: Object.keys(charts).length, sampleTeam, sample: charts[sampleTeam] })
    };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err && err.message ? err.message : err) }) };
  }
};
