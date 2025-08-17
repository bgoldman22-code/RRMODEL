// scripts/fix-explain-call.mjs
import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/MLB.jsx");
if (!fs.existsSync(file)) {
  console.log("[fix-explain-call] skipped: src/MLB.jsx not found");
  process.exit(0);
}
let txt = fs.readFileSync(file, "utf8");

// Fix invalid "named arg" style: explainRow(baseProb: x, hotBoost: y, ...)
// Convert to object call: explainRow({ baseProb: x, hotBoost: y, ... })
// This is a conservative regex that only targets obvious cases.
txt = txt.replace(/explainRow\s*\(\s*([\w$]+\s*:\s*[^)]+)\)/g, (m, inner) => {
  return `explainRow({ ${inner} })`;
});

fs.writeFileSync(file, txt, "utf8");
console.log("[fix-explain-call] normalized calls");
