/**
 * Shadow Eval – Frozen Predictor
 * 
 * Replays the production prediction logic using frozen model artifacts.
 * Imports ONLY pure library modules (models, features, adjustments).
 * Does NOT import the Netlify handler or any side-effectful modules.
 * 
 * SAFETY: This file is never imported by production code.
 *         It dynamically loads model artifacts from the snapshot folder.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

// ── ESPN abbreviation normalization (mirror of production) ──────────────────
const ESPN_TO_NBA_ABBR = {
  'GS': 'GSW', 'SA': 'SAS', 'NO': 'NOP', 'NY': 'NYK',
  'PHO': 'PHX', 'UTAH': 'UTA', 'WSH': 'WAS',
};
function normalizeAbbr(abbr) { return ESPN_TO_NBA_ABBR[abbr] || abbr; }

// ── In-memory team data (mirrors production loaders.mjs) ────────────────────
const NBA_TEAMS = [
  { id: 1610612737, abbreviation: 'ATL', name: 'Atlanta Hawks' },
  { id: 1610612738, abbreviation: 'BOS', name: 'Boston Celtics' },
  { id: 1610612751, abbreviation: 'BKN', name: 'Brooklyn Nets' },
  { id: 1610612766, abbreviation: 'CHA', name: 'Charlotte Hornets' },
  { id: 1610612741, abbreviation: 'CHI', name: 'Chicago Bulls' },
  { id: 1610612739, abbreviation: 'CLE', name: 'Cleveland Cavaliers' },
  { id: 1610612742, abbreviation: 'DAL', name: 'Dallas Mavericks' },
  { id: 1610612743, abbreviation: 'DEN', name: 'Denver Nuggets' },
  { id: 1610612765, abbreviation: 'DET', name: 'Detroit Pistons' },
  { id: 1610612744, abbreviation: 'GSW', name: 'Golden State Warriors' },
  { id: 1610612745, abbreviation: 'HOU', name: 'Houston Rockets' },
  { id: 1610612754, abbreviation: 'IND', name: 'Indiana Pacers' },
  { id: 1610612746, abbreviation: 'LAC', name: 'LA Clippers' },
  { id: 1610612747, abbreviation: 'LAL', name: 'Los Angeles Lakers' },
  { id: 1610612763, abbreviation: 'MEM', name: 'Memphis Grizzlies' },
  { id: 1610612748, abbreviation: 'MIA', name: 'Miami Heat' },
  { id: 1610612749, abbreviation: 'MIL', name: 'Milwaukee Bucks' },
  { id: 1610612750, abbreviation: 'MIN', name: 'Minnesota Timberwolves' },
  { id: 1610612740, abbreviation: 'NOP', name: 'New Orleans Pelicans' },
  { id: 1610612752, abbreviation: 'NYK', name: 'New York Knicks' },
  { id: 1610612760, abbreviation: 'OKC', name: 'Oklahoma City Thunder' },
  { id: 1610612753, abbreviation: 'ORL', name: 'Orlando Magic' },
  { id: 1610612755, abbreviation: 'PHI', name: 'Philadelphia 76ers' },
  { id: 1610612756, abbreviation: 'PHX', name: 'Phoenix Suns' },
  { id: 1610612757, abbreviation: 'POR', name: 'Portland Trail Blazers' },
  { id: 1610612758, abbreviation: 'SAC', name: 'Sacramento Kings' },
  { id: 1610612759, abbreviation: 'SAS', name: 'San Antonio Spurs' },
  { id: 1610612761, abbreviation: 'TOR', name: 'Toronto Raptors' },
  { id: 1610612762, abbreviation: 'UTA', name: 'Utah Jazz' },
  { id: 1610612764, abbreviation: 'WAS', name: 'Washington Wizards' },
];

const TEAM_BY_ABBR = {};
for (const t of NBA_TEAMS) TEAM_BY_ABBR[t.abbreviation] = t;

// NBA stats headers
const NBA_STATS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

// ── Default stats fallback ──────────────────────────────────────────────────
function getDefaultStats() {
  return {
    pace: 100, offRtg: 114.5, defRtg: 114.5, netRtg: 0,
    efg: 0.535, ts: 0.575, tovPct: 0.138, orbPct: 0.25,
    ftFga: 0.22, winPct: 0.50, games: 0, wins: 0, losses: 0,
    fgPct: 0.47, fg3Pct: 0.36, ftPct: 0.78,
    rebounds: 43, assists: 25, turnovers: 13.5,
  };
}

// ── Feature builders (exact copy from production V2) ────────────────────────

function buildEliteFeatures(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20) {
  const calcPPG = (stats) => stats.offRtg;
  return {
    h3_netRtg: homeL3.netRtg, h3_ppg: calcPPG(homeL3), h3_pace: homeL3.pace,
    h3_winPct: homeL3.winPct, h3_efg: homeL3.efg * 100,
    a3_netRtg: awayL3.netRtg, a3_ppg: calcPPG(awayL3), a3_pace: awayL3.pace,
    a3_winPct: awayL3.winPct, a3_efg: awayL3.efg * 100,
    h10_netRtg: homeL10.netRtg, h10_ppg: calcPPG(homeL10), h10_pace: homeL10.pace,
    h10_winPct: homeL10.winPct, h10_ts: homeL10.ts * 100,
    a10_netRtg: awayL10.netRtg, a10_ppg: calcPPG(awayL10), a10_pace: awayL10.pace,
    a10_winPct: awayL10.winPct, a10_ts: awayL10.ts * 100,
    h20_netRtg: homeL20.netRtg, h20_offRtg: homeL20.offRtg, h20_defRtg: homeL20.defRtg,
    h20_ppg: calcPPG(homeL20), h20_pace: homeL20.pace,
    a20_netRtg: awayL20.netRtg, a20_offRtg: awayL20.offRtg, a20_defRtg: awayL20.defRtg,
    a20_ppg: calcPPG(awayL20), a20_pace: awayL20.pace,
    netRtg_diff: homeL10.netRtg - awayL10.netRtg,
    netRtg_product: homeL10.netRtg * awayL10.netRtg,
    offense_vs_defense: homeL10.offRtg * awayL10.defRtg / 10000,
    defensive_matchup: awayL10.offRtg * homeL10.defRtg / 10000,
    pace_avg: (homeL10.pace + awayL10.pace) / 2,
    pace_diff: homeL10.pace - awayL10.pace,
    pace_product: homeL10.pace * awayL10.pace / 10000,
    h_momentum: homeL10.netRtg * homeL10.winPct,
    a_momentum: awayL10.netRtg * awayL10.winPct,
    h_streak: homeL10.winPct > 0.6 ? 1 : (homeL10.winPct < 0.4 ? -1 : 0),
    a_streak: awayL10.winPct > 0.6 ? 1 : (awayL10.winPct < 0.4 ? -1 : 0),
    momentum_diff: (homeL10.netRtg * homeL10.winPct) - (awayL10.netRtg * awayL10.winPct),
    ppg_sum: homeL10.offRtg + awayL10.offRtg,
    ppg_diff: homeL10.offRtg - awayL10.offRtg,
    expected_total: (homeL10.offRtg + awayL10.offRtg) * (homeL10.pace + awayL10.pace) / 200,
    shooting_advantage: (homeL10.efg - awayL10.efg) * 100,
    h_efficiency: homeL10.offRtg / homeL10.pace,
    a_efficiency: awayL10.offRtg / awayL10.pace,
    offRtg_diff: homeL10.offRtg - awayL10.offRtg,
    defRtg_diff: homeL10.defRtg - awayL10.defRtg,
    winPct_diff: homeL10.winPct - awayL10.winPct,
    quality_matchup: (homeL10.netRtg + awayL10.netRtg) / 2,
    upset_factor: Math.abs(homeL10.winPct - awayL10.winPct) * (homeL10.winPct < awayL10.winPct ? 1 : -1),
    rating_pace_interaction: (homeL10.netRtg - awayL10.netRtg) * (homeL10.pace - awayL10.pace),
    form_rating_interaction: homeL10.winPct * homeL10.netRtg - awayL10.winPct * awayL10.netRtg,
    consistency: Math.abs(homeL10.netRtg / (homeL10.games + 1)) + Math.abs(awayL10.netRtg / (awayL10.games + 1)),
    home_advantage: 1,
  };
}

function buildSimpleFeatures(homeStats, awayStats) {
  return {
    home_l10_fgPct: homeStats.fgPct || homeStats.efg || 0.47,
    home_l10_fg3Pct: homeStats.fg3Pct || (homeStats.ts - homeStats.efg) || 0.36,
    home_l10_ftPct: homeStats.ftPct || 0.77,
    home_l10_rebounds: homeStats.rebounds || 43,
    home_l10_assists: homeStats.assists || 25,
    home_l10_turnovers: homeStats.turnovers || (homeStats.tovPct * 100) || 13.5,
    away_l10_fgPct: awayStats.fgPct || awayStats.efg || 0.47,
    away_l10_fg3Pct: awayStats.fg3Pct || (awayStats.ts - awayStats.efg) || 0.36,
    away_l10_ftPct: awayStats.ftPct || 0.77,
    away_l10_rebounds: awayStats.rebounds || 43,
    away_l10_assists: awayStats.assists || 25,
    away_l10_turnovers: awayStats.turnovers || (awayStats.tovPct * 100) || 13.5,
    fgPct_diff: (homeStats.fgPct || homeStats.efg || 0.47) - (awayStats.fgPct || awayStats.efg || 0.47),
    fg3Pct_diff: (homeStats.fg3Pct || 0.36) - (awayStats.fg3Pct || 0.36),
    rebounds_diff: (homeStats.rebounds || 43) - (awayStats.rebounds || 43),
    assists_diff: (homeStats.assists || 25) - (awayStats.assists || 25),
    turnovers_diff: (awayStats.turnovers || awayStats.tovPct * 100 || 13.5) - (homeStats.turnovers || homeStats.tovPct * 100 || 13.5),
    home_court: 1,
  };
}

// ── Linear model predict (exact copy from production) ───────────────────────

function predict(model, features) {
  const { weights, bias, means, stds } = model;
  let pred = bias;
  let missing = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (!(key in features)) { missing++; continue; }
    const value = features[key];
    if (!Number.isFinite(value)) { missing++; continue; }
    const mean = means[key] ?? 0;
    const std = stds[key] ?? 1;
    const normalized = std > 0 ? (value - mean) / std : 0;
    pred += weight * normalized;
  }
  if (missing > 8) {
    throw new Error(`Feature vector low information (missing=${missing})`);
  }
  return pred;
}

// ── Team stats fetcher (uses production loaders as pure lib) ────────────────

let _loaders = null;
async function getLoaders() {
  if (!_loaders) {
    // Import the pure loaders module (no side effects)
    const loadersPath = path.join(REPO_ROOT, 'netlify/functions/_lib/nba/loaders.mjs');
    _loaders = await import(loadersPath);
  }
  return _loaders;
}

/**
 * Fetch rolling stats for a team.
 * Uses production loaders (pure functions, no side effects).
 */
