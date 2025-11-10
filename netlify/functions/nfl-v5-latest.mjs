import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    const store = getStore("nfl-v5");
    
    // Try to get the latest predictions from blob storage
    const latestData = await store.get("predictions/latest.json", { type: "json" });
    
    if (!latestData) {
      return new Response(
        JSON.stringify({ 
          error: "No predictions available",
          message: "V5 predictions have not been uploaded yet"
        }),
        { 
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Return the predictions with proper headers
    return new Response(
      JSON.stringify(latestData),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300" // Cache for 5 minutes
        }
      }
    );
  } catch (error) {
    console.error("Error fetching V5 predictions:", error);
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
  path: "/nfl-v5-latest"
};
