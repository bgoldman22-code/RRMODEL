// scripts/run-vite-build.mjs
// Runs Vite build with rich diagnostics so Netlify logs show the *real* error.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));

function logSection(title){
  console.log("\n=== " + title + " ===");
}

try {
  logSection("Environment");
  console.log("Node", process.version);
  console.log("DEBUG", process.env.DEBUG);
  console.log("PWD", process.cwd());
  console.log("Files:", readdirSync(process.cwd()));

  logSection("package.json");
  const pkg = JSON.parse(readFileSync("package.json","utf8"));
  console.log(JSON.stringify({ name: pkg.name, version: pkg.version, deps: Object.keys(pkg.dependencies||{}), devDeps: Object.keys(pkg.devDependencies||{}) }, null, 2));

  logSection("Key files");
  console.log("index.html", existsSync("index.html"));
  console.log("src/App.jsx", existsSync("src/App.jsx"));
  console.log("src/main.jsx", existsSync("src/main.jsx"));

  logSection("Loading Vite build()");
  const vite = await import('vite');
  if (!vite?.build) {
    console.error("Vite 'build' not found. Is 'vite' installed?");
    process.exit(2);
  }

  logSection("Running build");
  await vite.build({
    // Keep default config discovery; we just want richer error logging
    logLevel: 'info'
  });

  console.log("\n✔ Vite build finished");
} catch (err) {
  console.error("\n✖ Vite build FAILED");
  console.error("Type:", err?.name);
  console.error("Message:", err?.message);
  if (err?.stack) console.error("Stack:\n" + err.stack);
  // Some Vite errors contain nested cause or plugin info
  if (err?.cause) {
    console.error("Cause:", err.cause);
  }
  if (err?.plugin) console.error("Plugin:", err.plugin);
  if (err?.id) console.error("File:", err.id);
  if (err?.frame) console.error("Frame:\n" + err.frame);
  process.exit(2);
}
