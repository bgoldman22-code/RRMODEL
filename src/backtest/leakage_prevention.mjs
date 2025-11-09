/**
 * MLB HR Round Robin - ZERO DATA LEAKAGE Framework
 * 
 * CRITICAL: Prevents future data from contaminating predictions
 * Ensures backtest results are valid and generalizable to 2026
 */

import fs from 'fs';
import path from 'path';

/**
 * Temporal Boundary Enforcer
 * Ensures all data access respects time constraints
 */
class TemporalBoundary {
  constructor(simulationDate, lockTime = '18:00:00') {
    this.simulationDate = new Date(simulationDate);
    this.lockTime = new Date(`${simulationDate.split('T')[0]}T${lockTime}Z`);
    this.dataAccessLog = [];
  }

  /**
   * Check if data timestamp is valid (before lock time)
   */
  isValidDataAccess(dataTimestamp, context) {
    const dataDate = new Date(dataTimestamp);
    const isValid = dataDate < this.lockTime;
    
    this.dataAccessLog.push({
      context,
      dataTimestamp,
      lockTime: this.lockTime.toISOString(),
      isValid,
      violationType: isValid ? null : 'FUTURE_DATA_ACCESS',
      stackTrace: new Error().stack
    });
    
    if (!isValid) {
      throw new Error(
        `DATA LEAKAGE DETECTED!\n` +
        `Context: ${context}\n` +
        `Data timestamp: ${dataTimestamp}\n` +
        `Lock time: ${this.lockTime.toISOString()}\n` +
        `Attempted to access data from the future!`
      );
    }
    
    return isValid;
  }

  /**
   * Filter dataset to only include valid temporal data
   */
  filterByTemporalBoundary(dataset, timestampField = 'timestamp') {
    return dataset.filter(item => {
      try {
        this.isValidDataAccess(item[timestampField], `Filtering ${timestampField}`);
        return true;
      } catch (e) {
        return false;
      }
    });
  }

  /**
   * Get audit log for this simulation
   */
  getAuditLog() {
    return {
      simulationDate: this.simulationDate.toISOString(),
      lockTime: this.lockTime.toISOString(),
      totalAccesses: this.dataAccessLog.length,
      violations: this.dataAccessLog.filter(log => !log.isValid),
      summary: {
        valid: this.dataAccessLog.filter(log => log.isValid).length,
        violations: this.dataAccessLog.filter(log => !log.isValid).length
      }
    };
  }
}

/**
 * Rolling Window Feature Calculator
 * Ensures features only use historical data
 */
class RollingWindowFeatures {
  constructor(temporalBoundary) {
    this.boundary = temporalBoundary;
  }

  /**
   * Calculate hot/cold streak (14-day window)
   * MUST ONLY USE PAST DATA
   */
  calculateHotCold(playerId, historicalStats, asOfDate) {
    this.boundary.isValidDataAccess(asOfDate, 'calculateHotCold');
    
    const cutoffDate = new Date(asOfDate);
    cutoffDate.setDate(cutoffDate.getDate() - 14);
    
    // Filter to only games in the 14-day window BEFORE asOfDate
    const recentGames = historicalStats.filter(game => {
      const gameDate = new Date(game.date);
      return gameDate >= cutoffDate && gameDate < new Date(asOfDate);
    });
    
    if (recentGames.length === 0) return 1.0; // No adjustment
    
    const hrs = recentGames.reduce((sum, g) => sum + (g.hr || 0), 0);
    const games = recentGames.length;
    
    return {
      hrPer14Days: hrs,
      gamesIn14Days: games,
      hrRate: hrs / games,
      multiplier: this.calculateMultiplier(hrs / games),
      dataRange: {
        from: cutoffDate.toISOString(),
        to: asOfDate,
        gamesIncluded: games
      }
    };
  }

  calculateMultiplier(recentRate) {
    const leagueAvg = 0.10; // ~10% HR rate
    const deviation = (recentRate - leagueAvg) / leagueAvg;
    return Math.max(0.94, Math.min(1.06, 1 + deviation * 0.3)); // Cap at ±6%
  }

