import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0];
    
    const store = getStore("nfl-v5");
    
    // Try to get predictions for the specific date
    const dateData = await store.get(`predictions/${date}.json`, { type: "json" });
    
    if (!dateData) {
      // Fall back to latest
      const latestData = await store.get("predictions/latest.json", { type: "json" });
      
      if (!latestData) {
        return new Response(
          JSON.stringify({ 
            error: "No predictions available",
            message: `No V5 predictions found for date ${date}`
          }),
          { 
            status: 404,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      
      return new Response(
        JSON.stringify(latestData),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=300"
          }
        }
      );
    }

    return new Response(
      JSON.stringify(dateData),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600" // Cache for 1 hour for historical data
        }
      }
    );
  } catch (error) {
    console.error("Error fetching V5 predictions by date:", error);
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
  path: "/nfl-v5-by-date"
};
