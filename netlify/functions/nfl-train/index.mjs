import { loadFromBlobs, saveToBlobs } from "../_lib/blobs-helper.mjs";

const DATA_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(",");
  return lines.map(line => {
    const cols = line.split(",");
    const obj = {};
    headers.forEach((h,i)=> obj[h] = cols[i]);
    return obj;
  });
}

function computeTeamForm(rows, years) {
  const set = new Set(years.map(String));
  const byTeam = new Map();
  for (const r of rows) {
    if (!set.has(String(r.season))) continue;
    const home = r.home_team, away = r.away_team;
    const hp = Number(r.home_score || 0), ap = Number(r.away_score || 0);
    const hForm = byTeam.get(home) || { games:0, pf:0, pa:0 };
    const aForm = byTeam.get(away) || { games:0, pf:0, pa:0 };
    hForm.games++; hForm.pf += hp; hForm.pa += ap;
    aForm.games++; aForm.pf += ap; aForm.pa += hp;
    byTeam.set(home, hForm); byTeam.set(away, aForm);
  }
  const out = {};
  for (const [team, v] of byTeam) {
    const gp = Math.max(1, v.games);
    out[team] = { gp, off: v.pf/gp, def: v.pa/gp, net: (v.pf - v.pa)/gp };
  }
  return out;
}

export const handler = async (event) => {
  try {
    const qp = event.queryStringParameters || {};
    const years = (qp.years ? qp.years.split(",") : (qp.season ? [qp.season] : ["2025"])).map(s => s.trim());
    const force = qp.force ? true : false;

    // Always fetch fresh (simple approach)
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error(`fetch ${DATA_URL} -> ${resp.status}`);
    const text = await resp.text();
    const rows = parseCSV(text);

    const features = computeTeamForm(rows, years);

    let persisted = false;
    if (force) {
      persisted = await saveToBlobs("team_form.json", features);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        meta: { years: years.map(y => Number(y)), persisted },
        summary: { teams: Object.keys(features).length, totalRows: rows.length },
        updated: new Date().toISOString()
      })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};
