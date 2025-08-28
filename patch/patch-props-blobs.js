\
// patch/patch-props-blobs.js
// Usage: node patch/patch-props-blobs.js
// It will edit the listed files in ./netlify/functions to import the shared
// _blobs.js helper and initialize `store` via getBlobsStore(...).
// Idempotent: safe to run multiple times.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FN_DIR = path.join(ROOT, 'netlify', 'functions');

const FILES = [
  'props-get.mjs',
  'props-get-raw.mjs',
  'props-prob.mjs',
  'props-refresh.mjs',
  'props-stats.mjs',
  // optional:
  'props-diagnostics.mjs',
];

function ensureImportAndStore(src) {
  let out = src;

  // 1) Ensure import exists
  if (!/import\s*\{\s*getBlobsStore\s*\}\s*from\s*['"]\.\/_blobs\.js['"]/.test(out)) {
    // insert after shebang or first import
    const lines = out.split('\n');
    let inserted = false;
    for (let i=0; i<lines.length; i++) {
      if (/^import\s/.test(lines[i])) {
        lines.splice(i+1, 0, `import { getBlobsStore } from "./_blobs.js";`);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      lines.unshift(`import { getBlobsStore } from "./_blobs.js";`);
    }
    out = lines.join('\n');
  }

  // 2) Normalize store initialization
  // Replace common patterns that create a blobs client manually
  out = out
    // createClient().store('name')
    .replace(/createClient\(\)\.store\([^)]+\)/g, 'getBlobsStore(process.env.BLOBS_STORE || "mlb-odds")')
    // blobs\(\)\.store('name')
    .replace(/blobs\(\)\.store\([^)]+\)/g, 'getBlobsStore(process.env.BLOBS_STORE || "mlb-odds")')
    // any direct new store(...) like helper.store(...)
    .replace(/(?:const|let|var)\s+store\s*=\s*[^;]*store\([^)]+\);?/g, 'const store = getBlobsStore(process.env.BLOBS_STORE || "mlb-odds");');

  // 3) If there's no explicit store assignment at all, create one near top (below imports)
  if (!/\bconst\s+store\s*=\s*getBlobsStore\(/.test(out)) {
    const lines = out.split('\n');
    let lastImport = -1;
    for (let i=0; i<lines.length; i++) {
      if (/^import\s/.test(lines[i])) lastImport = i;
    }
    lines.splice(lastImport + 1, 0, `const store = getBlobsStore(process.env.BLOBS_STORE || "mlb-odds");`);
    out = lines.join('\n');
  }

  return out;
}

let changed = [];
for (const file of FILES) {
  const p = path.join(FN_DIR, file);
  if (!fs.existsSync(p)) { console.log(`skip (missing): ${file}`); continue; }
  const src = fs.readFileSync(p, 'utf8');
  const out = ensureImportAndStore(src);
  if (out !== src) {
    fs.writeFileSync(p, out, 'utf8');
    changed.push(file);
  } else {
    console.log(`no change: ${file}`);
  }
}

console.log(JSON.stringify({ ok: true, changed }, null, 2));
