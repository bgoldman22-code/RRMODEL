#!/usr/bin/env node
/**
 * One-time seed: Upload F5 ML feature/odds data to Netlify Blobs.
 *
 * Usage (requires Netlify credentials):
 *   NETLIFY_SITE_ID=xxx NETLIFY_TOKEN=yyy \
 *     node scripts/mlb_f5/seed_data_to_blobs.mjs \
 *       --features /path/to/features_v2.parquet \
 *       --odds-dir /path/to/mlb_odds/derived/f5_ml
 *
 * Keys written:
 *   mlb/f5_ml/data/features_v2.parquet
 *   mlb/f5_ml/data/consensus_2023.parquet
 *   mlb/f5_ml/data/consensus_2024.parquet
 *   mlb/f5_ml/data/consensus_2025.parquet
 *   mlb/f5_ml/data/consensus_2026.parquet  (if exists)
 */

import fs from "fs";
import path from "path";
import { getStore } from "@netlify/blobs";

const siteID = process.env.NETLIFY_SITE_ID;
const token =
  process.env.NETLIFY_AUTH_TOKEN ||
  process.env.NETLIFY_TOKEN ||
  process.env.NETLIFY_BLOBS_TOKEN;

if (!siteID || !token) {
  console.error("❌  Set NETLIFY_SITE_ID and NETLIFY_TOKEN");
  process.exit(1);
}

const store = getStore({ name: "rrmodelblobs", siteID, token });

// Parse CLI
const args = process.argv.slice(2);
function flag(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

const featuresPath = flag("--features");
const oddsDir = flag("--odds-dir");

if (!featuresPath || !oddsDir) {
  console.error("Usage: node seed_data_to_blobs.mjs --features <path> --odds-dir <dir>");
  process.exit(1);
}

async function upload(key, filePath) {
  const buf = fs.readFileSync(filePath);
  const sizeKB = (buf.length / 1024).toFixed(0);
  await store.set(key, buf, { contentType: "application/octet-stream" });
  console.log(`  ✅  ${key}  (${sizeKB} KB)`);
}

async function main() {
  console.log("🚀  Seeding F5 ML data to Netlify Blobs…\n");

  // Features
  await upload("mlb/f5_ml/data/features_v2.parquet", featuresPath);

  // Consensus odds
  const files = fs.readdirSync(oddsDir).filter((f) => f.startsWith("consensus_") && f.endsWith(".parquet"));
  for (const f of files.sort()) {
    await upload(`mlb/f5_ml/data/${f}`, path.join(oddsDir, f));
  }

  console.log("\n✅  Seed complete.");
}

main().catch((e) => {
  console.error("❌ ", e);
  process.exit(1);
});
