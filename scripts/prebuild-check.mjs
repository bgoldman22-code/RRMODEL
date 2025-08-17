// scripts/prebuild-check.mjs (safe — no JSX imports)
import { readFileSync, existsSync } from "node:fs";

function mustExist(path){
  if (!existsSync(path)) {
    console.error(`[prebuild] FAIL: missing file: ${path}`);
    process.exit(2);
  }
  console.log(`[prebuild] OK: found ${path}`);
}

function hasDefaultExport(path){
  const src = readFileSync(path, "utf8");
  return /export\s+default\s+\w+|export\s+default\s+function|export\s+default\s*\(/.test(src);
}

function requireDefaultExport(path, label){
  const ok = hasDefaultExport(path);
  if (!ok){
    console.error(`[prebuild] FAIL: ${label} has no default export (${path})`);
    process.exit(2);
  }
  console.log(`[prebuild] OK: default export in ${label}`);
}

console.log("[prebuild] Node", process.version);

// App.jsx must exist + default export
mustExist("src/App.jsx");
requireDefaultExport("src/App.jsx", "src/App.jsx");

// MLB.jsx (warn if no default — fine if it's not routed directly)
if (existsSync("src/MLB.jsx")) {
  const ok = hasDefaultExport("src/MLB.jsx");
  if (!ok) console.warn("[prebuild] WARN: src/MLB.jsx has no default export (OK if not routed directly)");
  else console.log("[prebuild] OK: default export in src/MLB.jsx");
}

// WHY util check (optional)
if (existsSync("src/utils/why.js")) {
  const src = readFileSync("src/utils/why.js", "utf8");
  const hasWhy = /export\s+function\s+buildWhy\s*\(|export\s*{[^}]*\bbuildWhy\b[^}]*}/.test(src);
  if (!hasWhy) console.warn("[prebuild] WARN: src/utils/why.js does not export buildWhy (WHY sentences disabled)");
  else console.log("[prebuild] OK: buildWhy exported");
} else {
  console.warn("[prebuild] WARN: src/utils/why.js not found");
}

console.log("[prebuild] done");
