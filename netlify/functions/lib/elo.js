// netlify/functions/lib/elo.js
const zlib = require('zlib');
const https = require('https');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function impliedFromAmerican(american) {
  if (american == null) return null;
  const a = Number(american);
  if (Number.isNaN(a)) return null;
  if (a < 0) return (-a) / ((-a) + 100);
  return 100 / (a + 100);
}

function eloWinProb(homeRating, awayRating, hfa = 60) {
  // logistic with base-10 400 scale, add HFA to home rating
  const diff = (homeRating + hfa) - awayRating;
  return 1 / (1 + Math.pow(10, -diff / 400));
}

async function fetchNflverseGamesCsvGz() {
  const url = 'https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games.csv.gz';
  const gz = await httpGet(url);
  return zlib.gunzipSync(gz).toString('utf8');
}

function parseCsv(text) {
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const cols = header.split(',');
  return rows.map(line => {
    const parts = [];
    let cur = '';
    let inQ = false;
    for (let i=0;i<line.length;i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { parts.push(cur); cur = ''; continue; }
      cur += c;
    }
    parts.push(cur);
    const obj = {};
    cols.forEach((k, idx) => obj[k] = parts[idx]);
    return obj;
  });
}

function seasonFromDate(dateStr) {
  const y = Number(dateStr.slice(0,4));
  return y;
}

function initRatings(teams) {
  const r = {};
  teams.forEach(t => r[t] = 1500);
  return r;
}

function updateElo(ratings, home, away, homeScore, awayScore, k=20, hfa=60) {
  const Rh = ratings[home] ?? 1500;
  const Ra = ratings[away] ?? 1500;
  const Eh = 1 / (1 + Math.pow(10, -(((Rh + hfa) - Ra) / 400)));
  const outcome = homeScore > awayScore ? 1 : 0;
  const Rh2 = Rh + k * (outcome - Eh);
  const Ra2 = Ra + k * ((1 - outcome) - (1 - Eh));
  ratings[home] = Rh2;
  ratings[away] = Ra2;
}

module.exports = {
  impliedFromAmerican,
  eloWinProb,
  fetchNflverseGamesCsvGz,
  parseCsv,
  seasonFromDate,
  initRatings,
  updateElo,
};
