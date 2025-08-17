// scripts/prebuild-inject-odds.mjs
// Updated: rename original to "mlb-slate-lite_orig.mjs" (underscore, NOT dot)
// to avoid Netlify treating "mlb-slate-lite.orig" as an invalid function name.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fnDir = path.resolve(process.cwd(), "netlify", "functions");
const target = path.join(fnDir, "mlb-slate-lite.mjs");
const targetCjs = path.join(fnDir, "mlb-slate-lite.cjs");
const origMjs = path.join(fnDir, "mlb-slate-lite_orig.mjs");
const origCjs = path.join(fnDir, "mlb-slate-lite_orig.cjs");
const wrapperTemplate = path.join(fnDir, "_lib", "mlb-slate-lite.wrapper.template.mjs");

function exists(p){ try { fs.accessSync(p); return true; } catch { return false; } }

function alreadyWrapped() {
  const t = exists(target) ? target : (exists(targetCjs) ? targetCjs : null);
  if (!t) return false;
  try { return fs.readFileSync(t, "utf8").includes("FANDUEL_ODDS_INTEGRATED"); }
  catch { return false; }
}

(function run(){
  if (!exists(fnDir)) return;

  if (alreadyWrapped()) {
    console.log("[prebuild] FanDuel wrapper already integrated.");
    return;
  }

  const hasMjs = exists(target);
  const hasCjs = exists(targetCjs);
  if (!hasMjs && !hasCjs) {
    console.log("[prebuild] mlb-slate-lite function not found; skipping odds injection.");
    return;
  }

  if (hasMjs) fs.renameSync(target, origMjs);
  if (hasCjs) fs.renameSync(targetCjs, origCjs);

  fs.copyFileSync(wrapperTemplate, target);

  console.log("[prebuild] FanDuel odds wrapper installed (orig renamed to *_orig.mjs).");
})();