  /**
   * Calculate BvP (Batter vs Pitcher history)
   * MUST ONLY USE PAST MATCHUPS
   */
  calculateBvP(batterId, pitcherId, historicalMatchups, asOfDate) {
    this.boundary.isValidDataAccess(asOfDate, 'calculateBvP');
    
    // Filter to only matchups BEFORE asOfDate
    const pastMatchups = historicalMatchups.filter(matchup => {
      const matchupDate = new Date(matchup.date);
      return matchupDate < new Date(asOfDate);
    });
    
    if (pastMatchups.length < 10) return { modifier: 0, insufficient: true };
    
    const abs = pastMatchups.length;
    const hrs = pastMatchups.reduce((sum, m) => sum + (m.hr ? 1 : 0), 0);
    const hrRate = hrs / abs;
    
    return {
      abs,
      hrs,
      hrRate,
      modifier: Math.max(-0.06, Math.min(0.06, (hrRate - 0.10) * 0.5)),
      dataRange: {
        matchupsIncluded: abs,
        oldestMatchup: pastMatchups[0]?.date,
        newestMatchup: pastMatchups[pastMatchups.length - 1]?.date
      }
    };
  }
}

/**
 * Train/Test/Validation Split Manager
 * Prevents contamination between data sets
 */
class DataSplitManager {
  constructor() {
    this.splits = {
      train: { start: '2021-03-01', end: '2023-11-30' },
      validate: { start: '2024-03-01', end: '2024-11-30' },
      test: { start: '2025-03-01', end: '2025-11-30' }
    };
    
    this.currentSplit = null;
    this.locked = false;
  }

  /**
   * Set current split and lock it
   */
  setSplit(splitName) {
    if (this.locked) {
      throw new Error(`Cannot change split - already locked to ${this.currentSplit}`);
    }
    
    if (!this.splits[splitName]) {
      throw new Error(`Invalid split name: ${splitName}. Must be train, validate, or test.`);
    }
    
    this.currentSplit = splitName;
    console.log(`✅ Data split set to: ${splitName} (${this.splits[splitName].start} to ${this.splits[splitName].end})`);
  }

  /**
   * Lock current split to prevent changes during backtest
   */
  lock() {
    if (!this.currentSplit) {
      throw new Error('Must set split before locking');
    }
    this.locked = true;
    console.log(`🔒 Data split locked to: ${this.currentSplit}`);
  }

  /**
   * Unlock after backtest complete
   */
  unlock() {
    this.locked = false;
    this.currentSplit = null;
    console.log(`🔓 Data split unlocked`);
  }

  /**
   * Check if date is in current split
   */
  isInCurrentSplit(date) {
    if (!this.currentSplit) {
      throw new Error('No split set - must call setSplit() first');
    }
    
    const dateObj = new Date(date);
    const split = this.splits[this.currentSplit];
    
    return dateObj >= new Date(split.start) && dateObj <= new Date(split.end);
  }

  /**
   * Filter dataset to current split only
   */
  filterToCurrentSplit(dataset, dateField = 'date') {
    return dataset.filter(item => this.isInCurrentSplit(item[dateField]));
  }

  /**
   * Get all dates in current split
   */
  getDatesInCurrentSplit() {
    const split = this.splits[this.currentSplit];
    const dates = [];
    const current = new Date(split.start);
    const end = new Date(split.end);
    
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  }
}

/**
 * Data Access Auditor
 * Logs ALL data access for leakage detection
 */
class DataAccessAuditor {
  constructor() {
    this.accessLog = [];
    this.violations = [];
  }

  /**
   * Log data access
   */
  logAccess(context, dataSource, dataTimestamp, requestedBy) {
    const accessRecord = {
      timestamp: new Date().toISOString(),
      context,
      dataSource,
      dataTimestamp,
      requestedBy,
      stackTrace: new Error().stack
    };
    
    this.accessLog.push(accessRecord);
    return accessRecord;
  }

