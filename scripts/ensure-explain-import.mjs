// scripts/ensure-explain-import.mjs
import { readFileSync, writeFileSync } from "node:fs";

const path = "src/MLB.jsx";
let src;
try {
  src = readFileSync(path, "utf8");
} catch (e) {
  console.log("[ensure-import] src/MLB.jsx not found; skipping");
  process.exit(0);
}

if (/from\s+["']\.\/utils\/why\.js["']/.test(src) || /from\s+["']\.\/utils\/why["']/.test(src)) {
  console.log("[ensure-import] explainRow import already present");
  process.exit(0);
}

// If there's an import block, inject after the last import; else prepend
const lines = src.split(/\r?\n/);
let lastImport = -1;
for (let i=0;i<lines.length;i++){
  if (/^\s*import\s/.test(lines[i])) lastImport = i;
}
const stmt = "import { explainRow } from \"./utils/why.js\";";
if (lastImport >= 0) {
  lines.splice(lastImport+1, 0, stmt);
} else {
  lines.unshift(stmt, "");
}
writeFileSync(path, lines.join("\n"));
console.log("[ensure-import] inserted: import { explainRow } from './utils/why.js'");
