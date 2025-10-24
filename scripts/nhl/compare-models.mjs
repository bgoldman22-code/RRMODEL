#!/usr/bin/env node

/**
 * Compare Baseline vs Improved Model Results
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

function loadResults(filename) {
  const filepath = path.join(REPO_ROOT, 'data/nhl', filename);
  if (!fs.existsSync(filepath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                    ║');
  console.log('║       📊 NHL MODEL COMPARISON: Baseline vs Improved               ║');
  console.log('║                                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const baseline = loadResults('walkforward_backtest_results.json');
  const improved = loadResults('walkforward_backtest_improved_results.json');
  
  if (!baseline) {
    console.log('❌ Baseline results not found');
    return;
  }
  
  if (!improved) {
    console.log('⏳ Improved model still running...');
    console.log('   Check: tail -f data/nhl/walkforward_backtest_improved_output.txt');
    return;
  }
  
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📊 COMPARISON RESULTS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  // MAE Comparison
  const baseMAE = baseline.metrics.mae;
  const impMAE = improved.metrics.mae;
  const maeImprovement = ((baseMAE - impMAE) / baseMAE * 100);
  
  console.log('📏 Mean Absolute Error (MAE):');
  console.log(`   Baseline:  ${baseMAE.toFixed(3)} shots`);
  console.log(`   Improved:  ${impMAE.toFixed(3)} shots`);
  console.log(`   Change:    ${maeImprovement >= 0 ? '↓' : '↑'} ${Math.abs(maeImprovement).toFixed(1)}%`);
  console.log(`   Target:    < 1.0 shots`);
  console.log(`   Status:    ${impMAE < 1.0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  // Correlation Comparison
  const baseCorr = baseline.metrics.correlation;
  const impCorr = improved.metrics.correlation;
  const corrImprovement = ((impCorr - baseCorr) / baseCorr * 100);
  
  console.log('🔗 Correlation:');
  console.log(`   Baseline:  ${baseCorr.toFixed(3)}`);
  console.log(`   Improved:  ${impCorr.toFixed(3)}`);
  console.log(`   Change:    ${corrImprovement >= 0 ? '↑' : '↓'} ${Math.abs(corrImprovement).toFixed(1)}%`);
  console.log(`   Target:    > 0.55`);
  console.log(`   Status:    ${impCorr > 0.55 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  // Bias Comparison
  const baseBias = baseline.metrics.bias;
  const impBias = improved.metrics.bias;
  const biasImprovement = ((Math.abs(baseBias) - Math.abs(impBias)) / Math.abs(baseBias) * 100);
  
  console.log('📐 Bias:');
  console.log(`   Baseline:  ${baseBias >= 0 ? '+' : ''}${baseBias.toFixed(3)} shots`);
  console.log(`   Improved:  ${impBias >= 0 ? '+' : ''}${impBias.toFixed(3)} shots`);
  console.log(`   Change:    ${biasImprovement >= 0 ? '↓' : '↑'} ${Math.abs(biasImprovement).toFixed(1)}% (absolute)`);
  console.log(`   Target:    < 0.15 shots`);
  console.log(`   Status:    ${Math.abs(impBias) < 0.15 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  // Validation Summary
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🎯 VALIDATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  const basePass = baseline.validation.maePass && baseline.validation.correlationPass && baseline.validation.biasPass;
  const impPass = improved.validation.maePass && improved.validation.correlationPass && improved.validation.biasPass;
  
  console.log('Baseline Model:');
  console.log(`   MAE < 1.0:         ${baseline.validation.maePass ? '✅' : '❌'}`);
  console.log(`   Correlation > 0.55: ${baseline.validation.correlationPass ? '✅' : '❌'}`);
  console.log(`   Bias < 0.15:       ${baseline.validation.biasPass ? '✅' : '❌'}`);
  console.log(`   OVERALL:           ${basePass ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  console.log('Improved Model:');
  console.log(`   MAE < 1.0:         ${improved.validation.maePass ? '✅' : '❌'}`);
  console.log(`   Correlation > 0.55: ${improved.validation.correlationPass ? '✅' : '❌'}`);
  console.log(`   Bias < 0.15:       ${improved.validation.biasPass ? '✅' : '❌'}`);
  console.log(`   OVERALL:           ${impPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  // Recommendation
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('💡 RECOMMENDATION');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  if (impPass) {
    console.log('✅ PROCEED TO MARKET VALIDATION');
    console.log('');
    console.log('   The improved model passed all validation gates!');
    console.log('');
    console.log('   Next steps:');
    console.log('   1. Fetch historical odds from TheOddsAPI');
    console.log('   2. Run market-aware backtest (ROI, EV, drawdown)');
    console.log('   3. If profitable, deploy with small stakes');
    console.log('');
    console.log('   Command:');
    console.log('   THEODDS_API_KEY=<your-key> node scripts/nhl/fetch-historical-odds.mjs --execute');
  } else if (impMAE < baseMAE) {
    console.log('🟡 MODEL IMPROVED BUT NOT ENOUGH');
    console.log('');
    console.log('   The improvements helped, but validation gates still failed.');
    console.log('');
    console.log('   Options:');
    console.log('   1. Add more advanced features:');
    console.log('      - Opponent defensive strength');
    console.log('      - Rest days (back-to-back games)');
    console.log('      - Line combinations');
    console.log('      - Injury status');
    console.log('      - Score effects');
    console.log('');
    console.log('   2. Try different model architecture:');
    console.log('      - Machine learning (XGBoost, Random Forest)');
    console.log('      - Neural networks');
    console.log('      - Ensemble methods');
    console.log('');
    console.log('   3. Accept limitations:');
    console.log('      - NHL shots might be too random');
    console.log('      - Consider different sport or bet type');
  } else {
    console.log('❌ IMPROVEMENTS DID NOT HELP');
    console.log('');
    console.log('   The improved model performed worse than baseline.');
    console.log('   This suggests the improvements may have overfit or');
    console.log('   the features are not as predictive as expected.');
    console.log('');
    console.log('   Recommendation: Revert to baseline and try different approach.');
  }
  console.log('');
}

main();
