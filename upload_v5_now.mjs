import { getStore } from "@netlify/blobs";

const store = getStore("nfl-v5");
const fs = await import("fs/promises");

const bundle = JSON.parse(
  await fs.readFile("nfl-model-v4.1/output/bundle_v5.json", "utf8")
);

// Upload to latest
await store.set("predictions/latest.json", JSON.stringify(bundle));

// Upload to date-specific
const today = new Date().toISOString().split("T")[0];
await store.set(`predictions/${today}.json`, JSON.stringify(bundle));

// Update summary
const summary = {
  lastUpdate: new Date().toISOString(),
  gamesCount: bundle.rows?.length || 0,
  modelVersion: bundle.meta?.modelVersion || "v5"
};
await store.set("predictions/summary.json", JSON.stringify(summary));

console.log("✅ Uploaded V5 bundle:", bundle.rows?.length, "games");
console.log("📅 Date:", today);
console.log("🎯 Model:", bundle.meta?.modelVersion);
