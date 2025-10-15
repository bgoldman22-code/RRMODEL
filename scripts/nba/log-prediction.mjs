/**
 * NBA RCI Prediction Logger
 * 
 * Logs every prediction with full context for live monitoring:
 * - RCI adjustments (dOff, dDef, dNet, cap_hit)
 * - Predictions (baseline, RCI-adjusted, actual result)
 * - Odds data (closing line, model prob, implied prob, CLV)
 * - Performance metrics (error, correct pick, ROI)
 * 
 * Outputs to:
 * - Local CSV: data/nba/logs/predictions_2025-26.csv
 * - GitHub Action: triggers commit for persistence
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const SEASON = '2025-26';
const LOG_DIR = path.join(__dirname, '../../data/nba/logs');
const LOG_FILE = path.join(LOG_DIR, `predictions_${SEASON}.csv`);

// CSV Headers with all required fields
const CSV_HEADERS = [
  'date',
  'game_id',
  'team',
  'opponent',
  'is_home',
  'rci',
  'games_played',
  'delta_off',
  'delta_def',
  'delta_net',
  'cap_hit',
  'baseline_spread',
  'rci_spread',
  'actual_spread',
  'baseline_error',
  'rci_error',
  'improvement',
  'baseline_correct',
  'rci_correct',
  'line_close',
  'model_prob',
  'implied_prob',
  'clv',
  'roi_baseline',
  'roi_rci',
  'notes'
].join(',');

// ============================================================================
// Logger Class
// ============================================================================

class PredictionLogger {
  constructor() {
    this.ensureLogDirectory();
    this.ensureLogFile();
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDirectory() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      console.log(`✅ Created log directory: ${LOG_DIR}`);
    }
  }

  /**
   * Ensure log file exists with headers
   */
  ensureLogFile() {
    if (!fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, CSV_HEADERS + '\n', 'utf8');
      console.log(`✅ Created log file: ${LOG_FILE}`);
    }
  }

  /**
   * Log a single prediction
   * 
   * @param {Object} data - Prediction data
   * @param {string} data.date - Game date (YYYY-MM-DD)
   * @param {string} data.gameId - Unique game identifier
   * @param {string} data.team - Team abbreviation
   * @param {string} data.opponent - Opponent abbreviation
   * @param {boolean} data.isHome - Is team home?
   * @param {number} data.rci - Team RCI value
   * @param {number} data.gamesPlayed - Games played this season
   * @param {number} data.deltaOff - Offensive adjustment
   * @param {number} data.deltaDef - Defensive adjustment
   * @param {number} data.deltaNet - Net adjustment
   * @param {boolean} data.capHit - Was NET_CAP applied?
   * @param {number} data.baselineSpread - Baseline prediction
   * @param {number} data.rciSpread - RCI-adjusted prediction
   * @param {number|null} data.actualSpread - Actual result (null if game not played)
   * @param {number|null} data.lineClose - Closing line spread
   * @param {string} data.notes - Optional notes
   */
  logPrediction(data) {
    const {
      date,
      gameId,
      team,
      opponent,
      isHome,
      rci,
      gamesPlayed,
      deltaOff,
      deltaDef,
      deltaNet,
      capHit,
      baselineSpread,
      rciSpread,
      actualSpread = null,
      lineClose = null,
      notes = ''
    } = data;

    // Calculate errors if actual result is available
    let baselineError = null;
    let rciError = null;
    let improvement = null;
    let baselineCorrect = null;
    let rciCorrect = null;
    let roiBaseline = null;
    let roiRci = null;

    if (actualSpread !== null) {
      baselineError = Math.abs(baselineSpread - actualSpread);
      rciError = Math.abs(rciSpread - actualSpread);
      improvement = ((baselineError - rciError) / baselineError * 100).toFixed(2);

      // Did we pick the right side?
      baselineCorrect = (baselineSpread * actualSpread > 0) ? 1 : 0;
      rciCorrect = (rciSpread * actualSpread > 0) ? 1 : 0;

      // Calculate ROI (assuming -110 odds, risking 1 unit)
      roiBaseline = baselineCorrect ? 0.909 : -1.0;  // Win $0.909 or lose $1
      roiRci = rciCorrect ? 0.909 : -1.0;
    }

    // Calculate model probability and CLV
    let modelProb = null;
    let impliedProb = null;
    let clv = null;

    if (lineClose !== null) {
      // Convert spread to moneyline probability (simplified)
      // For spread betting, this is approximate
      modelProb = this.spreadToProb(rciSpread);
      impliedProb = this.spreadToProb(lineClose);
      clv = ((modelProb - impliedProb) * 100).toFixed(2);  // CLV in percentage points
    }

    // Build CSV row
    const row = [
      date,
      gameId,
      team,
      opponent,
      isHome ? 1 : 0,
      rci.toFixed(3),
      gamesPlayed,
      deltaOff.toFixed(2),
      deltaDef.toFixed(2),
      deltaNet.toFixed(2),
      capHit ? 1 : 0,
      baselineSpread.toFixed(1),
      rciSpread.toFixed(1),
      actualSpread !== null ? actualSpread.toFixed(1) : '',
      baselineError !== null ? baselineError.toFixed(2) : '',
      rciError !== null ? rciError.toFixed(2) : '',
      improvement !== null ? improvement : '',
      baselineCorrect !== null ? baselineCorrect : '',
      rciCorrect !== null ? rciCorrect : '',
      lineClose !== null ? lineClose.toFixed(1) : '',
      modelProb !== null ? modelProb.toFixed(3) : '',
      impliedProb !== null ? impliedProb.toFixed(3) : '',
      clv !== null ? clv : '',
      roiBaseline !== null ? roiBaseline.toFixed(3) : '',
      roiRci !== null ? roiRci.toFixed(3) : '',
      `"${notes.replace(/"/g, '""')}"`  // Escape quotes in notes
    ].join(',');

    // Append to file
    fs.appendFileSync(LOG_FILE, row + '\n', 'utf8');

    return {
      logged: true,
      file: LOG_FILE,
      row
    };
  }

  /**
   * Convert spread to win probability (simplified)
   * 
   * @param {number} spread - Point spread
   * @returns {number} Win probability (0-1)
   */
  spreadToProb(spread) {
    // Simplified conversion: each point ≈ 2.5% probability
    // spread of -7 ≈ 67.5% win probability
    // spread of +7 ≈ 32.5% win probability
    const baseProbability = 0.5;
    const pointValue = 0.025;  // 2.5% per point
    
    const prob = baseProbability + (spread * pointValue);
    
    // Clamp to reasonable range
    return Math.max(0.1, Math.min(0.9, prob));
  }

  /**
   * Get all predictions for analysis
   * 
   * @returns {Array} Array of prediction objects
   */
  getAllPredictions() {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }

    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.trim().split('\n');
    
    if (lines.length <= 1) {
      return [];  // Only header, no data
    }

    const headers = lines[0].split(',');
    const predictions = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const prediction = {};
      
      headers.forEach((header, idx) => {
        const value = values[idx];
        
        // Parse numeric values
        if (value && !isNaN(value)) {
          prediction[header] = parseFloat(value);
        } else {
          prediction[header] = value;
        }
      });

      predictions.push(prediction);
    }

    return predictions;
  }

  /**
   * Calculate rolling metrics for monitoring
   * 
   * @param {number} window - Rolling window size (e.g., 10 or 20 games)
   * @returns {Object} Rolling metrics
   */
  calculateRollingMetrics(window = 10) {
    const predictions = this.getAllPredictions()
      .filter(p => p.actual_spread !== undefined && p.actual_spread !== '');

    if (predictions.length < window) {
      return null;  // Not enough data yet
    }

    // Get last N games
    const recent = predictions.slice(-window);

    // Calculate metrics
    const totalGames = recent.length;
    const rciWins = recent.filter(p => p.rci_correct === 1).length;
    const baselineWins = recent.filter(p => p.baseline_correct === 1).length;
    
    const avgRciError = recent.reduce((sum, p) => sum + p.rci_error, 0) / totalGames;
    const avgBaselineError = recent.reduce((sum, p) => sum + p.baseline_error, 0) / totalGames;
    
    const capHitCount = recent.filter(p => p.cap_hit === 1).length;
    const capHitRate = (capHitCount / totalGames * 100).toFixed(1);

    const totalRoiRci = recent.reduce((sum, p) => sum + (p.roi_rci || 0), 0);
    const totalRoiBaseline = recent.reduce((sum, p) => sum + (p.roi_baseline || 0), 0);

    return {
      window,
      totalGames,
      rciWinRate: (rciWins / totalGames * 100).toFixed(1),
      baselineWinRate: (baselineWins / totalGames * 100).toFixed(1),
      rciMAE: avgRciError.toFixed(2),
      baselineMAE: avgBaselineError.toFixed(2),
      maeImprovement: ((avgBaselineError - avgRciError) / avgBaselineError * 100).toFixed(2),
      capHitRate,
      roiRci: totalRoiRci.toFixed(2),
      roiBaseline: totalRoiBaseline.toFixed(2),
      roiDiff: (totalRoiRci - totalRoiBaseline).toFixed(2)
    };
  }

  /**
   * Check if alerts should be triggered
   * 
   * @param {Object} metrics - Rolling metrics from calculateRollingMetrics()
   * @returns {Array} Array of alert objects
   */
  checkAlerts(metrics) {
    if (!metrics) return [];

    const alerts = [];

    // Alert 1: Win rate below 58%
    if (parseFloat(metrics.rciWinRate) < 58.0) {
      alerts.push({
        level: 'WARNING',
        metric: 'win_rate',
        value: metrics.rciWinRate,
        threshold: '58.0',
        message: `⚠️ RCI win rate (${metrics.rciWinRate}%) below 58% threshold over ${metrics.window} games`
      });
    }

    // Alert 2: MAE above 11.8
    if (parseFloat(metrics.rciMAE) > 11.8) {
      alerts.push({
        level: 'WARNING',
        metric: 'mae',
        value: metrics.rciMAE,
        threshold: '11.8',
        message: `⚠️ RCI MAE (${metrics.rciMAE}) above 11.8 threshold over ${metrics.window} games`
      });
    }

    // Alert 3: Cap hit rate above 10%
    if (parseFloat(metrics.capHitRate) > 10.0) {
      alerts.push({
        level: 'CAUTION',
        metric: 'cap_hit_rate',
        value: metrics.capHitRate,
        threshold: '10.0',
        message: `⚠️ Cap hit rate (${metrics.capHitRate}%) above 10% - parameters may be too aggressive`
      });
    }

    // Alert 4: Negative ROI
    if (parseFloat(metrics.roiRci) < 0) {
      alerts.push({
        level: 'CRITICAL',
        metric: 'roi',
        value: metrics.roiRci,
        threshold: '0.0',
        message: `🚨 CRITICAL: Negative ROI (${metrics.roiRci} units) over ${metrics.window} games`
      });
    }

    return alerts;
  }

  /**
   * Print monitoring dashboard
   */
  printDashboard(window = 10) {
    const metrics = this.calculateRollingMetrics(window);
    const allMetrics20 = this.calculateRollingMetrics(20);  // EMA smoothing
    const alerts = this.checkAlerts(metrics);

    console.log('\n' + '='.repeat(70));
    console.log('📊 NBA RCI LIVE MONITORING DASHBOARD');
    console.log('='.repeat(70));

    if (!metrics) {
      console.log(`\n⏳ Waiting for data... Need ${window} games to start monitoring.`);
      const total = this.getAllPredictions().filter(p => p.actual_spread).length;
      console.log(`   Current: ${total} games logged\n`);
      return;
    }

    console.log(`\n🎯 Rolling ${window}-Game Metrics:`);
    console.log(`   RCI Win Rate:      ${metrics.rciWinRate}% (target: ≥60%)`);
    console.log(`   Baseline Win Rate: ${metrics.baselineWinRate}%`);
    console.log(`   RCI MAE:           ${metrics.rciMAE} (target: ≤11.5)`);
    console.log(`   Baseline MAE:      ${metrics.baselineMAE}`);
    console.log(`   MAE Improvement:   ${metrics.maeImprovement}%`);
    console.log(`   Cap Hit Rate:      ${metrics.capHitRate}% (target: <10%)`);
    console.log(`   RCI ROI:           ${metrics.roiRci} units`);
    console.log(`   Baseline ROI:      ${metrics.roiBaseline} units`);
    console.log(`   ROI Difference:    ${metrics.roiDiff} units`);

    if (allMetrics20) {
      console.log(`\n📈 Rolling 20-Game Metrics (EMA Smoothing):`);
      console.log(`   RCI Win Rate:      ${allMetrics20.rciWinRate}%`);
      console.log(`   RCI MAE:           ${allMetrics20.rciMAE}`);
      console.log(`   ROI:               ${allMetrics20.roiRci} units`);
    }

    if (alerts.length > 0) {
      console.log(`\n🚨 ALERTS (${alerts.length}):`);
      alerts.forEach(alert => {
        console.log(`   ${alert.message}`);
      });
    } else {
      console.log(`\n✅ No alerts - system performing within expected range`);
    }

    console.log('\n' + '='.repeat(70) + '\n');
  }
}

// ============================================================================
// Export
// ============================================================================

export default PredictionLogger;

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const logger = new PredictionLogger();
  
  // Example: Log a test prediction
  logger.logPrediction({
    date: '2025-10-22',
    gameId: 'TEST_001',
    team: 'BOS',
    opponent: 'PHI',
    isHome: true,
    rci: 0.670,
    gamesPlayed: 0,
    deltaOff: -1.92,
    deltaDef: -0.48,
    deltaNet: -1.44,
    capHit: false,
    baselineSpread: -5.5,
    rciSpread: -4.1,
    actualSpread: null,  // Game not played yet
    lineClose: -4.5,
    notes: 'Season opener, Celtics low RCI'
  });

  console.log('✅ Test prediction logged successfully');
  
  // Show dashboard
  logger.printDashboard(10);
}
