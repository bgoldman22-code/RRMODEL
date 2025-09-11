// netlify/functions/lib/elo.js
const zlib = require("zlib");
const https = require("https");

const BASE_ELO = 1500;
const K_BASE = 22;        // base K
const HFA = 60;           // home-field advantage in Elo rating points
const RETENTION = 0.80;   // carry-over between seasons at season rollover

function seasonWeight(season, currentSeason) {
  const d = currentSeason - season;
  if (d <= 0) return 1.0;     // current season
  if (d === 1) return 0.75;   // last season
  if (d === 2) return 0.60;
  if (d === 3) return 0.50;
  // older seasons: exponential decay but don't drop below 0.25
  const w = 0.50 * Math.exp(-(d - 3) / 2);
  return Math.max(0.25, w);
}

function impliedFromEloDiff(diff) {
  // standard Elo win prob logistic
  const q = Math.pow(10, diff / 400);
  return q / (1 + q);
}

function impliedFromAmerican(price) {
  if (price === null || price === undefined) return null;
  const p = Number(price);
  if (p > 0) return 100 / (p + 100);
  return -p / (-p + 100);
}

// tiny helper to fetch and gunzip nflverse CSVs
function fetchGz(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        try {
          const buf = Buffer.concat(chunks);
          const csv = zlib.gunzipSync(buf).toString("utf8");
          resolve(csv);
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function parseCSV(csv) {
  const [head, ...lines] = csv.trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map(line => {
    // naive csv split (nflverse is simple for these columns)
    const parts = line.split(",");
    const row = {};
    cols.forEach((k, i) => row[k] = parts[i]);
    return row;
  });
}

function rollSeasonStart(ratings) {
  // regress toward mean to start a season
  for (const t of Object.keys(ratings)) {
    ratings[t] = BASE_ELO + (ratings[t] - BASE_ELO) * RETENTION;
  }
}

async function getNflverseGames(seasons) {
  // Use games.csv.gz — has result & teams
  const rows = [];
  for (const season of seasons) {
    const url = `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/${season}.csv.gz`;
    const csv = await fetchGz(url);
    const parsed = parseCSV(csv);
    for (const r of parsed) {
      // keep only regular season & playoffs
      if (!r.game_type || (r.game_type !== "REG" && r.game_type !== "POST")) continue;
      rows.push({
        season: Number(r.season),
        week: Number(r.week),
        game_id: r.game_id || r.gsis, // column varies by vintage
        home_team: r.home_team,
        away_team: r.away_team,
        // winner: home/away based on points
        home_score: Number(r.home_score || r.home_score_final || r.home_points || r.home_score_q4 || 0),
        away_score: Number(r.away_score || r.away_score_final || r.away_points || r.away_score_q4 || 0),
        kickoff: r.gametime || r.game_date || r.game_date_time || ""
      });
    }
  }
  // sort chronologically by season/week (kickoff fallback)
  rows.sort((a,b)=> a.season - b.season || a.week - b.week);
  return rows;
}

function teamKey(s) {
  // nflverse already uses current abbreviations for most years; keep as-is
  return s;
}

function ensureTeam(ratings, team) {
  if (!ratings[team]) ratings[team] = BASE_ELO;
}

function updateElo(ratings, home, away, homeWon, weight) {
  const Rh = ratings[home], Ra = ratings[away];
  // apply HFA on top of home rating
  const RhAdj = Rh + HFA;
  const RaAdj = Ra;
  const Eh = impliedFromEloDiff(RhAdj - RaAdj);
  const Ea = 1 - Eh;
  const Sh = homeWon ? 1 : 0;
  const Sa = 1 - Sh;
  const K = K_BASE * weight;
  ratings[home] = Rh + K * (Sh - Eh);
  ratings[away] = Ra + K * (Sa - Ea);
}

module.exports = {
  BASE_ELO,
  K_BASE,
  HFA,
  RETENTION,
  seasonWeight,
  impliedFromEloDiff,
  impliedFromAmerican,
  getNflverseGames,
  teamKey,
  ensureTeam,
  updateElo,
  rollSeasonStart,
};