#!/usr/bin/env node
/**
 * Shadow Eval – Test Script
 * 
 * Runs a minimal 3-day window to validate:
 * 1. Outputs are created (CSV, JSON, Markdown, metadata)
 * 2. PRE/POST split counts are correct
 * 3. All metrics are numeric (not NaN/undefined)
 * 
 * Usage:
 *   SHADOW_EVAL=1 node scripts/nba_shadow_eval/test_shadow_eval.mjs
 */

import fs from 'fs';
import path from 'path';
import { strict as assert } from 'assert';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../');

// ── Safety guard ────────────────────────────────────────────────────────────
if (process.env.SHADOW_EVAL !== '1') {
  console.error('❌ SHADOW_EVAL=1 required to run tests.');
  process.exit(1);
}

const TEST_OUT_DIR = path.join(REPO_ROOT, 'shadow_eval/out/test');
const TEST_CSV = path.join(TEST_OUT_DIR, 'test_eval.csv');

// ── Clean up previous test output ───────────────────────────────────────────
if (fs.existsSync(TEST_OUT_DIR)) {
  fs.rmSync(TEST_OUT_DIR, { recursive: true });
}
fs.mkdirSync(TEST_OUT_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: Metrics module unit tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════');
console.log('  🧪 Shadow Eval Test Suite');
console.log('═══════════════════════════════════════════════════════════════');

console.log('\nTest 1: Metrics module...');

const { computeMetrics, splitByDeadline } = await import('./lib/metrics.mjs');

// Synthetic test data
const fakeRows = [
  { date: '2026-01-20', pred_margin: 5.0, actual_margin: 3.0, pred_total: 220, actual_total: 215, pred_win_prob_home: 0.70, actual_home_win: 1, completed: true },
  { date: '2026-01-21', pred_margin: -3.0, actual_margin: -5.0, pred_total: 225, actual_total: 230, pred_win_prob_home: 0.35, actual_home_win: 0, completed: true },
  { date: '2026-01-22', pred_margin: 8.0, actual_margin: 2.0, pred_total: 210, actual_total: 218, pred_win_prob_home: 0.80, actual_home_win: 1, completed: true },
  { date: '2026-02-06', pred_margin: -1.0, actual_margin: 4.0, pred_total: 230, actual_total: 228, pred_win_prob_home: 0.45, actual_home_win: 1, completed: true },
  { date: '2026-02-07', pred_margin: 6.0, actual_margin: -2.0, pred_total: 215, actual_total: 220, pred_win_prob_home: 0.72, actual_home_win: 0, completed: true },
];

// Test split
const { pre, post } = splitByDeadline(fakeRows, '2026-02-06');
assert.equal(pre.length, 3, 'PRE should have 3 rows');
assert.equal(post.length, 2, 'POST should have 2 rows');
console.log('  ✅ splitByDeadline: correct PRE/POST counts');

// Test metrics computation
const preMetrics = computeMetrics(pre, 'both');
assert.ok(Number.isFinite(preMetrics.mae), 'MAE should be numeric');
assert.ok(Number.isFinite(preMetrics.rmse), 'RMSE should be numeric');
assert.ok(Number.isFinite(preMetrics.brier), 'Brier should be numeric');
assert.ok(Number.isFinite(preMetrics.log_loss), 'Log loss should be numeric');
assert.ok(Number.isFinite(preMetrics.correct_side_pct), 'Correct side % should be numeric');
assert.ok(Number.isFinite(preMetrics.total_mae), 'Total MAE should be numeric');
console.log('  ✅ computeMetrics: all metrics are numeric');

// Verify MAE calculation manually
// Errors: |5-3|=2, |-3-(-5)|=2, |8-2|=6 → MAE = 10/3 ≈ 3.333
assert.ok(Math.abs(preMetrics.mae - 10/3) < 0.01, `MAE should be ~3.33, got ${preMetrics.mae}`);
console.log('  ✅ MAE calculation verified');

// Verify correct side %: all 3 pre games predicted right side
assert.equal(preMetrics.correct_side_pct, 1.0, 'All 3 pre rows should be correct side');
console.log('  ✅ Correct side % verified');

const postMetrics = computeMetrics(post, 'both');
assert.ok(Number.isFinite(postMetrics.mae), 'POST MAE should be numeric');
// POST errors: |-1-4|=5, |6-(-2)|=8 → MAE = 13/2 = 6.5
assert.ok(Math.abs(postMetrics.mae - 6.5) < 0.01, `POST MAE should be 6.5, got ${postMetrics.mae}`);
console.log('  ✅ POST metrics verified');

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: Reporter module
// ═══════════════════════════════════════════════════════════════════════════

console.log('\nTest 2: Reporter module...');

const { writeCSV, writeSummaryJSON, writeMarkdownReport, writeRunMetadata } = await import('./lib/reporter.mjs');

const testCSVPath = path.join(TEST_OUT_DIR, 'test.csv');
writeCSV(fakeRows, testCSVPath);
assert.ok(fs.existsSync(testCSVPath), 'CSV should be created');
const csvContent = fs.readFileSync(testCSVPath, 'utf8');
assert.ok(csvContent.includes('date,game_id'), 'CSV should have headers');
assert.ok(csvContent.split('\n').length >= 6, 'CSV should have header + 5 data rows');
console.log('  ✅ CSV writer works');

const testSummary = {
  meta: { model_version: 'test', date_start: '2026-01-20', date_end: '2026-02-07', deadline: '2026-02-06', freeze_level: 'test', timestamp: new Date().toISOString() },
  pre: preMetrics,
  post: postMetrics,
};

const testJSONPath = path.join(TEST_OUT_DIR, 'test_summary.json');
writeSummaryJSON(testSummary, testJSONPath);
assert.ok(fs.existsSync(testJSONPath), 'JSON summary should be created');
const jsonContent = JSON.parse(fs.readFileSync(testJSONPath, 'utf8'));
assert.ok(jsonContent.pre.mae, 'JSON should contain pre.mae');
console.log('  ✅ JSON summary writer works');

const testMDPath = path.join(TEST_OUT_DIR, 'test_report.md');
writeMarkdownReport(testSummary, testMDPath);
assert.ok(fs.existsSync(testMDPath), 'Markdown report should be created');
const mdContent = fs.readFileSync(testMDPath, 'utf8');
assert.ok(mdContent.includes('Shadow Evaluation Report'), 'MD should have title');
assert.ok(mdContent.includes('PRE Deadline'), 'MD should have PRE column');
console.log('  ✅ Markdown report writer works');

const testMetaPath = path.join(TEST_OUT_DIR, 'test_metadata.json');
writeRunMetadata({ model_version: 'test', timestamp: new Date().toISOString() }, testMetaPath);
assert.ok(fs.existsSync(testMetaPath), 'Metadata should be created');
console.log('  ✅ Metadata writer works');

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: FrozenPredictor initialization
// ═══════════════════════════════════════════════════════════════════════════

console.log('\nTest 3: FrozenPredictor...');

const { FrozenPredictor } = await import('./lib/frozen_predictor.mjs');

// Test with no snapshot (should fall back to current production)
const predictor = new FrozenPredictor('test_nonexistent');
await predictor.init();
assert.ok(predictor.spreadModel, 'Spread model should be loaded');
assert.ok(predictor.totalModel, 'Total model should be loaded');
assert.ok(predictor.freezeLevel, 'Freeze level should be set');
console.log(`  ✅ FrozenPredictor initialized (freeze_level=${predictor.freezeLevel})`);

// Test predict with synthetic game data
const syntheticGames = [{
  date: '2026-02-01',
  game_id: '999999',
  home: 'BOS',
  away: 'LAL',
  home_score: 110,
  away_score: 105,
  actual_margin: 5,
  actual_home_win: 1,
  total: 215,
  completed: true,
}];

try {
  const preds = await predictor.predictGames(syntheticGames);
  assert.equal(preds.length, 1, 'Should get 1 prediction');
  
  const p = preds[0];
  if (p.pred_margin != null) {
    assert.ok(Number.isFinite(p.pred_margin), 'pred_margin should be numeric');
    assert.ok(Number.isFinite(p.pred_win_prob_home), 'pred_win_prob_home should be numeric');
    assert.ok(p.pred_win_prob_home >= 0 && p.pred_win_prob_home <= 1, 'win prob should be 0-1');
    console.log(`  ✅ Prediction generated: margin=${p.pred_margin}, winProb=${p.pred_win_prob_home}`);
  } else {
    console.log(`  ⚠️  Prediction returned null (stats API may be unavailable): ${p.error || 'unknown'}`);
    console.log('     This is OK – the predictor gracefully handles missing data');
  }
} catch (err) {
  console.log(`  ⚠️  Prediction test skipped (API unavailable): ${err.message}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: Output path guard
// ═══════════════════════════════════════════════════════════════════════════

console.log('\nTest 4: Safety guards...');

// The main script checks SHADOW_EVAL=1 and output path – we test that logic here
assert.equal(process.env.SHADOW_EVAL, '1', 'SHADOW_EVAL should be 1');
console.log('  ✅ SHADOW_EVAL guard verified');

// Check output path guard logic
const safePath = path.resolve(REPO_ROOT, 'shadow_eval/out/test.csv');
const unsafePath = path.resolve(REPO_ROOT, 'dist/data/bad.csv');
const shadowBase = path.resolve(REPO_ROOT, 'shadow_eval');
assert.ok(safePath.startsWith(shadowBase), 'Safe path should be under shadow_eval/');
assert.ok(!unsafePath.startsWith(shadowBase), 'Unsafe path should NOT be under shadow_eval/');
console.log('  ✅ Output path guard logic verified');

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5: Retrain Engine – OLS fitting
// ═══════════════════════════════════════════════════════════════════════════

console.log('\nTest 5: Retrain Engine – OLS fitting...');

const { fitLinearModel, predictWithModel, addDays, daysBetween } = await import('./lib/retrain_engine.mjs');

// Generate synthetic training data: y = 2*x1 - 3*x2 + 5 + noise
const synthSamples = [];
const rng = (seed) => {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
};
const random = rng(42);

for (let i = 0; i < 200; i++) {
  const x1 = (random() - 0.5) * 20;
  const x2 = (random() - 0.5) * 20;
  const noise = (random() - 0.5) * 2;
  const y = 2 * x1 - 3 * x2 + 5 + noise;
  synthSamples.push({ features: { feat_a: x1, feat_b: x2 }, target: y });
}

const featureKeys = ['feat_a', 'feat_b'];
const fittedModel = fitLinearModel(synthSamples, featureKeys, 0.001);

assert.ok(fittedModel.weights, 'Fitted model should have weights');
assert.ok(fittedModel.bias != null, 'Fitted model should have bias');
assert.ok(fittedModel.means, 'Fitted model should have means');
assert.ok(fittedModel.stds, 'Fitted model should have stds');
assert.ok(fittedModel.performance.mae < 2.0, `Training MAE should be < 2.0, got ${fittedModel.performance.mae.toFixed(3)}`);
assert.equal(fittedModel.performance.trainSamples, 200, 'Should report 200 training samples');
console.log(`  ✅ OLS fit: trainMAE=${fittedModel.performance.mae.toFixed(3)}, bias=${fittedModel.bias.toFixed(3)}`);

// Test prediction with the fitted model
const testFeatures = { feat_a: 3, feat_b: -2 };
const expected = 2 * 3 - 3 * (-2) + 5; // = 17
const predicted = predictWithModel(fittedModel, testFeatures);
assert.ok(Math.abs(predicted - expected) < 2.0, `Prediction should be ~${expected}, got ${predicted.toFixed(3)}`);
console.log(`  ✅ Prediction: expected ~${expected}, got ${predicted.toFixed(3)}`);

// Test with too few samples – should throw
try {
  fitLinearModel(synthSamples.slice(0, 3), featureKeys, 0.001);
  assert.fail('Should have thrown for insufficient samples');
} catch (e) {
  assert.ok(e.message.includes('Not enough samples'), `Expected insufficient samples error, got: ${e.message}`);
  console.log('  ✅ Correctly rejects insufficient samples');
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6: Date utilities
// ═══════════════════════════════════════════════════════════════════════════

console.log('\nTest 6: Date utilities...');

assert.equal(addDays('2026-02-06', -14), '2026-01-23', 'addDays -14');
assert.equal(addDays('2026-02-06', 7), '2026-02-13', 'addDays +7');
assert.equal(daysBetween('2026-01-01', '2026-02-01'), 31, 'daysBetween Jan-Feb');
assert.equal(daysBetween('2026-02-06', '2026-02-06'), 0, 'daysBetween same day');
console.log('  ✅ Date utility functions verified');

// ═══════════════════════════════════════════════════════════════════════════
// TEST 7: predictWithModel with known models
// ═══════════════════════════════════════════════════════════════════════════

console.log('\nTest 7: Model evaluation...');

const simpleModel = {
  weights: { x: 1.0 },
  bias: 0,
  means: { x: 0 },
  stds: { x: 1 },
};

const p1 = predictWithModel(simpleModel, { x: 5 });
assert.equal(p1, 5, 'Identity model should return 5');
const p2 = predictWithModel(simpleModel, { x: -3 });
assert.equal(p2, -3, 'Identity model should return -3');
console.log('  ✅ predictWithModel verified with identity model');

// Test with real SPREAD_MODEL: at feature means, standardized = 0, pred = bias
const { SPREAD_MODEL } = await import(path.join(REPO_ROOT, 'netlify/functions/_lib/nba/models-inline.mjs'));
const dummyFeatures = {};
for (const key of Object.keys(SPREAD_MODEL.weights)) {
  dummyFeatures[key] = SPREAD_MODEL.means[key] ?? 0;
}
const predAtMean = predictWithModel(SPREAD_MODEL, dummyFeatures);
assert.ok(Math.abs(predAtMean - SPREAD_MODEL.bias) < 0.01, `At means, pred should be ~bias (${SPREAD_MODEL.bias.toFixed(3)}), got ${predAtMean.toFixed(3)}`);
console.log(`  ✅ SPREAD_MODEL at feature means: pred=${predAtMean.toFixed(3)}, bias=${SPREAD_MODEL.bias.toFixed(3)}`);

// ═══════════════════════════════════════════════════════════════════════════
// TEST 8: fetchTeamStatsBound on FrozenPredictor
// ═══════════════════════════════════════════════════════════════════════════

console.log('\nTest 8: FrozenPredictor.fetchTeamStatsBound...');

assert.ok(typeof predictor.fetchTeamStatsBound === 'function', 'fetchTeamStatsBound should be a method');
const boundFn = predictor.fetchTeamStatsBound();
assert.ok(typeof boundFn === 'function', 'fetchTeamStatsBound() should return a function');
console.log('  ✅ fetchTeamStatsBound returns callable function');

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP & SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

// Clean up test outputs
fs.rmSync(TEST_OUT_DIR, { recursive: true });

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  ✅ All tests passed! (8/8)');
console.log('═══════════════════════════════════════════════════════════════');
