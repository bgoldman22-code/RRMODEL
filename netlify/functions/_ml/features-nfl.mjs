// netlify/functions/_ml/features-nfl.mjs
// Compose features for a (home, away) game pulling from Netlify Blobs where your other jobs write weekly data.
import { getNFLStore } from "../_blobs.mjs";

async function readJSON(key) {
  const store = getNFLStore();
  try { return await store.get(key, { type: "json" }); } catch (_) { return null; }
}

export async function buildGameFeatures({ season, week, home, away }) {
  // Try a few reasonable keys your pipeline might write. Adjust to your actual keys.
  const teamKey = `weeks/${season}/${week}/team-stats.json`;
  const altTeamKey = `weeks/${season}/${week}/teams.json`;

  const teams = (await readJSON(teamKey)) || (await readJSON(altTeamKey)) || {};
  const homeStats = teams[home] || {};
  const awayStats = teams[away] || {};

  function teamVec(prefix, t) {
    return {
      [`${prefix}_pts_pg`]: t.pts_pg ?? 0,
      [`${prefix}_yds_pg`]: t.yds_pg ?? 0,
      [`${prefix}_yds_play`]: t.yds_play ?? 0,
      [`${prefix}_to_rate`]: t.turnover_rate ?? 0,
      [`${prefix}_rz_td%`]: t.redzone_td_pct ?? 0,
      [`${prefix}_press`]: t.pressures_pg ?? 0,
      [`${prefix}_elo`]: t.elo ?? 1500,
      [`${prefix}_rest`]: t.days_rest ?? 7,
      [`${prefix}_home`]: prefix === "home" ? 1 : 0
    };
  }

  const x = { ...teamVec("home", homeStats), ...teamVec("away", awayStats) };

  // simple matchup deltas
  x.diff_elo = (homeStats.elo ?? 1500) - (awayStats.elo ?? 1500);
  x.diff_yds_play = (homeStats.yds_play ?? 0) - (awayStats.yds_play ?? 0);
  x.diff_to_rate = (homeStats.turnover_rate ?? 0) - (awayStats.turnover_rate ?? 0);
  x.diff_press = (homeStats.pressures_pg ?? 0) - (awayStats.pressures_pg ?? 0);

  return x;
}
