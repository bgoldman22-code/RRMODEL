#!/usr/bin/env node
/**
 * Debug probability distribution
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

const TRAINING_DIR = join(REPO_ROOT, 'data/nba/training');
const MODELS_DIR = join(REPO_ROOT, 'data/nba/models/phase3');

// Load models
const files = readdirSync(MODELS_DIR);
const overFile = files.filter(f => f.includes('pra_over') && f.endsWith('.json')).sort().reverse()[0];
const underFile = files.filter(f => f.includes('pra_under') && f.endsWith('.json')).sort().reverse()[0];

const overModel = JSON.parse(readFileSync(join(MODELS_DIR, overFile), 'utf-8'));
const underModel = JSON.parse(readFileSync(join(MODELS_DIR, underFile), 'utf-8'));

// Load training data
const trainingFiles = readdirSync(TRAINING_DIR).filter(f => f.startsWith('phase3_training_v1_') && f.endsWith('.jsonl'));
const file = trainingFiles.sort().reverse()[0];
const filepath = join(TRAINING_DIR, file);

const examples = [];
const lines = readFileSync(filepath, 'utf-8').split('\n').filter(l => l.trim());

for (const line of lines) {
  examples.push(JSON.parse(line));
}

// Sigmoid
function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

// Scale features
function scaleFeatures(features, mean, scale) {
  return features.map((val, i) => (val - mean[i]) / scale[i]);
}

// Predict probability
function predictProbability(example, model) {
  const { feature_columns, coefficients, intercept, scaler_mean, scaler_scale } = model;
  
  const features = feature_columns.map(col => example[col] || 0);
  const scaledFeatures = scaleFeatures(features, scaler_mean, scaler_scale);
  
  let z = intercept;
  for (let i = 0; i < scaledFeatures.length; i++) {
    z += coefficients[feature_columns[i]] * scaledFeatures[i];
  }
  
  return sigmoid(z);
}

console.log('🔍 Debugging Probability Distribution\n');
console.log(`Total examples: ${examples.length}\n`);

// Sample predictions
const probabilities = [];

for (let i = 0; i < Math.min(examples.length, 1000); i++) {
  const example = examples[i];
  
  let probability;
  if (example.side === 'Over') {
    probability = predictProbability(example, overModel);
  } else {
    probability = predictProbability(example, underModel);
  }
  
  probabilities.push(probability);
  
  if (i < 10) {
    console.log(`Example ${i + 1}:`);
    console.log(`  Market: ${example.market}`);
    console.log(`  Side: ${example.side}`);
    console.log(`  Line: ${example.line}`);
    console.log(`  Probability: ${probability.toFixed(4)}`);
    console.log(`  Result: ${example.result === 1 ? 'WIN' : 'LOSS'}`);
    console.log();
  }
}

// Distribution analysis
console.log('\n📊 Probability Distribution (first 1000 examples):');
console.log(`Min: ${Math.min(...probabilities).toFixed(4)}`);
console.log(`Max: ${Math.max(...probabilities).toFixed(4)}`);
console.log(`Mean: ${(probabilities.reduce((a, b) => a + b, 0) / probabilities.length).toFixed(4)}`);

// Histogram
const buckets = {
  '0.00-0.10': 0,
  '0.10-0.20': 0,
  '0.20-0.30': 0,
  '0.30-0.40': 0,
  '0.40-0.50': 0,
  '0.50-0.55': 0,
  '0.55-0.60': 0,
  '0.60-0.70': 0,
  '0.70-0.80': 0,
  '0.80-0.90': 0,
  '0.90-1.00': 0
};

for (const prob of probabilities) {
  if (prob < 0.10) buckets['0.00-0.10']++;
  else if (prob < 0.20) buckets['0.10-0.20']++;
  else if (prob < 0.30) buckets['0.20-0.30']++;
  else if (prob < 0.40) buckets['0.30-0.40']++;
  else if (prob < 0.50) buckets['0.40-0.50']++;
  else if (prob < 0.55) buckets['0.50-0.55']++;
  else if (prob < 0.60) buckets['0.55-0.60']++;
  else if (prob < 0.70) buckets['0.60-0.70']++;
  else if (prob < 0.80) buckets['0.70-0.80']++;
  else if (prob < 0.90) buckets['0.80-0.90']++;
  else buckets['0.90-1.00']++;
}

console.log('\nHistogram:');
for (const [bucket, count] of Object.entries(buckets)) {
  const pct = (count / probabilities.length * 100).toFixed(1);
  const bar = '█'.repeat(Math.floor(count / 20));
  console.log(`  ${bucket}: ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
}

console.log(`\n⚠️  Bets at 0.55 threshold: ${probabilities.filter(p => p >= 0.55).length} / ${probabilities.length}`);
console.log(`   That's only ${(probabilities.filter(p => p >= 0.55).length / probabilities.length * 100).toFixed(1)}%`);