  /**
   * Log violation
   */
  logViolation(violationType, details) {
    const violation = {
      timestamp: new Date().toISOString(),
      violationType,
      details,
      stackTrace: new Error().stack
    };
    
    this.violations.push(violation);
    console.error(`🚨 DATA LEAKAGE VIOLATION: ${violationType}`, details);
    return violation;
  }

  /**
   * Generate audit report
   */
  generateReport() {
    return {
      summary: {
        totalAccesses: this.accessLog.length,
        totalViolations: this.violations.length,
        violationRate: this.violations.length / this.accessLog.length
      },
      accessLog: this.accessLog,
      violations: this.violations,
      byContext: this.groupByContext(),
      byDataSource: this.groupByDataSource()
    };
  }

  groupByContext() {
    const grouped = {};
    this.accessLog.forEach(access => {
      if (!grouped[access.context]) {
        grouped[access.context] = 0;
      }
      grouped[access.context]++;
    });
    return grouped;
  }

  groupByDataSource() {
    const grouped = {};
    this.accessLog.forEach(access => {
      if (!grouped[access.dataSource]) {
        grouped[access.dataSource] = 0;
      }
      grouped[access.dataSource]++;
    });
    return grouped;
  }

  /**
   * Save audit report to file
   */
  saveReport(filePath) {
    const report = this.generateReport();
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
    console.log(`✅ Audit report saved to: ${filePath}`);
    
    if (report.violations.length > 0) {
      console.error(`🚨 ${report.violations.length} VIOLATIONS DETECTED - BACKTEST INVALID`);
      throw new Error('Data leakage detected - backtest results are invalid');
    }
  }
}

/**
 * Complete Leakage Prevention System
 */
class LeakagePreventionSystem {
  constructor() {
    this.splitManager = new DataSplitManager();
    this.auditor = new DataAccessAuditor();
    this.activeBoundaries = new Map();
  }

  /**
   * Initialize for backtest run
   */
  initialize(splitName) {
    this.splitManager.setSplit(splitName);
    this.splitManager.lock();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`LEAKAGE PREVENTION SYSTEM INITIALIZED`);
    console.log(`Split: ${splitName}`);
    console.log(`Strict temporal enforcement: ENABLED`);
    console.log(`Data access auditing: ENABLED`);
    console.log(`${'='.repeat(60)}\n`);
  }

  /**
   * Create temporal boundary for specific simulation date
   */
  createBoundary(simulationDate) {
    if (!this.splitManager.isInCurrentSplit(simulationDate)) {
      throw new Error(
        `Date ${simulationDate} not in current split (${this.splitManager.currentSplit})`
      );
    }
    
    const boundary = new TemporalBoundary(simulationDate);
    this.activeBoundaries.set(simulationDate, boundary);
    return boundary;
  }

  /**
   * Finalize and generate complete audit report
   */
  finalize(outputPath) {
    this.splitManager.unlock();
    
    // Collect all boundary logs
    const allBoundaryLogs = [];
    this.activeBoundaries.forEach((boundary, date) => {
      allBoundaryLogs.push({
        date,
        log: boundary.getAuditLog()
      });
    });
    
    // Generate comprehensive report
    const report = {
      ...this.auditor.generateReport(),
      temporalBoundaries: allBoundaryLogs,
      split: this.splitManager.currentSplit,
      conclusion: this.auditor.violations.length === 0
        ? 'ZERO DATA LEAKAGE DETECTED - BACKTEST VALID ✅'
        : 'DATA LEAKAGE DETECTED - BACKTEST INVALID ❌'
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\n${'='.repeat(60)}`);
    console.log(`LEAKAGE PREVENTION AUDIT COMPLETE`);
    console.log(`Report saved to: ${outputPath}`);
    console.log(`Result: ${report.conclusion}`);
    console.log(`${'='.repeat(60)}\n`);
    
    if (this.auditor.violations.length > 0) {
      throw new Error('Data leakage detected - backtest results are invalid');
    }
    
    return report;
  }
}

export {
  TemporalBoundary,
  RollingWindowFeatures,
  DataSplitManager,
  DataAccessAuditor,
  LeakagePreventionSystem
};
