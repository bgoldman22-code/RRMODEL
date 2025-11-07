#!/usr/bin/env node
/**
 * Manual V5 Bundle Upload
 * Uploads the local bundle_v5.json to Netlify Blobs
 * Use this to manually sync when scheduled function isn't working
 */

import { getStore } from '@netlify/blobs'
import fs from 'fs'

const BUNDLE_PATH = 'nfl-model-v4.1/output/bundle_v5.json'
const LATEST_KEY = 'predictions/latest.json'
const SUMMARY_KEY = 'predictions/summary.json'

async function uploadBundle() {
  console.log('📦 Reading V5 bundle...')
  
  if (!fs.existsSync(BUNDLE_PATH)) {
    console.error(`❌ Bundle not found at ${BUNDLE_PATH}`)
    console.log('💡 Run: node nfl-model-v4.1/scripts/12-make-public-bundle-v5.mjs')
    process.exit(1)
  }

  const bundle = JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'))
  console.log(`✅ Loaded bundle: ${bundle.rows.length} games for Week ${bundle.meta.week}`)

  const store = getStore({
    name: 'nfl-v5',
    consistency: 'strong',
    siteID: process.env.SITE_ID || process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN || process.env.NETLIFY_API_TOKEN
  })

  // Upload as latest
  console.log('☁️ Uploading to nfl-v5/predictions/latest.json...')
  await store.set(LATEST_KEY, JSON.stringify(bundle))

  // Upload date-specific copy
  const today = new Date().toISOString().split('T')[0]
  const dateKey = `predictions/${today}/bundle.json`
  console.log(`☁️ Uploading to nfl-v5/${dateKey}...`)
  await store.set(dateKey, JSON.stringify(bundle))

  // Update summary
  const summary = {
    last_update: new Date().toISOString(),
    games_count: bundle.rows.length,
    week: bundle.meta.week,
    season: bundle.meta.season,
    model_version: 'v5',
    models: bundle.meta.models,
    uploaded_by: 'manual_script'
  }
  console.log('☁️ Updating summary metadata...')
  await store.set(SUMMARY_KEY, JSON.stringify(summary))

  console.log('✅ Upload complete!')
  console.log(`📊 ${bundle.rows.length} games for Week ${bundle.meta.week}`)
  console.log(`🔗 Available at: /.netlify/functions/nfl-v5-latest`)
  console.log(`📅 Last updated: ${summary.last_update}`)
}

uploadBundle().catch(err => {
  console.error('❌ Upload failed:', err)
  process.exit(1)
})
