// scripts/prebuild-inject-odds.mjs
// Hotfix: add WRAPPER KILL-SWITCH and stop deploying the original as a separate function.
// - If process.env.DISABLE_ODDS_WRAPPER === "1", we restore the original and skip wrapper.
// - Otherwise, we move the original into netlify/functions/_lib/_orig (NOT bundled by Netlify),
//   and install the wrapper as netlify/functions/mlb-slate-lite.mjs.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fnDir = path.resolve(process.cwd(), "netlify", "functions");
const libDir = path.join(fnDir, "_lib");
const stashDir = path.join(libDir, "_orig");

const targetMjs = path.join(fnDir, "mlb-slate-lite.mjs");
const targetCjs = path.join(fnDir, "mlb-slate-lite.cjs");
const stashMjs = path.join(stashDir, "mlb-slate-lite_orig.mjs");
const stashCjs = path.join(stashDir, "mlb-slate-lite_orig.cjs");
const wrapperTemplate = path.join(libDir, "mlb-slate-lite.wrapper.template.mjs");

function exists(p){ try { fs.accessSync(p); return true; } catch { return false; } }

function ensureDir(p){ fs.mkdirSync(p, { recursive: true }); }

function alreadyWrapped() {
  const t = exists(targetMjs) ? targetMjs : (exists(targetCjs) ? targetCjs : null);
  if (!t) return false;
  try { return fs.readFileSync(t, "utf8").includes("FANDUEL_ODDS_INTEGRATED"); }
  catch { return false; }
}

(function run(){
  if (!exists(fnDir)) return;
  ensureDir(stashDir);

  const disable = process.env.DISABLE_ODDS_WRAPPER === "1";
  const hasMjs = exists(targetMjs);
  const hasCjs = exists(targetCjs);

  if (!hasMjs && !hasCjs) {
    console.log("[prebuild] mlb-slate-lite function not found; skipping odds injection.");
    return;
  }

  if (disable) {
    // Kill-switch: restore original & remove wrapper if present
    if (exists(stashMjs)) fs.copyFileSync(stashMjs, targetMjs);
    if (exists(stashCjs)) fs.copyFileSync(stashCjs, targetCjs);
    console.log("[prebuild] DISABLE_ODDS_WRAPPER=1 → wrapper disabled; original restored.");
    return;
  }

  // Install wrapper if not already
  if (!alreadyWrapped()) {
    if (hasMjs) fs.renameSync(targetMjs, stashMjs);
    if (hasCjs) fs.renameSync(targetCjs, stashCjs);
    fs.copyFileSync(wrapperTemplate, targetMjs);
    console.log("[prebuild] FanDuel wrapper installed; original stashed in _lib/_orig.");
  } else {
    console.log("[prebuild] Wrapper already present.");
  }
})();
