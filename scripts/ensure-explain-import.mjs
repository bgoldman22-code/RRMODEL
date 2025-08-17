// scripts/ensure-explain-import.mjs
import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/MLB.jsx");
if (!fs.existsSync(file)) {
  console.log("[ensure-explain-import] skipped: src/MLB.jsx not found");
  process.exit(0);
}
let txt = fs.readFileSync(file, "utf8");
if (txt.includes('explainRow') && !txt.match(/import\s*\{[^}]*explainRow[^}]*\}\s*from\s*["']\.\/utils\/why\.js["']/)) {
  // Inject import next to other utils/why.js import, or add a new line at top.
  if (txt.match(/import\s*\{[^}]*\}\s*from\s*["']\.\/utils\/why\.js["']/)) {
    txt = txt.replace(/import\s*\{([^}]*)\}\s*from\s*["']\.\/utils\/why\.js["'];?/,
      (m, inside) => {
        const names = inside.split(",").map(s=>s.trim()).filter(Boolean);
        if (!names.includes("explainRow")) names.push("explainRow");
        return `import { ${names.join(", ")} } from "./utils/why.js";`;
      });
  } else {
    txt = `import { explainRow } from "./utils/why.js";\n` + txt;
  }
  fs.writeFileSync(file, txt, "utf8");
  console.log("[ensure-explain-import] added import for explainRow");
} else {
  console.log("[ensure-explain-import] ok (import present or not used)");
}
