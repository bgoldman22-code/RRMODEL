#!/usr/bin/env node
/**
 * scripts/upload_v5_now.mjs
 * 
 * Uploads the V5 bundle to Netlify Blobs storage
 * Can be run:
 * 1. Locally with Netlify CLI: `netlify env:import && node scripts/upload_v5_now.mjs`
 * 2. As a Netlify Function: via nfl-v5-upload endpoint
 * 3. In a GitHub Action: with NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID
 */

import { getStore } from "@netlify/blobs";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function uploadV5Bundle() {
  try {
    console.log("🚀 NFL V5 Bundle Upload");
    console.log("=".repeat(50));
    
    // Read the bundle file
    const bundlePath = join(__dirname, "nfl-model-v4.1/output/bundle_v5.json");
    console.log(`📖 Reading bundle from: ${bundlePath}`);
    
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    
    console.log(`✅ Bundle loaded:`);
    console.log(`   - Week: ${bundle.meta?.week}`);
    console.log(`   - Season: ${bundle.meta?.season}`);
    console.log(`   - Games: ${bundle.rows?.length}`);
    console.log(`   - Updated: ${bundle.meta?.updated_at}`);
    
    // Initialize Netlify Blobs store
    const store = getStore("nfl-v5");
    
    // Upload to latest
    console.log("\n📤 Uploading to Netlify Blobs...");
    await store.set("predictions/latest.json", JSON.stringify(bundle));
    console.log("✅ Uploaded: predictions/latest.json");
    
    // Upload to date-specific archive
    const today = new Date().toISOString().split("T")[0];
    await store.set(`predictions/${today}.json`, JSON.stringify(bundle));
    console.log(`✅ Uploaded: predictions/${today}.json`);
    
    // Upload to week-specific archive
    const weekKey = `predictions/${bundle.meta.season}-week${bundle.meta.week}.json`;
    await store.set(weekKey, JSON.stringify(bundle));
    console.log(`✅ Uploaded: ${weekKey}`);
    
    // Update summary metadata
    const summary = {
      lastUpdate: new Date().toISOString(),
      gamesCount: bundle.rows?.length || 0,
      modelVersion: bundle.meta?.modelVersion || "v5",
      week: bundle.meta?.week,
      season: bundle.meta?.season
    };
    await store.set("predictions/summary.json", JSON.stringify(summary));
    console.log("✅ Uploaded: predictions/summary.json");
    
    // Success summary
    console.log("\n" + "=".repeat(50));
    console.log("✅ Upload complete!");
    console.log(`📊 ${bundle.rows?.length} games for Week ${bundle.meta?.week}`);
    console.log(`📅 Date: ${today}`);
    console.log(`🎯 Model: ${bundle.meta?.modelVersion}`);
    console.log("\n🌐 Available at:");
    console.log("   - /.netlify/functions/nfl-v5-latest");
    console.log(`   - /.netlify/functions/nfl-v5-by-date?date=${today}`);
    
    return {
      success: true,
      gamesCount: bundle.rows?.length,
      week: bundle.meta?.week,
      date: today
    };
  } catch (error) {
    console.error("\n❌ Upload failed:", error.message);
    console.error(error.stack);
    
    if (error.message.includes("siteID") || error.message.includes("token")) {
      console.error("\n💡 Missing Netlify credentials.");
      console.error("   Run: netlify env:import");
      console.error("   Or set: NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID");
    }
    
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  uploadV5Bundle()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { uploadV5Bundle };
