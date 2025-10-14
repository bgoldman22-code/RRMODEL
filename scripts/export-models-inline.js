#!/usr/bin/env node

/**
 * Export Elite Models to Inline JSON
 * Makes them easy to bundle without file system access
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function exportModels() {
  // Load the elite models
  const spreadPath = path.join(__dirname, '../netlify/functions/_lib/nba/models/artifacts/spread_model_elite.json');
  const totalPath = path.join(__dirname, '../netlify/functions/_lib/nba/models/artifacts/total_model_simple.json');
  
  const spreadModel = JSON.parse(await fs.readFile(spreadPath, 'utf8'));
  const totalModel = JSON.parse(await fs.readFile(totalPath, 'utf8'));
  
  // Create inline export
  const output = `/**
 * NBA Elite Models - Inline Export
 * Spread: 11.606 MAE (55 features)
 * Total: 15.89 MAE (18 features)
 */

export const SPREAD_MODEL = ${JSON.stringify(spreadModel, null, 2)};

export const TOTAL_MODEL = ${JSON.stringify(totalModel, null, 2)};
`;

  const outputPath = path.join(__dirname, '../netlify/functions/_lib/nba/models-inline.mjs');
  await fs.writeFile(outputPath, output);
  
  console.log('✅ Models exported to models-inline.mjs');
  console.log(`   Spread features: ${Object.keys(spreadModel.weights).length}`);
  console.log(`   Total features: ${Object.keys(totalModel.weights).length}`);
}

exportModels().catch(console.error);
