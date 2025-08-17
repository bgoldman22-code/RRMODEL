// scripts/print-env.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

console.log("[diag] Node", process.version);
try {
  const npmV = (await import('node:child_process')).execSync('npm -v').toString().trim();
  console.log("[diag] npm", npmV);
} catch(e){ console.log("[diag] npm version check failed:", e?.message || e) }

console.log("[diag] CWD", process.cwd());
try {
  const list = readdirSync(process.cwd());
  console.log("[diag] top-level files:", list);
  if (!list.includes("package.json")) {
    console.error("[diag] ERROR: package.json not found in repo root!");
    process.exit(2);
  }
  const pkg = JSON.parse(readFileSync("package.json","utf8"));
  console.log("[diag] package.json name:", pkg.name, "version:", pkg.version);
  console.log("[diag] scripts:", pkg.scripts);
} catch(e){
  console.error("[diag] ERROR reading/Parsing package.json:", e?.message || e);
  process.exit(2);
}
