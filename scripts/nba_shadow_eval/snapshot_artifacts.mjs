/**
 * Shadow Eval – Snapshot Model Artifacts
 * 
 * Copies current model artifacts into ./shadow_eval/artifacts/<version>/
 * so the shadow evaluator can replay predictions with frozen weights.
 * 
 * SAFETY: Requires SHADOW_EVAL=1. Never imported by production code.
 * 
 * Usage:
 *   SHADOW_EVAL=1 node scripts/nba_shadow_eval/snapshot_artifacts.mjs --version v_current
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Safety guard ────────────────────────────────────────────────────────────
if (process.env.SHADOW_EVAL !== '1') {
  console.error('❌ SHADOW_EVAL=1 required. This script is isolated from production.');
  process.exit(1);
}

// ── Parse args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const version = getArg('--version');
if (!version) {
  console.error('Usage: SHADOW_EVAL=1 node snapshot_artifacts.mjs --version <name>');
  process.exit(1);
}

// ── Paths ───────────────────────────────────────────────────────────────────
const repoRoot = path.resolve(__dirname, '../../');
const sourceDir = path.join(repoRoot, 'netlify/functions/_lib/nba');
const destDir = path.join(repoRoot, 'shadow_eval/artifacts', version);

const ARTIFACTS = [
  'models-inline.mjs',
  'rci-adjustments.mjs',
  'rci-core.mjs',
  'team-priors-2024-25.mjs',
  'injury-adjustments.mjs',
];

// ── Copy ────────────────────────────────────────────────────────────────────
fs.mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const file of ARTIFACTS) {
  const src = path.join(sourceDir, file);
  const dst = path.join(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`  ✅ ${file}`);
    copied++;
  } else {
    console.warn(`  ⚠️  ${file} not found at ${src} – skipping`);
  }
}

// Write a small metadata file
const meta = {
  version,
  snapshotted_at: new Date().toISOString(),
  files: ARTIFACTS.filter(f => fs.existsSync(path.join(sourceDir, f))),
  source: sourceDir,
};
fs.writeFileSync(path.join(destDir, 'snapshot_meta.json'), JSON.stringify(meta, null, 2));

console.log(`\n✅ Snapshot "${version}" saved to ${destDir} (${copied}/${ARTIFACTS.length} files)`);
