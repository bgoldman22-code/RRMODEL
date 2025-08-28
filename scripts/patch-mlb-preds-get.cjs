#!/usr/bin/env node
// scripts/patch-mlb-preds-get.cjs
// Usage: node scripts/patch-mlb-preds-get.cjs
const fs = require('fs');
const path = require('path');

const candidates = [
  'netlify/functions/mlb-preds-get.cjs',
  'netlify/functions/mlb-preds-get.js'
];

function ensureHandler(filePath) {
  if (!fs.existsSync(filePath)) return false;
  let src = fs.readFileSync(filePath, 'utf8');

  const hasExportsHandler =
    /exports\.handler\s*=\s*async\s*\(/.test(src) ||
    /module\.exports\s*=\s*{[^}]*handler\s*:\s*async\s*\(/s.test(src);

  if (hasExportsHandler) {
    console.log(`[ok] ${filePath} already has exports.handler`);
    return true;
  }

  // If there's a default export like "export default async (event) => {", convert to CJS
  if (/export\s+default\s+async\s*\(/.test(src)) {
    src = src.replace(/export\s+default\s+async\s*\(/, 'async function _main(');
    src += '\nexports.handler = _main;\n';
    fs.writeFileSync(filePath, src);
    console.log(`[patched] Converted default export to exports.handler in ${filePath}`);
    return true;
  }

  // Fallback: append a minimal passthrough handler if missing
  if (!/exports\.handler/.test(src)) {
    src += '\nexports.handler = async (event) => ({ statusCode: 200, body: JSON.stringify({ ok:true, note:"handler added by patch; replace with real logic" }) });\n';
    fs.writeFileSync(filePath, src);
    console.log(`[patched] Appended exports.handler stub to ${filePath}`);
    return true;
  }
  return false;
}

let changed = false;
for (const p of candidates) {
  changed = ensureHandler(p) || changed;
}
if (!changed) {
  console.log('No files changed. If your handler is still not found, ensure the file extension is .cjs when using CommonJS.');
}
