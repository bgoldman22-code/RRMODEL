// Node 18+ ESM script
import fs from "node:fs/promises";
import path from "node:path";
const fetchJson = async (url, opts={}) => {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
};
const asNum = (x) => Number.isFinite(+x) ? +x : null;
const americanToImplied = (ml) => {
  const n = asNum(ml);
  if (n == null) return null;
  return n > 0 ? 100 / (n + 100) : (-n) / (-n + 100);
};
const pickFromImplied = (homeImp, awayImp) => {
  if (homeImp == null && awayImp == null) return null;
  if ((homeImp ?? 0) >= (awayImp ?? 0)) return "HOME";
  return "AWAY";
};
const ensureDir = async (p) => fs.mkdir(p, { recursive: true }).catch(()=>{});
const normalize = (s) => (s || "").replace(/\./g,"").replace(/\s+/g," ").trim().toLowerCase();
const {
  SCHEDULE_API_ROOT,
  ODDS_API_KEY,
  ODDS_MARKETS = "h2h,spreads,totals",
  SEASON = new Date().getFullYear(),
  WEEK = ""
} = process.env;
if (!SCHEDULE_API_ROOT) throw new Error("Missing SCHEDULE_API_ROOT");
if (!ODDS_API_KEY) throw new Error("Missing ODDS_API_KEY");
const ODDS_URL =
  `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds` +
  `?regions=us&markets=${encodeURIComponent(ODDS_MARKETS)}` +
  `&oddsFormat=american&dateFormat=iso&apiKey=${encodeURIComponent(ODDS_API_KEY)}`;
let targetWeek = WEEK ? Number(WEEK) : null;
const schedMeta = await fetchJson(`${SCHEDULE_API_ROOT}`);
const seasonNum = Number(SEASON);
if (!targetWeek) targetWeek = 1;
const weekResp = await fetchJson(`${SCHEDULE_API_ROOT}?season=${seasonNum}&week=${targetWeek}`);
const games = weekResp.games || weekResp.schedule || weekResp.items || [];
const predictions = [];
for (const g of games) {
  predictions.push({
    game_id: g.id || g.game_id || `${seasonNum}-${targetWeek}-${g.away}@${g.home}`,
    season: seasonNum,
    week: targetWeek,
    home: g.home,
    away: g.away,
    picks: { moneyline: null, spread: null, total: null }
  });
}
const base = path.join("netlify","functions","nfl-predictions-get","_data");
await ensureDir(base);
await ensureDir(path.join(base, String(seasonNum)));
const outWeek = path.join(base, String(seasonNum), `week${targetWeek}.json`);
const outCurr = path.join(base, "current.json");
const payload = {
  ok: true,
  season: seasonNum,
  week: targetWeek,
  updatedAt: new Date().toISOString(),
  predictions,
  parlays: { three_leg: [], five_leg: [] }
};
await fs.writeFile(outWeek, JSON.stringify(payload, null, 2));
await fs.writeFile(outCurr, JSON.stringify(payload, null, 2));
console.log("WROTE:", { outWeek, outCurr, games: predictions.length });
