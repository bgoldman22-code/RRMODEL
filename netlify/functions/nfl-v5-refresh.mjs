import { $ } from 'zx'
import { getV5Store, LATEST_KEY, keyForDate, SUMMARY_KEY } from './_lib/blobs-nfl-v5.mjs'
import fs from 'fs'

// Scheduled Function: Daily V5 Prediction Refresh
// Runs V5 pipeline: spread (Poisson EPA) + total (quantile) + bundle merger
// Schedule: 09:00 UTC daily (configured in netlify.toml)

export default async (req, context) => {
  const startTime = Date.now()
  console.log('🚀 Starting V5 prediction refresh...')

  try {
    // Step 1: Generate spread predictions (Poisson EPA V3 model)
    console.log('📊 Step 1: Generating spread predictions...')
    await $`node nfl-model-v4.1/scripts/04-predict-spread.mjs`

    // Step 2: Generate quantile-based total predictions
    console.log('📊 Step 2: Generating quantile total predictions...')
    await $`node nfl-model-v4.1/scripts/05b-predict-total-quantile.mjs`

    // Step 3: Build V5 hybrid bundle (spread + total, no ML)
    console.log('🔧 Step 3: Building V5 hybrid bundle...')
    await $`node nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs`

    // Step 4: Upload to blob storage
    console.log('☁️ Step 4: Uploading to blob storage...')
    const bundlePath = 'nfl-model-v4.1/output/bundle_v5.json'
    
    if (!fs.existsSync(bundlePath)) {
      throw new Error('Bundle file not created')
    }

    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'))
    const store = getV5Store()
    const today = new Date().toISOString().split('T')[0]

    // Store as latest
    await store.set(LATEST_KEY, JSON.stringify(bundle))

    // Store date-specific copy
    await store.set(keyForDate(today), JSON.stringify(bundle))

    // Update summary metadata
    const summary = {
      last_update: new Date().toISOString(),
      games_count: bundle.rows.length,
      model_version: 'v5',
      models: bundle.meta.models,
      duration_ms: Date.now() - startTime
    }
    await store.set(SUMMARY_KEY, JSON.stringify(summary))

    console.log(`✅ V5 refresh complete in ${summary.duration_ms}ms`)
    console.log(`📦 Published ${bundle.rows.length} games to nfl-v5 bucket`)

    return new Response(JSON.stringify({
      success: true,
      games: bundle.rows.length,
      duration_ms: summary.duration_ms,
      version: 'v5'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ V5 refresh failed:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      duration_ms: Date.now() - startTime
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export const config = {
  schedule: '0 9 * * *' // 09:00 UTC daily
}
