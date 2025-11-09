#!/usr/bin/env node

/**
 * MLB HR Round Robin - Main Entry Point
 * 
 * Run complete backtest pipeline:
 * node scripts/run_backtest.mjs
 */

import { BacktestRunner } from '../src/backtest/backtest_runner.mjs';

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   MLB HR ROUND ROBIN - COMPREHENSIVE BACKTEST               ║
║                                                              ║
║   Testing 3,150 strategy combinations (2021-2025)           ║
║   Zero data leakage • FDR correction • Bootstrap stability  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
  
  const config = {
    dataPath: '/Users/brentgoldman/RRMODEL/data/mlb_historical',
    resultsPath: '/Users/brentgoldman/RRMODEL/results',
    trainYears: [2021, 2022, 2023],
    validateYear: 2024,
    testYear: 2025
  };
  
  const runner = new BacktestRunner(config);
  
  try {
    const results = await runner.run();
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                  BACKTEST COMPLETE ✅                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    console.log('📊 FINAL RESULTS SUMMARY:\n');
    console.log(`Total Strategies Tested: ${results.phase2.summary.totalTested}`);
    console.log(`FDR-Significant: ${results.phase2.summary.fdrSignificant}`);
    console.log(`Bootstrap-Stable: ${results.phase2.summary.bootstrapStable}`);
    console.log(`Final Certified: ${results.phase2.summary.finalCertified}\n`);
    
    const topStrategy = results.phase3.summary.topStrategy;
    console.log('🏆 TOP STRATEGY (2025 Test Set):');
    console.log(`   ${topStrategy.strategy.predictionModule} + ${topStrategy.strategy.selectionModule}`);
    console.log(`   ROI: ${(topStrategy.results.summary.roi * 100).toFixed(2)}%`);
    console.log(`   Sharpe: ${topStrategy.results.summary.sharpeRatio.toFixed(2)}`);
    console.log(`   Hit Rate: ${(topStrategy.results.summary.avgHitRate * 100).toFixed(1)}%\n`);
    
    console.log('📁 Full report available at:');
    console.log(`   ${config.resultsPath}/phase4_reporting/comprehensive_report.html\n`);
    
    console.log('✅ Ready for 2026 season deployment!\n');
    
  } catch (error) {
    console.error('\n❌ BACKTEST FAILED:\n');
    console.error(error);
    process.exit(1);
  }
}

main();
