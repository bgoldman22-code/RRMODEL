
import { saveToBlobs } from '../_lib/blobs-helper.mjs';

// very light CSV splitter (no quotes support beyond simple cases)
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(',');
  return lines.map(line => {
    const cols = line.split(',');
    const row = {};
    header.forEach((h, i) => row[h] = cols[i]);
    return row;
  });
}

function buildTeamForm(rows, years) {
  const byTeam = new Map();
  for (const r of rows) {
    const season = Number(r.season || r.Season || r.year);
    if (years.length && !years.includes(season)) continue;
    const home = r.home_team || r.home_team_name || r.home_team_id || r.home_team_abbr || r.home_team_preferred || r.home_team_code || r.home_team_short || r.home_team_full || r.home_team;
    const away = r.away_team || r.away_team_name || r.away_team_abbr || r.away_team_preferred || r.away_team_code || r.away_team_short || r.away_team_full || r.away_team;
    const hs = Number(r.home_score || r.h_score || r.home_points || r.home_team_score || r.home_pts || 0);
    const as = Number(r.away_score || r.a_score || r.away_points || r.away_team_score || r.away_pts || 0);
    if (!home || !away) continue;
    const marginHome = hs - as;
    const marginAway = -marginHome;
    const recH = byTeam.get(home) || { gp:0, pf:0, pa:0, margin:0 };
    recH.gp++; recH.pf+=hs; recH.pa+=as; recH.margin+=marginHome; byTeam.set(home, recH);
    const recA = byTeam.get(away) || { gp:0, pf:0, pa:0, margin:0 };
    recA.gp++; recA.pf+=as; recA.pa+=hs; recA.margin+=marginAway; byTeam.set(away, recA);
  }
  const out = {};
  for (const [team, rec] of byTeam.entries()) {
    const gp = rec.gp || 1;
    out[team] = {
      games: gp,
      ppg: rec.pf/gp,
      oppg: rec.pa/gp,
      margin_pg: rec.margin/gp,
      form: rec.margin/gp // simple form proxy
    };
  }
  return out;
}

export const handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const force = qs.force || qs.FORCE || qs.f || "0";
  const yearsParam = qs.years || qs.season || "";
  const years = (yearsParam ? String(yearsParam) : "").split(',').map(s => Number(s)).filter(Boolean);
  // Download a single canonical CSV (nfldata/games.csv) then filter
  const url = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";
  let csv;
  let ok = true;
  let reason = null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    csv = await resp.text();
  } catch (e) {
    ok = false; reason = String(e);
  }
  let rows = [];
  if (ok) {
    rows = parseCSV(csv);
  }
  const features = buildTeamForm(rows, years);
  const meta = { years: years.length ? years : "all", persisted: false, wrote: null, persist_error: null };
  let save = { ok:false, reason: "skip" };
  if (Object.keys(features).length) {
    save = await saveToBlobs("team_form.json", features, { contentType: "application/json" });
    if (save.ok) { meta.persisted = true; meta.wrote = "team_form.json"; } else { meta.persist_error = save.reason; }
  }
  const summary = { teams: Object.keys(features).length, totalRows: rows.length };
  return {
    statusCode: 200,
    headers: { "content-type":"application/json" },
    body: JSON.stringify({ ok: true, meta, summary, seasonResults: [{ year: years[0] || "all", ok, source: url, reason }], updated: new Date().toISOString() })
  };
};
