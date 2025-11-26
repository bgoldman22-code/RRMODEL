#!/usr/bin/env node
/**
 * Phase 3.5 - LightGBM v1 vs v2 Backtest (Points & Rebounds)
 *
 * Compares production LightGBM v1 models against the new line-aware v2 models
 * on the Phase 3.5 test set (temporal 80/20 split) for player_points and
 * player_rebounds markets (Over/Under).
 *
 * Outputs bucketed win-rate/ROI statistics plus per-record predictions, then
 * prints a short console summary so ops can decide whether to ship v2.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

import { augmentLineAwareFeatures } from './_lib/line-feature-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..', '..');

const TRAINING_FILE = path.join(REPO_ROOT, 'data', 'nba', 'training', 'phase3_training_v1_20251124.jsonl');
const MODEL_DIR = path.join(REPO_ROOT, 'data', 'nba', 'models', 'phase3_lgbm');
const OUTPUT_JSON = path.join(REPO_ROOT, 'data', 'nba', 'backtests', `phase3.5_lgbm_v1_vs_v2_${getToday()}.json`);

const MODEL_DEFS = [
  { key: 'points_over', market: 'player_points', side: 'Over' },
  { key: 'points_under', market: 'player_points', side: 'Under' },
  { key: 'rebounds_over', market: 'player_rebounds', side: 'Over' },
  { key: 'rebounds_under', market: 'player_rebounds', side: 'Under' }
];

const BUCKETS = [
  { label: '0.50-0.55', min: 0.50, max: 0.55 },
  { label: '0.55-0.60', min: 0.55, max: 0.60 },
  { label: '0.60-0.65', min: 0.60, max: 0.65 },
  { label: '0.65-0.70', min: 0.65, max: 0.70 },
  { label: '0.70-0.75', min: 0.70, max: 0.75 },
  { label: '0.75+', min: 0.75, max: 1.01 }
];

const THRESHOLDS = {
  player_points: 0.60,
  player_rebounds: 0.52
};

const PAYOUT = 0.9091; // Net profit on a -110 win per 1u stake

async function main() {
  console.log('==============================================================');
  console.log('Phase 3.5 LightGBM v1 vs v2 Backtest (Points/Rebounds)');
  console.log('==============================================================');

  const examples = loadAndPrepareExamples();
  console.log(`Loaded ${examples.length.toLocaleString()} filtered examples`);

  const { train, test } = temporalSplit(examples, 0.2);
  console.log(`Train set: ${train.length.toLocaleString()} (${train[0].date} → ${train[train.length - 1].date})`);
  console.log(`Test set:  ${test.length.toLocaleString()} (${test[0].date} → ${test[test.length - 1].date})`);

  const metadata = loadModelMetadata();
  const predictionMap = await generatePredictions(test, metadata);

  const records = buildRecords(test, predictionMap);
  const bucketStats = computeBucketStats(records);
  const thresholdSummary = computeThresholdSummary(records);

  const report = {
    generated_at: new Date().toISOString(),
    training_file: path.relative(REPO_ROOT, TRAINING_FILE),
    test_size: test.length,
    test_date_range: [test[0].date, test[test.length - 1].date],
    buckets: bucketStats,
    thresholds: thresholdSummary,
    records
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
  console.log(`\n✅ Saved backtest report JSON → ${path.relative(REPO_ROOT, OUTPUT_JSON)}`);

  printConsoleSummary(thresholdSummary);
}

function loadAndPrepareExamples() {
  if (!fs.existsSync(TRAINING_FILE)) {
    throw new Error(`Training file not found: ${TRAINING_FILE}`);
  }

  const lines = fs.readFileSync(TRAINING_FILE, 'utf-8').split('\n').filter(Boolean);
  const filtered = [];

  for (const line of lines) {
    const record = JSON.parse(line);
    if (record.market !== 'player_points' && record.market !== 'player_rebounds') continue;
    if (record.side !== 'Over' && record.side !== 'Under') continue;

    sanitizeNumericFields(record);
    augmentLineAwareFeatures(record, record.market, record.line);
    filtered.push(record);
  }

  if (filtered.length === 0) {
    throw new Error('No examples found for requested markets');
  }

  // Sort chronologically just in case
  filtered.sort((a, b) => a.date.localeCompare(b.date));
  return filtered;
}

function sanitizeNumericFields(record) {
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'number') continue;
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      record[key] = Number(value);
    }
  }
  if (typeof record.result === 'string') {
    record.result = Number(record.result);
  }
  record.line = Number(record.line);
}

function temporalSplit(examples, testRatio) {
  const splitIdx = Math.floor(examples.length * (1 - testRatio));
  return {
    train: examples.slice(0, splitIdx),
    test: examples.slice(splitIdx)
  };
}

function loadModelMetadata() {
  const metadata = {};

  for (const def of MODEL_DEFS) {
    metadata[`${def.key}_v1`] = readMetadata(def.key, 'v1');
    metadata[`${def.key}_v2`] = readMetadata(def.key, 'v2');
  }

  return metadata;
}

function readMetadata(baseKey, versionTag) {
  const prefix = `${baseKey}_${versionTag}_`;
  const candidates = fs.readdirSync(MODEL_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .sort();

  if (candidates.length === 0) {
    throw new Error(`No metadata files found for ${baseKey} ${versionTag}`);
  }

  const metadataPath = path.join(MODEL_DIR, candidates[candidates.length - 1]);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

  return {
    model_id: `${baseKey}_${versionTag}`,
    market: metadata.market,
    side: metadata.side,
    feature_columns: metadata.feature_columns,
    model_path: path.join(MODEL_DIR, metadata.model_file)
  };
}

async function generatePredictions(testExamples, metadata) {
  const requests = [];
  const requestMeta = new Map();
  const modelsPayload = {};

  for (const meta of Object.values(metadata)) {
    modelsPayload[meta.model_id] = { model_path: meta.model_path };
  }

  for (const record of testExamples) {
    const modelKey = MODEL_DEFS.find(def => def.market === record.market && def.side === record.side)?.key;
    if (!modelKey) continue;

    const exampleId = record.id || `${record.date}_${record.player || record.playerName || 'unknown'}_${record.market}_${record.side}_${record.line}`;
    record.__exampleId = exampleId;

    for (const version of ['v1', 'v2']) {
      const meta = metadata[`${modelKey}_${version}`];
      const features = buildFeatureVector(record, meta.feature_columns);
      const requestId = `${exampleId}__${version}`;
      requests.push({ request_id: requestId, model_id: meta.model_id, features });
      requestMeta.set(requestId, { exampleId, version });
    }
  }

  const pythonCode = `import json, sys, lightgbm as lgb, numpy as np\n` +
    `payload = json.load(sys.stdin)\n` +
    `models = {}` +
    `\nfor model_id, cfg in payload['models'].items():\n` +
    `    models[model_id] = lgb.Booster(model_file=cfg['model_path'])\n` +
    `results = []\n` +
    `for req in payload['requests']:\n` +
    `    booster = models[req['model_id']]\n` +
    `    arr = np.array([req['features']], dtype=float)\n` +
    `    prob = float(booster.predict(arr)[0])\n` +
    `    results.append({'request_id': req['request_id'], 'probability': prob})\n` +
    `json.dump(results, sys.stdout)\n`;

  const proc = spawnSync('python3', ['-c', pythonCode], {
    input: JSON.stringify({ models: modelsPayload, requests }),
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 200,
    cwd: REPO_ROOT
  });

  if (proc.error) {
    throw proc.error;
  }
  if (proc.status !== 0) {
    throw new Error(`Python prediction script failed: ${proc.stderr}`);
  }

  const results = JSON.parse(proc.stdout || '[]');
  const predictionMap = new Map();

  for (const res of results) {
    const meta = requestMeta.get(res.request_id);
    if (!meta) continue;
    const key = `${meta.exampleId}__${meta.version}`;
    predictionMap.set(key, res.probability);
  }

  return predictionMap;
}

function buildFeatureVector(record, featureColumns) {
  return featureColumns.map(col => {
    const val = record[col];
    if (val === undefined || val === null) return 0;
    const num = Number(val);
    return Number.isFinite(num) ? num : 0;
  });
}

function buildRecords(testExamples, predictionMap) {
  return testExamples.map(record => {
    const exampleId = record.__exampleId;
    const p_v1 = predictionMap.get(`${exampleId}__v1`) ?? null;
    const p_v2 = predictionMap.get(`${exampleId}__v2`) ?? null;

    return {
      id: exampleId,
      date: record.date,
      player: record.player || record.playerName || 'Unknown',
      market: record.market,
      side: record.side,
      line: record.line,
      result: record.result,
      p_v1,
      p_v2,
      edge_v1: p_v1 !== null ? expectedValue(p_v1) : null,
      edge_v2: p_v2 !== null ? expectedValue(p_v2) : null
    };
  }).filter(r => r.p_v1 !== null && r.p_v2 !== null);
}

function expectedValue(prob) {
  return prob * PAYOUT - (1 - prob);
}

function computeBucketStats(records) {
  const stats = {
    player_points: { v1: bucketSkeleton(), v2: bucketSkeleton() },
    player_rebounds: { v1: bucketSkeleton(), v2: bucketSkeleton() }
  };

  for (const bucket of BUCKETS) {
    for (const market of Object.keys(stats)) {
      for (const version of ['v1', 'v2']) {
        const subset = records.filter(r => r.market === market && r[`p_${version}`] >= bucket.min && r[`p_${version}`] < bucket.max);
        stats[market][version].push(calcBucketMetrics(bucket.label, subset, version));
      }
    }
  }

  return stats;
}

function bucketSkeleton() {
  return [];
}

function calcBucketMetrics(label, subset, version) {
  if (subset.length === 0) {
    return {
      label,
      bets: 0,
      wins: 0,
      win_rate: 0,
      roi: 0,
      avg_probability: 0
    };
  }

  const wins = subset.reduce((acc, r) => acc + (r.result || 0), 0);
  const bets = subset.length;
  const winRate = wins / bets;
  const profit = wins * PAYOUT - (bets - wins);
  const roi = profit / bets;
  const avgProb = subset.reduce((acc, r) => acc + (r[`p_${version}`] || 0), 0) / bets;

  return {
    label,
    bets,
    wins,
    win_rate: winRate,
    roi,
    avg_probability: avgProb
  };
}

function computeThresholdSummary(records) {
  const summary = {};

  for (const [market, threshold] of Object.entries(THRESHOLDS)) {
    summary[market] = {};
    for (const version of ['v1', 'v2']) {
      const subset = records.filter(r => r.market === market && r[`p_${version}`] >= threshold);
      const wins = subset.reduce((acc, r) => acc + (r.result || 0), 0);
      const bets = subset.length;
      const winRate = bets > 0 ? wins / bets : 0;
      const profit = wins * PAYOUT - (bets - wins);
      const roi = bets > 0 ? profit / bets : 0;
      summary[market][version] = {
        threshold,
        bets,
        wins,
        win_rate: winRate,
        roi
      };
    }
  }

  return summary;
}

function printConsoleSummary(thresholdSummary) {
  console.log('\nBacktest complete.');
  console.log('\nPoints: v1 vs v2 (test set)');
  printThresholdLine(thresholdSummary.player_points, 0.60);
  console.log('\nRebounds: v1 vs v2 (test set)');
  printThresholdLine(thresholdSummary.player_rebounds, 0.52);
  console.log(`\nSee ${path.relative(REPO_ROOT, OUTPUT_JSON)} for full details.`);
}

function printThresholdLine(summary, threshold) {
  const v1 = summary.v1;
  const v2 = summary.v2;
  console.log(`  v1 ROI (p>=${threshold.toFixed(2)}): ${formatPercent(v1.roi)} (${v1.bets} bets)`);
  console.log(`  v2 ROI (p>=${threshold.toFixed(2)}): ${formatPercent(v2.roi)} (${v2.bets} bets)`);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${(value * 100).toFixed(2)}%`;
}

function getToday() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

main().catch(err => {
  console.error('❌ Backtest failed:', err.message);
  process.exit(1);
});
