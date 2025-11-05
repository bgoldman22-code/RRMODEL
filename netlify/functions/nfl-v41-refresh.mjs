// netlify/functions/nfl-v41-refresh.mjs
// Scheduled function to generate V4.1 predictions and store to blobs
// Runs daily, independent from legacy NFL functions

import { getStore, LATEST_KEY, SUMMARY_KEY, keyForDate } from './_lib/blobs-nfl-v41.mjs';
import { $ } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';

export const config = {
  schedule: '@daily'
};

export default async function handler(req, context) {
  const startTime = Date.now();
  console.log('🚀 NFL V4.1 Prediction Refresh Started');
  
  try {
    const store = getStore();
    
    // STEP 1: Run V4.1 prediction pipeline
    console.log('📊 Step 1: Running V4.1 prediction pipeline...');
    
    // Note: These scripts must be updated to use live 2025 data
    // For now they use 2024 holdout; production needs real-time features
    
    try {
      await $`node nfl-model-v4.1/scripts/04-predict-spread.mjs`;
      console.log('✅ Spread predictions generated');
    } catch (error) {
      console.error('❌ Spread prediction failed:', error.message);
      throw new Error(`Spread prediction failed: ${error.message}`);
    }
    
    try {
      await $`node nfl-model-v4.1/scripts/05-predict-total.mjs`;
      console.log('✅ Total predictions generated');
    } catch (error) {
      console.error('❌ Total prediction failed:', error.message);
      throw new Error(`Total prediction failed: ${error.message}`);
    }
    
    try {
      await $`node nfl-model-v4.1/scripts/12-predict-ml-direct.mjs`;
      console.log('✅ ML predictions generated');
    } catch (error) {
      console.error('❌ ML prediction failed:', error.message);
      throw new Error(`ML prediction failed: ${error.message}`);
    }
    
    try {
      await $`node nfl-model-v4.1/scripts/12-make-public-bundle.mjs`;
      console.log('✅ Bundle created');
    } catch (error) {
      console.error('❌ Bundle creation failed:', error.message);
      throw new Error(`Bundle creation failed: ${error.message}`);
    }
    
    // STEP 2: Read generated bundle
    console.log('📦 Step 2: Reading generated bundle...');
    const bundlePath = path.join(process.cwd(), 'nfl-model-v4.1', 'output', 'bundle.json');
    const bundleContent = await fs.readFile(bundlePath, 'utf8');
    const bundle = JSON.parse(bundleContent);
    
    if (!bundle.rows || bundle.rows.length === 0) {
      throw new Error('Generated bundle has no games');
    }
    
    console.log(`📊 Bundle contains ${bundle.rows.length} games`);
    
    // STEP 3: Store to blobs
    console.log('💾 Step 3: Storing to blobs...');
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
    
    await store.set(LATEST_KEY, bundleContent, { 
      metadata: { 
        type: 'application/json',
        updated: now.toISOString()
      }
    });
    console.log('✅ Stored to latest.json');
    
    await store.set(keyForDate(dateKey), bundleContent, {
      metadata: {
        type: 'application/json',
        date: dateKey,
        archived: now.toISOString()
      }
    });
    console.log(`✅ Stored to ${dateKey}/bundle.json`);
    
    // STEP 4: Update summary
    const summary = {
      updated_at: now.toISOString(),
      date_key: dateKey,
      games: bundle.rows.length,
      model_version: bundle.meta.model || 'NFL-V4.1',
      spread_source: bundle.meta.spread_source,
      total_source: bundle.meta.total_source,
      ml_source: bundle.meta.ml_source,
      duration_ms: Date.now() - startTime
    };
    
    await store.set(SUMMARY_KEY, JSON.stringify(summary), {
      metadata: { type: 'application/json' }
    });
    console.log('✅ Updated summary');
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n🎉 NFL V4.1 Refresh Complete in ${duration}s`);
    console.log(`📊 ${bundle.rows.length} games published`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        summary,
        message: `V4.1 predictions refreshed successfully. ${bundle.rows.length} games published.`
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`❌ NFL V4.1 Refresh Failed after ${duration}s:`, error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        stack: error.stack,
        duration_ms: Date.now() - startTime
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
