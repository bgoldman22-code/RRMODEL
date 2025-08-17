// scripts/prebuild-install-react.mjs
// Ensures react, react-dom, vite and @vitejs/plugin-react are present before build.
// Safe to run repeatedly.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function has(pkg) {
  try { 
    const p = require.resolve(`${pkg}/package.json`, { paths: [process.cwd()] });
    return !!p;
  } catch { return false; }
}

function ensure(pkg, version, isDev=false) {
  if (has(pkg)) {
    console.log(`[prebuild] ${pkg} OK`);
    return;
  }
  const flag = isDev ? "-D" : "-S";
  const ver = version ? `@${version}` : "";
  const cmd = `npm install --no-audit --no-fund ${flag} ${pkg}${ver}`;
  console.log(`[prebuild] installing ${pkg}${ver} ...`);
  execSync(cmd, { stdio: "inherit" });
}

try {
  // Core runtime deps
  ensure("react", "^18.3.1", false);
  ensure("react-dom", "^18.3.1", false);

  // Build-time deps
  ensure("vite", "^5.4.0", true);
  ensure("@vitejs/plugin-react", "^4.3.0", true);

  console.log("[prebuild] dependency check complete.");
} catch (e) {
  console.error("[prebuild] failed:", e?.message || e);
  process.exit(1);
}
