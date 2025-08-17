// scripts/prebuild-check.mjs
const panic = (msg, e) => { console.error("[prebuild] FAIL:", msg, e?.message || e); process.exit(2); };

console.log("[prebuild] Node", process.version);

try {
  await import('../src/App.jsx').then(m => {
    if (!m?.default) throw new Error("src/App.jsx has no default export");
    console.log("[prebuild] App.jsx OK");
  });
} catch(e) { panic("import App.jsx", e); }

try {
  await import('../src/MLB.jsx').then(m => {
    if (!m?.default) console.warn("[prebuild] MLB.jsx: no default export detected (OK if not routed)"); 
    else console.log("[prebuild] MLB.jsx OK");
  });
} catch(e) { console.warn("[prebuild] MLB.jsx import failed (not fatal):", e?.message || e); }

try {
  await import('../src/utils/why.js').then(m => {
    if (typeof m.buildWhy !== 'function') throw new Error("buildWhy not exported");
    console.log("[prebuild] why.js OK");
  });
} catch(e) { console.warn("[prebuild] why.js import failed (not fatal):", e?.message || e); }
