// scripts/prebuild-check.mjs
// Sanity: ensure required packages exist before build; never imports your JSX.

const mustHave = [
  "react",
  "react-dom",
  "@netlify/blobs",
  "node-fetch"
];

let ok = true;
for (const m of mustHave) {
  try {
    await import(m);
    console.log(`[prebuild] ${m} OK`);
  } catch (e) {
    ok = false;
    console.error(`[prebuild] MISSING: ${m} (${e?.message || e})`);
  }
}

if (!ok) {
  console.error("[prebuild] One or more required dependencies are missing.");
  process.exit(1);
} else {
  console.log("[prebuild] All required dependencies present.");
}
