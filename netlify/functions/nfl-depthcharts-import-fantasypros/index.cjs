// netlify/functions/nfl-depthcharts-import-fantasypros/index.cjs
// POST raw CSV from FantasyPros to populate depth charts into Netlify Blobs.
// Usage:
//   curl -X POST \
//     -H "Content-Type: text/csv" \
//     --data-binary @FantasyPros_Fantasy_Football_2025_Depth_Charts.csv \
//     "https://<yoursite>/.netlify/functions/nfl-depthcharts-import-fantasypros?season=2025&week=1"
//
// Writes:
//   depth/season/{season}/week{week}.json
//   depth/season/{season}/current.json

const { parse } = require('csv-parse/sync');
const { getBlobsStore } = require('../_blobs.js');

// Map FantasyPros team names/abbrevs to our aliases
const TEAM_MAP = {
  "ARI":"ARI","Arizona Cardinals":"ARI",
  "ATL":"ATL","Atlanta Falcons":"ATL",
  "BAL":"BAL","Baltimore Ravens":"BAL",
  "BUF":"BUF","Buffalo Bills":"BUF",
  "CAR":"CAR","Carolina Panthers":"CAR",
  "CHI":"CHI","Chicago Bears":"CHI",
  "CIN":"CIN","Cincinnati Bengals":"CIN",
  "CLE":"CLE","Cleveland Browns":"CLE",
  "DAL":"DAL","Dallas Cowboys":"DAL",
  "DEN":"DEN","Denver Broncos":"DEN",
  "DET":"DET","Detroit Lions":"DET",
  "GB":"GB","Green Bay Packers":"GB",
  "HOU":"HOU","Houston Texans":"HOU",
  "IND":"IND","Indianapolis Colts":"IND",
  "JAX":"JAX","Jacksonville Jaguars":"JAX","JAC":"JAX",
  "KC":"KC","Kansas City Chiefs":"KC",
  "LAR":"LAR","Los Angeles Rams":"LAR","LA Rams":"LAR",
  "LAC":"LAC","Los Angeles Chargers":"LAC","LA Chargers":"LAC","Chargers":"LAC",
  "LV":"LV","Las Vegas Raiders":"LV","Raiders":"LV",
  "MIA":"MIA","Miami Dolphins":"MIA",
  "MIN":"MIN","Minnesota Vikings":"MIN",
  "NE":"NE","New England Patriots":"NE",
  "NO":"NO","New Orleans Saints":"NO",
  "NYG":"NYG","New York Giants":"NYG",
  "NYJ":"NYJ","New York Jets":"NYJ",
  "PHI":"PHI","Philadelphia Eagles":"PHI",
  "PIT":"PIT","Pittsburgh Steelers":"PIT",
  "SEA":"SEA","Seattle Seahawks":"SEA",
  "SF":"SF","San Francisco 49ers":"SF",
  "TB":"TB","Tampa Bay Buccaneers":"TB",
  "TEN":"TEN","Tennessee Titans":"TEN",
  "WAS":"WAS","Washington Commanders":"WAS","Washington":"WAS"
};

function emptyCharts() {
  const teams = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LAR","LAC","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"];
  const chart = {};
  teams.forEach(t=> chart[t] = { RB:[], WR:[], TE:[], QB:[] });
  return chart;
}

function normalizePos(p) {
  if (!p) return null;
  const s = String(p).toUpperCase();
  if (s.startsWith("RB")) return "RB";
  if (s.startsWith("WR")) return "WR";
  if (s.startsWith("TE")) return "TE";
  if (s.startsWith("QB")) return "QB";
  return null;
}

exports.handler = async (event) => {
  try {
    const season = Number((event.queryStringParameters?.season)||new Date().getFullYear());
    const week = Number((event.queryStringParameters?.week)||1);
    const store = getBlobsStore('nfl-td'); // use same store namespace as other NFL TD files

    if (event.httpMethod !== 'POST') {
      return { statusCode: 200, body: JSON.stringify({ ok:false, error:"POST CSV with Content-Type:text/csv", example:`curl -X POST -H 'Content-Type: text/csv' --data-binary @FantasyPros_Fantasy_Football_2025_Depth_Charts.csv '${process.env.URL || ''}/.netlify/functions/nfl-depthcharts-import-fantasypros?season=${season}&week=${week}'` }) };
    }
    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
    if (!contentType.includes('text/csv')) {
      return { statusCode: 200, body: JSON.stringify({ ok:false, error:"Content-Type must be text/csv" }) };
    }

    const csv = event.body || '';
    if (!csv.trim()) {
      return { statusCode: 200, body: JSON.stringify({ ok:false, error:"Empty CSV body" }) };
    }

    const rows = parse(csv, { columns: true, skip_empty_lines: true });
    const charts = emptyCharts();

    // Attempt to detect column names; FantasyPros often includes: Team, POS, Player, Depth or Order
    // We'll be generous and try multiple common headers.
    const pick = (row, keys) => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
      }
      return null;
    };

    let count = 0;
    for (const row of rows) {
      const teamRaw = pick(row, ['Team','TEAM','Tm','Franchise','FranchiseName']);
      const posRaw  = pick(row, ['POS','Position','Pos']);
      const name    = pick(row, ['Player','PLAYER','Name','FullName']);
      const depth   = pick(row, ['Depth','Order','Rank','Slot']);
      const t = TEAM_MAP[String(teamRaw||'').trim()];

      const pos = normalizePos(posRaw);
      if (!t || !pos || !name) continue;

      let depthNum = Number(depth);
      if (!Number.isFinite(depthNum) || depthNum <= 0) {
        // try to infer from suffixes (WR1/WR2) or order of appearance
        const match = String(posRaw).match(/(\d+)/);
        depthNum = match ? Number(match[1]) : (charts[t][pos].length + 1);
      }

      charts[t][pos].push({ name: String(name).trim(), depth: depthNum, pos });
      count++;
    }

    const keyWeek = `depth/season/${season}/week${week}.json`;
    const keyCurr = `depth/season/${season}/current.json`;

    await store.set(keyWeek, JSON.stringify(charts), { contentType: 'application/json' });
    await store.set(keyCurr, JSON.stringify(charts), { contentType: 'application/json' });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok:true, season, week, ingested: count, wrote: { weekKey: keyWeek, currKey: keyCurr } })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};
