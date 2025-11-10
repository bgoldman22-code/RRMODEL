import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    // This endpoint triggers a refresh of the V5 predictions
    // In production, you might want to add authentication here
    
    const store = getStore("nfl-v5");
    
    // Get summary to check current state
    const summary = await store.get("predictions/summary.json", { type: "json" });
    
    return new Response(
      JSON.stringify({ 
        ok: true,
        message: "Refresh triggered",
        currentState: summary || { lastUpdate: "never", gamesCount: 0 },
        note: "To upload new predictions, run: node upload_v5_now.mjs"
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache"
        }
      }
    );
  } catch (error) {
    console.error("Error refreshing V5 predictions:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        message: error.message 
      }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};

export const config = {
  path: "/nfl-v5-refresh"
};
