import fs from 'fs'
import path from 'path'

// ml_features.mjs
// Builds a time-causal ML dataset from existing processed-features files.
// Assumptions (adapt as needed):
// - processed-features JSON files exist in one of these locations:
//   - ../nfl-model-v3/data/processed-features/features_{season}.json
//   - ../nfl-model-v2/data/processed-features/features_{season}.json
//   - ./data/processed-features/features_{season}.json
// - Each feature row is an object with season, week, home_team, away_team and numeric metrics.
// - Metric naming patterns: for metric X we try X_off / X_def, X_home / X_away, or X_home_value
// The routine is defensive: when a field is missing it falls back to 0.

const POSSIBLE_PATHS = [
  path.resolve(process.cwd(), 'nfl-model-v3/data/processed-features'),
  path.resolve(process.cwd(), 'nfl-model-v2/data/processed-features'),
  path.resolve(process.cwd(), 'data/processed-features'),
]

const GAME_AGG_PATHS = [
  path.resolve(process.cwd(), 'nfl-model-v3/data/nflverse'),
  path.resolve(process.cwd(), 'nfl-model-v2/data/nflverse'),
  path.resolve(process.cwd(), 'data/nflverse'),
]

function findFileForSeason(season) {
  for (const base of POSSIBLE_PATHS) {
    const p = path.join(base, `features_${season}.json`)
    if (fs.existsSync(p)) return p
  }
  return null
}

function findGameAggForSeason(season) {
  for (const base of GAME_AGG_PATHS) {
    const p = path.join(base, `game_aggregates_${season}.json`)
    if (fs.existsSync(p)) return p
  }
  return null
}

function safeGet(obj, keys, def = 0) {
  for (const k of keys) if (k in obj) return Number(obj[k]) || 0
  return def
}

function buildDiff(sample, metric) {
  // try common patterns
  const offKeys = [`${metric}_off`, `${metric}_home`, `${metric}_home_value`, `${metric}_offense`]
  const defKeys = [`${metric}_def`, `${metric}_away`, `${metric}_away_value`, `${metric}_defense`]
  const off = safeGet(sample, offKeys, 0)
  const def = safeGet(sample, defKeys, 0)
  return off - def
}

export function buildMLDataset(seasons = [2020,2021,2022,2023,2024]) {
  const rows = []
  for (const s of seasons) {
    const p = findFileForSeason(s)
    if (!p) {
      console.warn(`ml_features: no features_${s}.json found in known paths; skipping ${s}`)
      continue
    }
    const aggP = findGameAggForSeason(s)
    if (!aggP) {
      console.warn(`ml_features: no game_aggregates_${s}.json found; skipping ${s}`)
      continue
    }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    const aggRaw = JSON.parse(fs.readFileSync(aggP, 'utf8'))
    // build lookup for game_id -> {home_score, away_score}
    const gameMap = {}
    for (const g of aggRaw) {
      if (g.game_id && 'home_score' in g && 'away_score' in g) {
        gameMap[g.game_id] = { home_score: g.home_score, away_score: g.away_score }
      }
    }
    
    for (const r of raw) {
      const gid = r.game_id || r.id
      if (!gid || !gameMap[gid]) {
        // cannot determine label
        continue
      }
      const outcome = gameMap[gid]
      let y = outcome.home_score > outcome.away_score ? 1 : 0

      const feat = {}
      // Use existing diff fields from features JSON (already computed)
      feat.epa_offense_diff = Number(r.epa_offense_diff || 0)
      feat.epa_defense_diff = Number(r.epa_defense_diff || 0)
      feat.third_down_success_diff = Number(r.third_down_diff || 0)
      feat.red_zone_td_rate_diff = Number(r.tds_rz_diff || 0)
      feat.pressure_rate_diff = Number(r.pressure_diff || 0)
      feat.explosive_rate_diff = Number(r.explosive_diff || 0)
      // For qb_epa_rolling_diff: attempt to compute from home/away qb_epa or fall back to 0
      const qb_epa_home = r.home_qb_epa_under_pressure || r.home_epa_offense || 0
      const qb_epa_away = r.away_qb_epa_under_pressure || r.away_epa_offense || 0
      feat.qb_epa_rolling_diff = qb_epa_home - qb_epa_away
      // For qb_cpoe_rolling_diff: no direct field, use 0 or omit (set to 0)
      feat.qb_cpoe_rolling_diff = 0

      feat.home_field = 1 // features_{season}.json rows are always from home team perspective
      // robust meta
      const meta = {
        season: r.season || s,
        week: r.week || null,
        game_id: gid,
        home_team: r.home_team || null,
        away_team: r.away_team || null
      }

      rows.push({ x: feat, y: Number(y), meta })
    }
  }
  return rows
}

export function featureNames() {
  return [
    'epa_offense_diff','epa_defense_diff','third_down_success_diff',
    'red_zone_td_rate_diff','pressure_rate_diff','explosive_rate_diff',
    'qb_epa_rolling_diff','qb_cpoe_rolling_diff','home_field'
  ]
}

// If run directly, dump dataset summary
if (process.argv[1] && process.argv[1].endsWith('ml_features.mjs')) {
  const ds = buildMLDataset()
  console.log(`built ml dataset rows=${ds.length}`)
}
