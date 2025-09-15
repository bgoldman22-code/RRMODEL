import { mkdirSync, writeFileSync } from "fs";
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", "<!doctype html><meta charset='utf-8'><title>RRModel</title><h1>Build OK</h1><p>This is a placeholder build artifact created by netlify/build-debug.js.</p>");
console.log("[build-debug] wrote dist/index.html");
