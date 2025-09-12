exports.config = { includedFiles: ["netlify/functions/_data/**"] };

const { set } = require('../_blobs');
const BUNDLE_VERSION = 'predictions-2025-09-12-v11';
const ARTIFACT_KEY  = 'nfl/predictions/artifacts/latest.json';

async function fetchJSON(url, init={}) {
  const res = await fetch(url, { ...init, headers: { 'accept': 'application/json', ...(init.headers||{}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.json();
}

const SCHEDULE_URL = process.env.NFL_SCHEDULE_URL || "https://bgroundrobin.com/.netlify/functions/nfl-schedule-get";
const ODDS_URL     = process.env.NFL_ODDS_BRIDGE_URL || "https://bgroundrobin.com/.netlify/functions/odds-get?league=nfl";

async function maybePullNFLVerse() {
  const url = process.env.NFLVERSE_PBP_URL;
  if (!url) return null;
  try { return await fetchJSON(url); } catch { return null; }
}
async function maybePullESPNRosters() {
  const url = process.env.ESPN_ROSTERS_URL;
  if (!url) return null;
  try { return await fetchJSON(url); } catch { return null; }
}
async function maybeWeather() {
  const url = process.env.WEATHER_BRIDGE_URL;
  if (!url) return null;
  try { return await fetchJSON(url); } catch { return null; }
}

function makeGameLogsFromNFLVerse(pbp) {
  return pbp?.teamGameLogs || null;
}

exports.handler = async (event) => {
  const open = String(event.queryStringParameters?.open||'') === '1';

  try {
    const schedule = await fetchJSON(SCHEDULE_URL);
    const odds     = await (async ()=>{ try { return await fetchJSON(ODDS_URL); } catch { return null; }})();
    const nflverse = await maybePullNFLVerse();
    const espn     = await maybePullESPNRosters();
    const weather  = await maybeWeather();

    const artifact = {
      ok: true,
      updated: new Date().toISOString(),
      sample: { schedule: !!schedule, odds: !!odds, nflverse: !!nflverse, espn: !!espn, weather: !!weather },
      schedule,
      odds,
      nflverse_logs: makeGameLogsFromNFLVerse(nflverse),
      espn_rosters: espn?.rosters || null,
      injuries: espn?.injuries || null,
      weather_by_event: weather?.byEvent || null,
      notes: [
        "Season+recency weighting applied in scorer",
        "Turnover-adjusted EPA and game-state splits expected in nflverse_logs when available",
        "Roster deltas read from espn_rosters -> effective depth chart penalty in scorer"
      ]
    };

    const ok = await set(ARTIFACT_KEY, artifact);
    if (!ok) {
      return { statusCode: 200, headers:{'content-type':'application/json'},
        body: JSON.stringify({ ok:false, error:'Failed to write artifact', BUNDLE_VERSION }) };
    }

    return { statusCode: 200, headers:{'content-type':'application/json'},
      body: JSON.stringify({ ok:true, wrote: ARTIFACT_KEY, BUNDLE_VERSION, open }) };
  } catch (err) {
    return { statusCode: 200, headers:{'content-type':'application/json'},
      body: JSON.stringify({ ok:false, error:String(err), where:'train', BUNDLE_VERSION }) };
  }
};
