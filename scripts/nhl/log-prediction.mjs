/**
 * NHL SOG Prediction Logger
 * 
 * Logs every prediction (overs AND unders) to CSV for tracking and validation.
 * Captures: player, team, opponent, line, direction, predicted SOG, edge, odds, book, timestamp
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class NHLPredictionLogger {
  constructor(season = '2024-25') {
    this.season = season;
    this.logDir = path.join(__dirname, '../../data/nhl/logs');
    this.csvPath = path.join(this.logDir, `predictions_${season}.csv`);
    this.ensureLogFile();
  }

  /**
   * Ensure log directory and CSV file exist
   */
  ensureLogFile() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    if (!fs.existsSync(this.csvPath)) {
      const headers = [
        'date',
        'game_id',
        'player',
        'team',
        'opponent',
        'position',
        'line',
        'direction',          // 'OVER' or 'UNDER'
        'predicted_sog',
        'actual_sog',
        'hit',                // 1 if correct, 0 if miss, null if pending
        'edge',
        'edge_percent',
        'odds',
        'book',
        'model_prob',
        'implied_prob',
        'roi',                // Calculated after game finishes
        'game_start_time',
        'is_home',
        'pp_unit',
        'ice_time_l5',
        'logged_at'
      ].join(',');
      
      fs.writeFileSync(this.csvPath, headers + '\n');
      console.log(`✅ Created NHL prediction log: ${this.csvPath}`);
    }
  }

  /**
   * Log a single prediction
   */
  logPrediction(prediction) {
    const {
      date,
      gameId,
      player,
      team,
      opponent,
      position,
      line,
      direction,
      predictedSOG,
      edge,
      edgePercent,
      odds,
      book,
      modelProb,
      impliedProb,
      gameStartTime,
      isHome,
      ppUnit,
      iceTimeL5
    } = prediction;

    const row = [
      date || new Date().toISOString().split('T')[0],
      gameId || `${team}_${opponent}_${date}`,
      player,
      team,
      opponent,
      position || '',
      line,
      direction,
      predictedSOG?.toFixed(2) || '',
      '',  // actual_sog (filled later)
      '',  // hit (filled later)
      edge?.toFixed(2) || '',
      edgePercent?.toFixed(1) || '',
      odds || '',
      book || '',
      modelProb?.toFixed(3) || '',
      impliedProb?.toFixed(3) || '',
      '',  // roi (calculated later)
      gameStartTime || '',
      isHome ? 1 : 0,
      ppUnit || '',
      iceTimeL5?.toFixed(1) || '',
      new Date().toISOString()
    ].join(',');

    fs.appendFileSync(this.csvPath, row + '\n');
  }

  /**
   * Log multiple predictions at once
   */
  logPredictions(predictions) {
    for (const pred of predictions) {
      this.logPrediction(pred);
    }
    console.log(`✅ Logged ${predictions.length} NHL predictions`);
  }

  /**
   * Get all predictions
   */
  getAllPredictions() {
    if (!fs.existsSync(this.csvPath)) {
      return [];
    }

    const content = fs.readFileSync(this.csvPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',');
    
    return lines.slice(1).map(line => {
      const values = line.split(',');
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] || null;
      });
      return obj;
    });
  }

  /**
   * Get predictions that need results (actual_sog is empty)
   */
  getPendingPredictions() {
    const all = this.getAllPredictions();
    return all.filter(p => !p.actual_sog || p.actual_sog === '');
  }

  /**
   * Update prediction with actual result
   */
  updateResult(gameId, player, actualSOG) {
    const predictions = this.getAllPredictions();
    let updated = false;

    const updatedPredictions = predictions.map(pred => {
      if (pred.game_id === gameId && pred.player === player && !pred.actual_sog) {
        const predictedSOG = parseFloat(pred.predicted_sog);
        const line = parseFloat(pred.line);
        const direction = pred.direction;
        const odds = parseInt(pred.odds);

        // Determine if hit
        let hit = 0;
        if (direction === 'OVER') {
          hit = actualSOG > line ? 1 : 0;
        } else if (direction === 'UNDER') {
          hit = actualSOG < line ? 1 : 0;
        }

        // Calculate ROI using CLOSING odds (if available) or opening odds
        const closingOdds = parseInt(pred.closing_odds) || odds;
        let roi = 0;
        if (hit === 1) {
          // Win: Calculate payout based on closing odds
          roi = closingOdds > 0 ? (closingOdds / 100) : (100 / Math.abs(closingOdds));
        } else {
          // Loss: Always -1 unit
          roi = -1;
        }

        pred.actual_sog = actualSOG.toString();
        pred.hit = hit.toString();
        pred.roi = roi.toFixed(2);
        
        // Log which odds were used
        if (pred.closing_odds) {
          console.log(`  💰 ROI calculated using closing odds: ${closingOdds}`);
        } else {
          console.log(`  ⚠️ No closing odds - using opening: ${odds}`);
        }
        
        updated = true;
      }
      return pred;
    });

    if (updated) {
      // Rewrite CSV
      const headers = Object.keys(predictions[0]).join(',');
      const rows = updatedPredictions.map(p => Object.values(p).join(','));
      fs.writeFileSync(this.csvPath, headers + '\n' + rows.join('\n') + '\n');
      console.log(`✅ Updated result for ${player} in game ${gameId}: ${actualSOG} SOG`);
    }

    return updated;
  }

  /**
   * Calculate rolling metrics
   */
  calculateRollingMetrics(window = 10) {
    const predictions = this.getAllPredictions()
      .filter(p => p.actual_sog && p.actual_sog !== '')
      .slice(-window);

    if (predictions.length === 0) {
      return null;
    }

    const hits = predictions.filter(p => p.hit === '1').length;
    const winRate = hits / predictions.length;
    
    const totalROI = predictions.reduce((sum, p) => sum + parseFloat(p.roi || 0), 0);
    const avgROI = totalROI / predictions.length;

    const maes = predictions.map(p => Math.abs(parseFloat(p.actual_sog) - parseFloat(p.predicted_sog)));
    const mae = maes.reduce((sum, m) => sum + m, 0) / maes.length;

    // By direction
    const overs = predictions.filter(p => p.direction === 'OVER');
    const unders = predictions.filter(p => p.direction === 'UNDER');

    const overWinRate = overs.length > 0 ? overs.filter(p => p.hit === '1').length / overs.length : 0;
    const underWinRate = unders.length > 0 ? unders.filter(p => p.hit === '1').length / unders.length : 0;

    return {
      window,
      totalPicks: predictions.length,
      hits,
      winRate: (winRate * 100).toFixed(1),
      mae: mae.toFixed(2),
      roi: avgROI.toFixed(2),
      totalROI: totalROI.toFixed(2),
      overs: {
        count: overs.length,
        winRate: (overWinRate * 100).toFixed(1)
      },
      unders: {
        count: unders.length,
        winRate: (underWinRate * 100).toFixed(1)
      }
    };
  }
}
