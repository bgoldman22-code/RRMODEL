// scripts/fix-explain-call.mjs
// Converts invalid pseudo-named calls like explainRow(baseProb: x, hotBoost: y, ...)
// into object calls explainRow({ baseProb: x, hotBoost: y, ... })
import { readFileSync, writeFileSync } from "node:fs";

const path = "src/MLB.jsx";
let src;
try {
  src = readFileSync(path, "utf8");
} catch (e) {
  console.log("[fix-explain] src/MLB.jsx not found; skipping");
  process.exit(0);
}

// Quick heuristic: find explainRow( ... ) blocks that include "baseProb:" inside the parens
let changed = false;
src = src.replace(/explainRow\(\s*([^)]*?baseProb\s*:.*?)[\s\S]*?\)/g, (m) => {
  // Wrap the entire argument list in braces if not already
  if (/explainRow\(\s*\{/.test(m)) return m; // already an object
  changed = true;
  return m.replace(/explainRow\(\s*/, "explainRow({ ").replace(/\)\s*$/, " })");
});

if (changed) {
  writeFileSync(path, src);
  console.log("[fix-explain] converted pseudo-named explainRow(...) to object form");
} else {
  console.log("[fix-explain] no pseudo-named explainRow() calls found");
}
