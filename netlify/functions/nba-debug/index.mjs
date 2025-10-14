/**
 * NBA Debug Function - Check what's available in deployment
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async (request, context) => {
  try {
    const checks = {};
    
    // Check if data directory exists
    const dataPath = path.join(__dirname, '../../../data/nba/games/games_2024_25.json');
    checks.dataPath = dataPath;
    checks.dataExists = fs.existsSync(dataPath);
    
    if (checks.dataExists) {
      const data = fs.readFileSync(dataPath, 'utf8');
      const games = JSON.parse(data);
      checks.gamesCount = games.length;
    }
    
    // Check if models exist
    const modelPath = path.join(__dirname, '../_lib/nba/models/artifacts/spread_model_elite.json');
    checks.modelPath = modelPath;
    checks.modelExists = fs.existsSync(modelPath);
    
    // Check if predict-elite exists
    const predictPath = path.join(__dirname, '../_lib/nba/predict-elite.mjs');
    checks.predictExists = fs.existsSync(predictPath);
    
    // Try to import predict-elite
    try {
      const { loadModels } = await import('../_lib/nba/predict-elite.mjs');
      checks.canImport = true;
      
      // Try to load models
      const models = await loadModels();
      checks.modelsLoaded = true;
    } catch (error) {
      checks.canImport = false;
      checks.importError = error.message;
    }
    
    return new Response(JSON.stringify({
      ok: true,
      checks,
      __dirname,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME
      }
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error.message,
      stack: error.stack
    }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
