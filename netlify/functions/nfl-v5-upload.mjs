/**
 * Netlify Function to upload V5 bundle to Blobs
 * Call this after generating new predictions to sync them to production
 */
import { getStore } from "@netlify/blobs";
import fs from "fs/promises";
import path from "path";

export default async (req, context) => {
  try {
    const store = getStore("nfl-v5");
    
    // Read the local bundle file
    const bundlePath = path.join(process.cwd(), "nfl-model-v4.1", "output", "bundle_v5.json");
    const bundleContent = await fs.readFile(bundlePath, "utf8");
    const bundle = JSON.parse(bundleContent);
    
    // Validate the bundle
    if (!bundle.meta || !bundle.rows) {
      return new Response(JSON.stringify({
        success: false,
        error: "Invalid bundle format"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Upload to latest
    await store.set("predictions/latest.json", bundleContent);
    
    // Upload to date-specific
    const today = new Date().toISOString().split("T")[0];
    await store.set(`predictions/${today}.json`, bundleContent);
    
    // Update summary
    const summary = {
      lastUpdate: new Date().toISOString(),
      gamesCount: bundle.rows?.length || 0,
      modelVersion: bundle.meta?.modelVersion || "v5",
      week: bundle.meta?.week || null,
      season: bundle.meta?.season || null
    };
    await store.set("predictions/summary.json", JSON.stringify(summary));
    
    return new Response(JSON.stringify({
      success: true,
      uploaded: {
        games: bundle.rows?.length || 0,
        week: bundle.meta?.week,
        season: bundle.meta?.season,
        date: today
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (error) {
    console.error("Upload error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = {
  path: "/nfl-v5-upload"
};
