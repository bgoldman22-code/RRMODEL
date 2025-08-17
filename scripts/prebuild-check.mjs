// scripts/prebuild-check.mjs (safe for JSX)
// This script **does not import** .jsx files. It only checks for file presence and basic exports.
import { readFileSync, existsSync } from "node:fs";

function mustExist(path){
  if (!existsSync(path)) {
    console.error(`[prebuild] FAIL: missing file: ${path}`);
    process.exit(2);
  }
  console.log(`[prebuild] OK: found ${path}`);
}

function mustHaveDefaultExportJSX(path){
  const src = readFileSync(path, "utf8");
  const hasDefault = /export\s+default\s+\w+|export\s+default\s+function|export\s+default\s*\(/.test(src);
  if (!hasDefault){
    console.error(`[prebuild] FAIL: ${path} has no default export`);
    process.exit(2);
  }
  console.log(`[prebuild] OK: default export in ${path}`);
}

function mustExportBuildWhy(path){
  const src = readFileSync(path, "utf8");
  const hasFunc = /export\s+function\s+buildWhy\s*\(|export\s*{[^}]*\bbuildWhy\b[^}]*}/.test(src);
  if (!hasFunc){
    console.error(`[prebuild] FAIL: buildWhy not exported in ${path}`);
    process.exit(2);
  }
  console.log(`[prebuild] OK: buildWhy in ${path}`);
}

console.log("[prebuild] Node", process.version);

// App.jsx
mustExist("src/App.jsx");
mustHaveDefaultExportJSX("src/App.jsx");

// MLB.jsx (optional default)
if (existsSync("src/MLB.jsx")) {
  const src = readFileSync("src/MLB.jsx","utf8");
  const hasDefault = /export\s+default\s+\w+|export\s+default\s+function|export\s+default\s*\(/.test(src);
  if (!hasDefault) {
    console.warn("[prebuild] WARN: src/MLB.jsx has no default export (OK if not routed directly)");
  } else {
    console.log("[prebuild] OK: default export in src/MLB.jsx");
  }
}

// WHY util
if (existsSync("src/utils/why.js")) {
  mustExportBuildWhy("src/utils/why.js");
} else {
  console.warn("[prebuild] WARN: src/utils/why.js not found (WHY sentences disabled)");
}

console.log("[prebuild] done");
