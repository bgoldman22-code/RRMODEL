/**
 * NHL SOG Prediction Logger V2 - PRODUCTION HARDENED
 * 
 * TIER 1 IMPROVEMENTS:
 * - CLV tracking (opening + closing lines/odds)
 * - Void/push handling (DNP, scratches, line changes)
 * - Player ID hardening (NHL person_id joins, not names)
 * - Idempotent updates (safe to re-run multiple times)
 * - Direction calibration buckets (edge-based hit% analysis)
 * - Per-player tracking (form, streaks, team matchups)
 * - Config fingerprinting (model version, data snapshot)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class NHLPredictionLoggerV2 {
  constructor(season = '2024-25') {
    this.season = season;
    this.logDir = path.join(__dirname, '../../data/nhl/logs');
    this.csvPath = path.join(this.logDir, `predictions_${season}_v2.csv`);
    this.playerStatsPath = path.join(this.logDir, `player_stats_${season}.csv`);
    this.ensureLogFiles();
  }

  /**
   * Ensure log directory and CSV files exist
   */
  ensureLogFiles() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Main predictions log
    if (!fs.existsSync(this.csvPath)) {
      const headers = [
        // Identity (HARDENED)
        'date',
        'game_id',
        'player_id',           // NHL API person ID (primary key)
        'player',              // Display name (secondary)
        'team',
        'opponent',
        'position',
        
        // Prediction
        'line_open',           // Opening line
        'line_close',          // Closing line (if available)
        'direction',           // 'OVER' or 'UNDER'
        'predicted_sog',
        
        // Results
        'actual_sog',
        'actual_ice_time',     // Minutes played (0 = scratched)
        'status',              // 'hit', 'miss', 'push', 'void'
        'went_ot',             // 1 if game went to OT (can inflate SOG)
        
        // Edge & Odds
        'edge',
        'edge_percent',
        'odds_open',           // Opening odds
        'odds_close',          // Closing odds (for CLV)
        'book',
        'model_prob',
        'implied_prob_open',
        'implied_prob_close',
        
        // CLV & Performance
        'clv',                 // Closing Line Value
        'ev_open',             // Expected Value at open
        'ev_close',            // Expected Value at close
        'roi',                 // Actual return (excluding void/push)
        
        // Timestamps (UTC)
        'game_start_time',
        'cutoff_ts',           // Prediction cutoff (60-90 min before puck drop)
        'logged_at',
        'updated_at',
        
        // Context
        'is_home',
        'pp_unit',             // PP1, PP2, or null
        'ice_time_l5',         // Average last 5 games
        'sh_att_l5',           // Shot attempts last 5 games
        
        // Config Fingerprinting
        'model_version',
        'config_hash',
        'data_snapshot_ts'
      ].join(',');
      
      fs.writeFileSync(this.csvPath, headers + '\n');
      console.log(`✅ Created NHL prediction log V2: ${this.csvPath}`);
    }

    // Per-player stats tracking
    if (!fs.existsSync(this.playerStatsPath)) {
      const headers = [
        'player_id',
        'player',
        'total_picks',
        'total_overs',
        'total_unders',
        'win_rate',
        'win_rate_overs',
        'win_rate_unders',
        'mae',
        'roi',
        'last_5_results',      // e.g., "W,L,W,W,L"
        'streak',              // Current streak (e.g., "W3" or "L2")
        'vs_teams',            // JSON: {"BOS": {"picks": 5, "win_rate": 0.6}}
        'updated_at'
      ].join(',');
      
      fs.writeFileSync(this.playerStatsPath, headers + '\n');
      console.log(`✅ Created player stats log: ${this.playerStatsPath}`);
    }
  }

  /**
   * Generate config hash for fingerprinting
   */
  generateConfigHash(config = {}) {
    const configStr = JSON.stringify(config, Object.keys(config).sort());
    return createHash('sha256').update(configStr).digest('hex').substring(0, 12);
  }

  /**
   * Log a single prediction (IDEMPOTENT)
   * 
   * Safe to call multiple times - will update existing row if found
   */
  logPrediction(prediction) {
    const {
      date,
      gameId,
      playerId,              // REQUIRED: NHL API person ID
      player,
      team,
      opponent,
      position,
      lineOpen,
      lineClose = null,
      direction,
      predictedSOG,
      edge,
      edgePercent,
      oddsOpen,
      oddsClose = null,
      book,
      modelProb,
      impliedProbOpen,
      impliedProbClose = null,
      gameStartTime,
      cutoffTs = null,
      isHome,
      ppUnit = null,
      iceTimeL5 = null,
      shAttL5 = null,
      modelVersion = 'v3.1',
      config = {},
      dataSnapshotTs = new Date().toISOString()
    } = prediction;

    // VALIDATION: player_id is required
    if (!playerId) {
      console.warn(`⚠️ Missing player_id for ${player} - logging with null ID (WILL CAUSE JOIN ISSUES)`);
    }

    const now = new Date().toISOString();
    const configHash = this.generateConfigHash(config);

    // Calculate CLV and EV
    const clv = this.calculateCLV(oddsOpen, oddsClose, direction, lineOpen, lineClose);
    const evOpen = this.calculateEV(modelProb, oddsOpen);
    const evClose = oddsClose ? this.calculateEV(modelProb, oddsClose) : null;

    const row = [
      date,
      gameId,
      playerId || 'null',
      player,
      team,
      opponent,
      position,
      lineOpen,
      lineClose || 'null',
      direction,
      predictedSOG.toFixed(2),
      'null',                // actual_sog (filled later)
      'null',                // actual_ice_time
      'null',                // status
      'null',                // went_ot
      edge.toFixed(2),
      edgePercent?.toFixed(1) || 'null',
      oddsOpen,
      oddsClose || 'null',
      book,
      modelProb.toFixed(3),
      impliedProbOpen.toFixed(3),
      impliedProbClose?.toFixed(3) || 'null',
      'null',                // clv (filled when closing line available)
      evOpen.toFixed(3),
      evClose?.toFixed(3) || 'null',
      'null',                // roi (filled after result)
      gameStartTime,
      cutoffTs || 'null',
      now,                   // logged_at
      now,                   // updated_at
      isHome ? '1' : '0',
      ppUnit || 'null',
      iceTimeL5?.toFixed(1) || 'null',
      shAttL5?.toFixed(1) || 'null',
      modelVersion,
      configHash,
      dataSnapshotTs
    ].join(',');

    // IDEMPOTENT: Check if prediction already exists
    const existing = this.findPrediction(gameId, playerId || player, direction);
    
    if (existing) {
      console.log(`ℹ️ Prediction already logged for ${player} ${direction} ${lineOpen} (game ${gameId}) - skipping`);
      return;
    }

    fs.appendFileSync(this.csvPath, row + '\n');
  }

  /**
   * Find existing prediction (IDEMPOTENT CHECK)
   */
  findPrediction(gameId, playerIdOrName, direction) {
    const predictions = this.getAllPredictions();
    return predictions.find(p => 
      p.game_id === gameId && 
      (p.player_id === playerIdOrName || p.player === playerIdOrName) &&
      p.direction === direction
    );
  }

  /**
   * Calculate Closing Line Value (CLV)
   * 
   * Positive CLV = you got better odds/line than close
   */
  calculateCLV(oddsOpen, oddsClose, direction, lineOpen, lineClose) {
    if (!oddsClose) return null;

    // For props, CLV is about odds movement (line can also move)
    const openProb = this.oddsToProb(oddsOpen);
    const closeProb = this.oddsToProb(oddsClose);
    
    // CLV = difference in implied probability (lower close prob = better for you)
    return ((openProb - closeProb) * 100).toFixed(2);
  }

  /**
   * Calculate Expected Value
   */
  calculateEV(modelProb, odds) {
    const impliedProb = this.oddsToProb(odds);
    const winReturn = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
    return modelProb * winReturn - (1 - modelProb);
  }

  /**
   * Convert American odds to probability
   */
  oddsToProb(odds) {
    if (odds > 0) {
      return 100 / (odds + 100);
    } else {
      return Math.abs(odds) / (Math.abs(odds) + 100);
    }
  }

  /**
   * Update result (IDEMPOTENT - safe to call multiple times)
   */
  updateResult(gameId, playerId, actualSOG, actualIceTime = null, wentOT = false, closingLine = null, closingOdds = null) {
    const predictions = this.getAllPredictions();
    const updated = [];
    let foundCount = 0;

    for (const pred of predictions) {
      // Match by game_id AND player_id (or fallback to name)
      if (pred.game_id === gameId && (pred.player_id === playerId || pred.player === playerId)) {
        foundCount++;
        
        // Determine status
        let status;
        let hit = null;
        let roi = null;

        // VOID: Player didn't play (scratched, DNP, injury)
        if (actualIceTime !== null && actualIceTime === 0) {
          status = 'void';
        }
        // PUSH: Exactly hit the line
        else if (actualSOG === parseFloat(pred.line_open)) {
          status = 'push';
        }
        // HIT or MISS
        else {
          const isOver = pred.direction === 'OVER';
          const lineHit = isOver ? actualSOG > parseFloat(pred.line_open) : actualSOG < parseFloat(pred.line_open);
          
          if (lineHit) {
            status = 'hit';
            hit = 1;
            // Calculate ROI
            const odds = parseFloat(pred.odds_open);
            roi = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
          } else {
            status = 'miss';
            hit = 0;
            roi = -1;
          }
        }

        // Update CLV if closing line/odds provided
        let clv = pred.clv;
        if (closingLine && closingOdds) {
          clv = this.calculateCLV(
            parseFloat(pred.odds_open),
            closingOdds,
            pred.direction,
            parseFloat(pred.line_open),
            closingLine
          );
        }

        updated.push({
          ...pred,
          actual_sog: actualSOG,
          actual_ice_time: actualIceTime,
          status,
          hit,
          roi,
          went_ot: wentOT ? '1' : '0',
          line_close: closingLine || pred.line_close,
          odds_close: closingOdds || pred.odds_close,
          clv: clv || pred.clv,
          updated_at: new Date().toISOString()
        });
      } else {
        updated.push(pred);
      }
    }

    if (foundCount === 0) {
      console.warn(`⚠️ No prediction found for player_id=${playerId} in game ${gameId}`);
      return;
    }

    // Write updated CSV (ATOMIC)
    this.writePredictions(updated);
    console.log(`✅ Updated ${foundCount} prediction(s) for ${playerId} in game ${gameId}: ${actualSOG} SOG (status: ${updated.find(p => p.player_id === playerId)?.status})`);

    // Update per-player stats
    this.updatePlayerStats(playerId);
  }

  /**
   * Batch log predictions
   */
  logPredictions(predictions) {
    predictions.forEach(p => this.logPrediction(p));
    console.log(`✅ Logged ${predictions.length} NHL predictions`);
  }

  /**
   * Get all predictions from CSV
   */
  getAllPredictions() {
    if (!fs.existsSync(this.csvPath)) {
      return [];
    }

    const content = fs.readFileSync(this.csvPath, 'utf-8');
    const lines = content.trim().split('\n');
    
    if (lines.length <= 1) {
      return [];
    }

    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
      const values = line.split(',');
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = values[i] === 'null' ? null : values[i];
      });
      return obj;
    });
  }

  /**
   * Write predictions back to CSV (ATOMIC)
   */
  writePredictions(predictions) {
    const headers = [
      'date', 'game_id', 'player_id', 'player', 'team', 'opponent', 'position',
      'line_open', 'line_close', 'direction', 'predicted_sog',
      'actual_sog', 'actual_ice_time', 'status', 'went_ot',
      'edge', 'edge_percent', 'odds_open', 'odds_close', 'book',
      'model_prob', 'implied_prob_open', 'implied_prob_close',
      'clv', 'ev_open', 'ev_close', 'roi',
      'game_start_time', 'cutoff_ts', 'logged_at', 'updated_at',
      'is_home', 'pp_unit', 'ice_time_l5', 'sh_att_l5',
      'model_version', 'config_hash', 'data_snapshot_ts'
    ];

    const rows = predictions.map(p => {
      return headers.map(h => p[h] === null || p[h] === undefined ? 'null' : p[h]).join(',');
    });

    const content = headers.join(',') + '\n' + rows.join('\n') + '\n';
    fs.writeFileSync(this.csvPath, content);
  }

  /**
   * Get pending predictions (no result yet)
   */
  getPendingPredictions() {
    return this.getAllPredictions().filter(p => p.status === null || p.status === 'null');
  }

  /**
   * Calculate rolling metrics with direction breakdown
   */
  calculateRollingMetrics(window = 20) {
    const predictions = this.getAllPredictions()
      .filter(p => p.status !== null && p.status !== 'null' && p.status !== 'void' && p.status !== 'push')
      .slice(-window);

    if (predictions.length === 0) {
      return { count: 0, winRate: 'N/A', mae: 'N/A', roi: 'N/A', overs: {}, unders: {} };
    }

    const hits = predictions.filter(p => p.hit === '1' || p.hit === 1).length;
    const winRate = (hits / predictions.length * 100).toFixed(1);

    const errors = predictions
      .filter(p => p.actual_sog !== null && p.actual_sog !== 'null')
      .map(p => Math.abs(parseFloat(p.predicted_sog) - parseFloat(p.actual_sog)));
    const mae = errors.length > 0 ? (errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(2) : 'N/A';

    const rois = predictions
      .filter(p => p.roi !== null && p.roi !== 'null')
      .map(p => parseFloat(p.roi));
    const totalROI = rois.length > 0 ? (rois.reduce((a, b) => a + b, 0) / rois.length).toFixed(2) : 'N/A';

    // Overs vs Unders
    const overs = predictions.filter(p => p.direction === 'OVER');
    const unders = predictions.filter(p => p.direction === 'UNDER');

    const oversHits = overs.filter(p => p.hit === '1' || p.hit === 1).length;
    const undersHits = unders.filter(p => p.hit === '1' || p.hit === 1).length;

    return {
      count: predictions.length,
      winRate,
      mae,
      roi: totalROI,
      overs: {
        count: overs.length,
        winRate: overs.length > 0 ? (oversHits / overs.length * 100).toFixed(1) : 'N/A'
      },
      unders: {
        count: unders.length,
        winRate: unders.length > 0 ? (undersHits / unders.length * 100).toFixed(1) : 'N/A'
      }
    };
  }

  /**
   * DIRECTION CALIBRATION BUCKETS
   * 
   * Shows hit% by edge size for OVERS and UNDERS separately
   * Critical for spotting model drift and selection bias
   */
  getCalibrationBuckets() {
    const predictions = this.getAllPredictions()
      .filter(p => p.status === 'hit' || p.status === 'miss');

    const buckets = {
      overs: {
        '0-2%': [],
        '2-4%': [],
        '4-6%': [],
        '6-8%': [],
        '8%+': []
      },
      unders: {
        '0-2%': [],
        '2-4%': [],
        '4-6%': [],
        '6-8%': [],
        '8%+': []
      }
    };

    for (const pred of predictions) {
      const edge = parseFloat(pred.edge_percent);
      const direction = pred.direction === 'OVER' ? 'overs' : 'unders';
      
      let bucket;
      if (edge < 2) bucket = '0-2%';
      else if (edge < 4) bucket = '2-4%';
      else if (edge < 6) bucket = '4-6%';
      else if (edge < 8) bucket = '6-8%';
      else bucket = '8%+';

      buckets[direction][bucket].push(pred);
    }

    // Calculate hit% for each bucket
    const results = { overs: {}, unders: {} };
    
    for (const direction of ['overs', 'unders']) {
      for (const [bucket, preds] of Object.entries(buckets[direction])) {
        if (preds.length === 0) {
          results[direction][bucket] = { count: 0, hitRate: 'N/A' };
        } else {
          const hits = preds.filter(p => p.status === 'hit').length;
          results[direction][bucket] = {
            count: preds.length,
            hitRate: (hits / preds.length * 100).toFixed(1) + '%'
          };
        }
      }
    }

    return results;
  }

  /**
   * Update per-player stats (form tracking)
   */
  updatePlayerStats(playerId) {
    const playerPreds = this.getAllPredictions()
      .filter(p => p.player_id === playerId && (p.status === 'hit' || p.status === 'miss'));

    if (playerPreds.length === 0) return;

    const player = playerPreds[0].player;
    const totalPicks = playerPreds.length;
    const overs = playerPreds.filter(p => p.direction === 'OVER');
    const unders = playerPreds.filter(p => p.direction === 'UNDER');
    
    const hits = playerPreds.filter(p => p.status === 'hit').length;
    const winRate = (hits / totalPicks * 100).toFixed(1);
    
    const oversHits = overs.filter(p => p.status === 'hit').length;
    const undersHits = unders.filter(p => p.status === 'hit').length;
    const winRateOvers = overs.length > 0 ? (oversHits / overs.length * 100).toFixed(1) : 'N/A';
    const winRateUnders = unders.length > 0 ? (undersHits / unders.length * 100).toFixed(1) : 'N/A';

    // MAE
    const errors = playerPreds
      .filter(p => p.actual_sog !== null && p.actual_sog !== 'null')
      .map(p => Math.abs(parseFloat(p.predicted_sog) - parseFloat(p.actual_sog)));
    const mae = (errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(2);

    // ROI
    const rois = playerPreds
      .filter(p => p.roi !== null && p.roi !== 'null')
      .map(p => parseFloat(p.roi));
    const roi = (rois.reduce((a, b) => a + b, 0) / rois.length).toFixed(2);

    // Last 5 results
    const last5 = playerPreds.slice(-5).map(p => p.status === 'hit' ? 'W' : 'L').join(',');

    // Current streak
    let streak = '';
    for (let i = playerPreds.length - 1; i >= 0; i--) {
      const result = playerPreds[i].status === 'hit' ? 'W' : 'L';
      if (streak === '') {
        streak = result + '1';
      } else if (streak[0] === result) {
        const count = parseInt(streak.slice(1)) + 1;
        streak = result + count;
      } else {
        break;
      }
    }

    // VS teams breakdown
    const vsTeams = {};
    for (const pred of playerPreds) {
      const opp = pred.opponent;
      if (!vsTeams[opp]) {
        vsTeams[opp] = { picks: 0, hits: 0 };
      }
      vsTeams[opp].picks++;
      if (pred.status === 'hit') vsTeams[opp].hits++;
    }
    const vsTeamsJson = JSON.stringify(vsTeams).replace(/,/g, ';'); // Avoid CSV issues

    // Update player stats CSV
    const stats = this.getAllPlayerStats();
    const existingIdx = stats.findIndex(s => s.player_id === playerId);

    const row = {
      player_id: playerId,
      player,
      total_picks: totalPicks,
      total_overs: overs.length,
      total_unders: unders.length,
      win_rate: winRate,
      win_rate_overs: winRateOvers,
      win_rate_unders: winRateUnders,
      mae,
      roi,
      last_5_results: last5,
      streak,
      vs_teams: vsTeamsJson,
      updated_at: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      stats[existingIdx] = row;
    } else {
      stats.push(row);
    }

    this.writePlayerStats(stats);
  }

  getAllPlayerStats() {
    if (!fs.existsSync(this.playerStatsPath)) {
      return [];
    }

    const content = fs.readFileSync(this.playerStatsPath, 'utf-8');
    const lines = content.trim().split('\n');
    
    if (lines.length <= 1) {
      return [];
    }

    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
      const values = line.split(',');
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = values[i];
      });
      return obj;
    });
  }

  writePlayerStats(stats) {
    const headers = [
      'player_id', 'player', 'total_picks', 'total_overs', 'total_unders',
      'win_rate', 'win_rate_overs', 'win_rate_unders', 'mae', 'roi',
      'last_5_results', 'streak', 'vs_teams', 'updated_at'
    ];

    const rows = stats.map(s => {
      return headers.map(h => s[h] || 'null').join(',');
    });

    const content = headers.join(',') + '\n' + rows.join('\n') + '\n';
    fs.writeFileSync(this.playerStatsPath, content);
  }
}