async function fetchTeamStats(teamAbbr) {
  const teamData = TEAM_BY_ABBR[teamAbbr];
  if (!teamData) return { l5: getDefaultStats(), l10: getDefaultStats(), l20: getDefaultStats() };

  try {
    const loaders = await getLoaders();
    const stats = await loaders.fetchTeamRollingStats(teamData.id, '2025-26');
    return {
      l5: stats?.l5 || getDefaultStats(),
      l10: stats?.l10 || getDefaultStats(),
      l20: stats?.l20 || getDefaultStats(),
    };
  } catch (err) {
    console.warn(`[ShadowPredictor] Stats fetch failed for ${teamAbbr}: ${err.message}`);
    return { l5: getDefaultStats(), l10: getDefaultStats(), l20: getDefaultStats() };
  }
}

// ── The FrozenPredictor class ───────────────────────────────────────────────

export class FrozenPredictor {
  constructor(modelVersion) {
    this.modelVersion = modelVersion;
    this.spreadModel = null;
    this.totalModel = null;
    this.rciModule = null;
    this.freezeLevel = 'unknown';
  }

  /**
   * Load frozen artifacts from snapshot folder, or fall back to current code.
   */
  async init() {
    const artifactDir = path.join(REPO_ROOT, 'shadow_eval/artifacts', this.modelVersion);

    if (fs.existsSync(path.join(artifactDir, 'models-inline.mjs'))) {
      // Full frozen artifacts available
      const modelsPath = path.join(artifactDir, 'models-inline.mjs');
      const models = await import(modelsPath);
      this.spreadModel = models.SPREAD_MODEL;
      this.totalModel = models.TOTAL_MODEL;

      // Try frozen RCI
      const rciPath = path.join(artifactDir, 'rci-adjustments.mjs');
      if (fs.existsSync(rciPath)) {
        try {
          this.rciModule = await import(rciPath);
          this.freezeLevel = 'full';
        } catch {
          // RCI may have import deps (rci-core) – fall back to current
          const prodRciPath = path.join(REPO_ROOT, 'netlify/functions/_lib/nba/rci-adjustments.mjs');
          this.rciModule = await import(prodRciPath);
          this.freezeLevel = 'weights_and_features';
        }
      } else {
        const prodRciPath = path.join(REPO_ROOT, 'netlify/functions/_lib/nba/rci-adjustments.mjs');
        this.rciModule = await import(prodRciPath);
        this.freezeLevel = 'weights_only';
      }
    } else {
      // No snapshot – use current production artifacts
      console.warn(`⚠️  No snapshot found for "${this.modelVersion}" – using current production artifacts`);
      console.warn(`   Run: SHADOW_EVAL=1 node scripts/nba_shadow_eval/snapshot_artifacts.mjs --version ${this.modelVersion}`);
      const modelsPath = path.join(REPO_ROOT, 'netlify/functions/_lib/nba/models-inline.mjs');
      const models = await import(modelsPath);
      this.spreadModel = models.SPREAD_MODEL;
      this.totalModel = models.TOTAL_MODEL;

      const rciPath = path.join(REPO_ROOT, 'netlify/functions/_lib/nba/rci-adjustments.mjs');
      this.rciModule = await import(rciPath);
      this.freezeLevel = 'weights_only';
      console.warn(`   freeze_level = "weights_only" – using current code with current weights`);
    }

    console.log(`[ShadowPredictor] Initialized: version=${this.modelVersion}, freeze_level=${this.freezeLevel}`);
    console.log(`[ShadowPredictor] Spread model MAE: ${this.spreadModel.performance?.mae?.toFixed(3)}`);
    console.log(`[ShadowPredictor] Total model bias: ${this.totalModel.bias?.toFixed(3)}`);
  }

