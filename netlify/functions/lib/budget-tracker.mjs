/**
 * Budget Tracker for Strict Time Enforcement
 * Tracks and enforces stage-level time budgets with hard stops
 * 
 * Updated: November 12, 2025
 * Ensures we never exceed 50s global budget
 */

import { BUDGETS } from './constants.mjs';

export class BudgetTracker {
  constructor(budgets = BUDGETS) {
    this.budgets = budgets;
    this.startTime = Date.now();
    this.stages = new Map();
    this.checkpoints = [];
  }
  
  // ==========================================================================
  // STAGE MANAGEMENT
  // ==========================================================================
  
  /**
   * Start tracking a stage
   * @param {string} name - Stage name (ACQUIRE, TRANSFORM, MERGE)
   */
  startStage(name) {
    const now = Date.now();
    this.stages.set(name, {
      start: now,
      end: null,
      elapsed: null,
      budget: this.budgets[name.toUpperCase()],
      exceeded: false
    });
    
    console.log(`⏱️  [${name}] Started (budget: ${this.budgets[name.toUpperCase()]}ms)`);
  }
  
  /**
   * End tracking a stage
   * @param {string} name - Stage name
   * @returns {object} - Stage stats
   */
  endStage(name) {
    const stage = this.stages.get(name);
    if (!stage) {
      console.warn(`⚠️ Stage "${name}" was never started`);
      return null;
    }
    
    const now = Date.now();
    stage.end = now;
    stage.elapsed = now - stage.start;
    stage.exceeded = stage.elapsed > stage.budget;
    
    const status = stage.exceeded ? '❌' : '✅';
    const pct = Math.round((stage.elapsed / stage.budget) * 100);
    
    console.log(
      `${status} [${name}] Completed in ${stage.elapsed}ms ` +
      `(${pct}% of ${stage.budget}ms budget)`
    );
    
    if (stage.exceeded) {
      console.warn(`⚠️ Stage "${name}" exceeded budget by ${stage.elapsed - stage.budget}ms`);
    }
    
    return stage;
  }
  
  // ==========================================================================
  // TIME QUERIES
  // ==========================================================================
  
  /**
   * Get remaining time for a stage
   * @param {string} name - Stage name
   * @returns {number} - Remaining ms (0 if exhausted)
   */
  remaining(name) {
    const stage = this.stages.get(name);
    if (!stage) return 0;
    
    const budget = this.budgets[name.toUpperCase()] || 0;
    const elapsed = Date.now() - stage.start;
    return Math.max(0, budget - elapsed);
  }
  
  /**
   * Get remaining time for global budget
   * @returns {number} - Remaining ms (0 if exhausted)
   */
  globalRemaining() {
    const elapsed = Date.now() - this.startTime;
    return Math.max(0, this.budgets.GLOBAL - elapsed);
  }
  
  /**
   * Get elapsed time for a stage
   * @param {string} name - Stage name
   * @returns {number} - Elapsed ms
   */
  elapsed(name) {
    const stage = this.stages.get(name);
    if (!stage) return 0;
    return Date.now() - stage.start;
  }
  
  /**
   * Get global elapsed time
   * @returns {number} - Elapsed ms
   */
  globalElapsed() {
    return Date.now() - this.startTime;
  }
  
  // ==========================================================================
  // ENFORCEMENT
  // ==========================================================================
  
  /**
   * Check if stage budget is exhausted (throws if hard stop)
   * @param {string} name - Stage name
   * @param {boolean} hardStop - Throw error if exhausted (default: true)
   * @returns {boolean} - True if budget remaining
   */
  enforce(name, hardStop = true) {
    const remaining = this.remaining(name);
    const exhausted = remaining <= 0;
    
    if (exhausted) {
      const msg = `HARD STOP: ${name} budget exhausted`;
      console.error(`🚨 ${msg}`);
      
      if (hardStop) {
        const err = new Error(msg);
        err.code = 'BUDGET_EXHAUSTED';
        err.stage = name;
        throw err;
      }
    }
    
    return !exhausted;
  }
  
  /**
   * Check if we're within safety threshold of exhaustion
   * @param {string} name - Stage name
   * @param {number} thresholdMs - Warning threshold (default: 5000ms)
   * @returns {boolean} - True if within warning threshold
   */
  isNearExhaustion(name, thresholdMs = 5000) {
    const remaining = this.remaining(name);
    return remaining > 0 && remaining <= thresholdMs;
  }
  
  // ==========================================================================
  // CHECKPOINTS
  // ==========================================================================
  
  /**
   * Record a checkpoint
   * @param {string} label - Checkpoint label
   * @param {object} meta - Optional metadata
   */
  checkpoint(label, meta = {}) {
    const elapsed = this.globalElapsed();
    const remaining = this.globalRemaining();
    
    this.checkpoints.push({
      label,
      timestamp: Date.now(),
      elapsed,
      remaining,
      meta
    });
    
    console.log(`📍 [${label}] ${elapsed}ms elapsed, ${remaining}ms remaining`);
  }
  
  // ==========================================================================
  // REPORTING
  // ==========================================================================
  
  /**
   * Get summary of all stages
   * @returns {object} - Summary object
   */
  getSummary() {
    const stages = {};
    for (const [name, stage] of this.stages.entries()) {
      stages[name] = {
        elapsed: stage.elapsed || (Date.now() - stage.start),
        budget: stage.budget,
        exceeded: stage.exceeded,
        utilization: stage.budget > 0 
          ? Math.round(((stage.elapsed || (Date.now() - stage.start)) / stage.budget) * 100)
          : 0
      };
    }
    
    return {
      globalElapsed: this.globalElapsed(),
      globalBudget: this.budgets.GLOBAL,
      globalRemaining: this.globalRemaining(),
      globalUtilization: Math.round((this.globalElapsed() / this.budgets.GLOBAL) * 100),
      stages,
      checkpoints: this.checkpoints
    };
  }
  
  /**
   * Print summary to console
   */
  printSummary() {
    const summary = this.getSummary();
    
    console.log('\n' + '='.repeat(60));
    console.log('⏱️  BUDGET SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`\nGlobal: ${summary.globalElapsed}ms / ${summary.globalBudget}ms (${summary.globalUtilization}%)`);
    
    console.log('\nStages:');
    for (const [name, stage] of Object.entries(summary.stages)) {
      const status = stage.exceeded ? '❌' : '✅';
      console.log(
        `  ${status} ${name.padEnd(12)} ${String(stage.elapsed).padStart(6)}ms / ` +
        `${String(stage.budget).padStart(6)}ms (${String(stage.utilization).padStart(3)}%)`
      );
    }
    
    if (summary.checkpoints.length > 0) {
      console.log('\nCheckpoints:');
      for (const cp of summary.checkpoints) {
        console.log(`  📍 ${cp.label.padEnd(20)} ${String(cp.elapsed).padStart(6)}ms`);
      }
    }
    
    console.log('='.repeat(60) + '\n');
  }
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Create a new budget tracker
 * @param {object} customBudgets - Optional custom budgets
 * @returns {BudgetTracker}
 */
export function createTracker(customBudgets) {
  return new BudgetTracker(customBudgets);
}

export default BudgetTracker;
