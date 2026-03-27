#!/usr/bin/env node
/**
 * F5 ML — Upload picks JSON to Netlify Blobs.
 *
 * Usage:
 *   node scripts/mlb_f5/upload_to_blobs.mjs \
 *     --file  tmp/f5_ml_out/2026-04-10_morning.json \
 *     --label morning \
 *     --date  2026-04-10
 *
 * Keys written:
 *   mlb/f5_ml/2026-04-10_morning.json        (snapshot)
 *   mlb/f5_ml/latest.json                    (only if pick_count > 0)
 *
 * Requires env:
 *   NETLIFY_SITE_ID, NETLIFY_TOKEN (or NETLIFY_AUTH_TOKEN)
 */

import fs from "fs";
import { getStore } from "@netlify/blobs";

// ──────────────────────────────────────────────────────────────
// CREDENTIALS
// ──────────────────────────────────────────────────────────────
const siteID =
  process.env.NETLIFY_SITE_ID ||
  process.env.NETLIFY_BLOBS_SITE_ID ||
  process.env.SITE_ID;
const token =
  process.env.NETLIFY_AUTH_TOKEN ||
  process.env.NETLIFY_TOKEN ||
  process.env.NETLIFY_BLOBS_TOKEN;

if (!siteID || !token) {
  console.error("❌  Missing NETLIFY_SITE_ID / NETLIFY_TOKEN");
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────
// PARSE CLI
// ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

const filePath = flag("--file");
const label    = flag("--label");
const dateStr  = flag("--date");

if (!filePath || !label || !dateStr) {
  console.error("Usage: upload_to_blobs.mjs --file <path> --label <label> --date YYYY-MM-DD");
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────
// VALIDATE
// ──────────────────────────────────────────────────────────────
if (!fs.existsSync(filePath)) {
  console.error(`❌  File not found: ${filePath}`);
  process.exit(1);
}

const raw  = fs.readFileSync(filePath, "utf-8");
const data = JSON.parse(raw);

// Hard gates
const errors = [];
if (!data.schema_version) errors.push("missing schema_version");
if (!data.model_id) errors.push("missing model_id");
if (!data.generated_at) errors.push("missing generated_at");
if (!data.thresholds) errors.push("missing thresholds");
if (data.thresholds?.ev_min !== 0.1) errors.push(`ev_min=${data.thresholds?.ev_min} != 0.1`);
if (data.thresholds?.edge_min !== 0.07) errors.push(`edge_min=${data.thresholds?.edge_min} != 0.07`);

// Check every pick has finite values
for (const [i, p] of (data.picks || []).entries()) {
  for (const k of ["odds_decimal", "p_model", "ev", "edge"]) {
    if (typeof p[k] !== "number" || !isFinite(p[k])) {
      errors.push(`pick[${i}].${k} = ${p[k]} (not finite)`);
    }
  }
}

if (errors.length > 0) {
  console.error(`❌  Validation failed:\n  • ${errors.join("\n  • ")}`);
  process.exit(1);
}

const pickCount = data.meta?.total_picks ?? data.picks?.length ?? 0;

// ──────────────────────────────────────────────────────────────
// UPLOAD
// ──────────────────────────────────────────────────────────────
const STORE_NAME = process.env.BLOBS_STORE || "rrmodelblobs";
const store = getStore({ name: STORE_NAME, siteID, token });

async function main() {
  const snapshotKey = `mlb/f5_ml/${dateStr}_${label}.json`;

  console.log(`☁️   Uploading F5 ML picks to Netlify Blobs…`);
  console.log(`  Store:    ${STORE_NAME}`);
  console.log(`  Snapshot: ${snapshotKey}  (${pickCount} picks)`);

  // 1) Always upload the dated snapshot (with metadata for reliable de-dupe)
  await store.set(snapshotKey, raw, {
    contentType: "application/json",
    metadata: {
      generated_at: data.generated_at || new Date().toISOString(),
      pick_count: String(pickCount),
      label,
      date: dateStr,
      model_id: data.model_id || "unknown",
    },
  });
  console.log(`  ✅  ${snapshotKey}`);

  // 2) Always overwrite latest so the frontend knows we ran today
  const latestKey = "mlb/f5_ml/latest.json";
  await store.set(latestKey, raw, { contentType: "application/json" });
  console.log(`  ✅  ${latestKey}  (updated — ${pickCount} picks)`);

  // 3) Summary line
  console.log(
    `\nF5 ML: ran ${label} for ${dateStr}, picks=${pickCount}, ` +
    `firstPitch=${data.schedule_context?.first_pitch_et || "?"}, ` +
    `lastPitch=${data.schedule_context?.last_pitch_et || "?"}, ` +
    `published=YES`
  );
}

main().catch((e) => {
  console.error("❌  Upload error:", e);
  process.exit(1);
});
