// scripts/prebuild-inject-odds.mjs
import fs from "node:fs"; import path from "node:path"; import url from "node:url";
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fnDir = path.resolve(process.cwd(), "netlify", "functions");
const target = path.join(fnDir, "mlb-slate-lite.mjs");
const targetCjs = path.join(fnDir, "mlb-slate-lite.cjs");
const origMjs = path.join(fnDir, "mlb-slate-lite.orig.mjs");
const origCjs = path.join(fnDir, "mlb-slate-lite.orig.cjs");
const wrapperTemplate = path.join(fnDir, "_lib", "mlb-slate-lite.wrapper.template.mjs");
function exists(p){ try { fs.accessSync(p); return true; } catch { return false; } }
function alreadyWrapped() {
  if (!exists(target) && !exists(targetCjs)) return false;
  try { const s = fs.readFileSync(exists(target) ? target : targetCjs, "utf8"); return s.includes("FANDUEL_ODDS_INTEGRATED"); }
  catch { return false; }
}
(function run(){
  if (!exists(fnDir)) return;
  if (alreadyWrapped()) { console.log("[prebuild] FanDuel wrapper already integrated."); return; }
  const hasMjs = exists(target), hasCjs = exists(targetCjs);
  if (!hasMjs && !hasCjs) { console.log("[prebuild] mlb-slate-lite function not found; skipping odds injection."); return; }
  if (hasMjs) fs.renameSync(target, origMjs);
  if (hasCjs) fs.renameSync(targetCjs, origCjs);
  fs.copyFileSync(wrapperTemplate, target);
  console.log("[prebuild] FanDuel odds wrapper installed.");
})();
