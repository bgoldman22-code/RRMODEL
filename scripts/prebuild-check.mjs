// scripts/prebuild-check.mjs
// Runs before vite build to surface errors (missing modules, syntax) early.
console.log("[prebuild] Node", process.version);
try {
  await import('../src/utils/why.js').then(m => {
    if (typeof m.buildWhy !== 'function') throw new Error("buildWhy not exported");
    console.log("[prebuild] why.js OK");
  });
} catch (e) {
  console.error("[prebuild] FAILED importing src/utils/why.js:", e?.message || e);
  process.exit(2);
}