  /**
   * Returns a bound version of fetchTeamStats for use by the retrain engine.
   * This allows the retrain engine to fetch team stats without importing loaders directly.
   * @returns {Function} async (abbr) => { l5, l10, l20 }
   */
  fetchTeamStatsBound() {
    return (abbr) => fetchTeamStats(abbr);
  }

  /**
   * Generate predictions for a set of games on a specific date.
   * Returns per-game prediction objects.
   * 
   * @param {Array} games - from espn_fetcher.fetchGamesForDate
   * @returns {Promise<Array>} predictions with margins and probabilities
   */
  async predictGames(games) {
    if (!this.spreadModel || !this.totalModel) {
      throw new Error('FrozenPredictor not initialized. Call init() first.');
    }

    // Collect unique teams
    const teamAbbrs = new Set();
    for (const g of games) {
      teamAbbrs.add(g.home);
      teamAbbrs.add(g.away);
    }

    // Fetch stats for all teams in parallel
    const statsCache = {};
    await Promise.all(
      Array.from(teamAbbrs).map(async (abbr) => {
        statsCache[abbr] = await fetchTeamStats(abbr);
      })
    );

    const predictions = [];

    for (const game of games) {
      try {
        const homeStats = statsCache[game.home] || { l5: getDefaultStats(), l10: getDefaultStats(), l20: getDefaultStats() };
        const awayStats = statsCache[game.away] || { l5: getDefaultStats(), l10: getDefaultStats(), l20: getDefaultStats() };

        const homeL5 = homeStats.l5 || getDefaultStats();
        const homeL10 = homeStats.l10 || getDefaultStats();
        const homeL20 = homeStats.l20 || getDefaultStats();
        const awayL5 = awayStats.l5 || getDefaultStats();
        const awayL10 = awayStats.l10 || getDefaultStats();
        const awayL20 = awayStats.l20 || getDefaultStats();

        // Apply RCI adjustments (same as production)
        let adjHomeL5 = homeL5, adjHomeL10 = homeL10, adjHomeL20 = homeL20;
        let adjAwayL5 = awayL5, adjAwayL10 = awayL10, adjAwayL20 = awayL20;

        if (this.rciModule?.applyRCIAdjustment) {
          const homeGP = homeL10.games || 0;
          const awayGP = awayL10.games || 0;
          adjHomeL5 = this.rciModule.applyRCIAdjustment(homeL5, game.home, homeGP);
          adjHomeL10 = this.rciModule.applyRCIAdjustment(homeL10, game.home, homeGP);
          adjHomeL20 = this.rciModule.applyRCIAdjustment(homeL20, game.home, homeGP);
          adjAwayL5 = this.rciModule.applyRCIAdjustment(awayL5, game.away, awayGP);
          adjAwayL10 = this.rciModule.applyRCIAdjustment(awayL10, game.away, awayGP);
          adjAwayL20 = this.rciModule.applyRCIAdjustment(awayL20, game.away, awayGP);
        }

        // Build features
        const spreadFeatures = buildEliteFeatures(adjHomeL5, adjHomeL10, adjHomeL20, adjAwayL5, adjAwayL10, adjAwayL20);
        const totalFeatures = buildSimpleFeatures(adjHomeL10, adjAwayL10);

        // Predict
        const spreadPred = predict(this.spreadModel, spreadFeatures);
        const totalPred = predict(this.totalModel, totalFeatures);

        // Win probability (same sigma=8 as production)
        const SIGMA = 8;
        const winProb = 1 / (1 + Math.exp(-spreadPred / SIGMA));

        predictions.push({
          date: game.date,
          game_id: game.game_id,
          home: game.home,
          away: game.away,
          pred_margin: parseFloat(spreadPred.toFixed(2)),
          pred_total: parseFloat(totalPred.toFixed(2)),
          pred_win_prob_home: parseFloat(winProb.toFixed(4)),
          actual_margin: game.actual_margin,
          actual_home_win: game.actual_home_win,
          actual_total: game.total,
          completed: game.completed,
          home_l10_games: homeL10.games || 0,
          away_l10_games: awayL10.games || 0,
        });
      } catch (err) {
        console.warn(`[ShadowPredictor] Error predicting ${game.away}@${game.home}: ${err.message}`);
        predictions.push({
          date: game.date,
          game_id: game.game_id,
          home: game.home,
          away: game.away,
          pred_margin: null,
          pred_total: null,
          pred_win_prob_home: null,
          actual_margin: game.actual_margin,
          actual_home_win: game.actual_home_win,
          actual_total: game.total,
          completed: game.completed,
          error: err.message,
        });
      }
    }

    return predictions;
  }
}
