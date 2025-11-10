import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    const week = url.searchParams.get("week");
    const season = url.searchParams.get("season") || "2025";
    
    const store = getStore("nfl-v5");
    
    let data = null;
    
    // Try to get by week first (if provided)
    if (week) {
      const weekKey = `predictions/${season}-week${week}.json`;
      data = await store.get(weekKey, { type: "json" });
      
      if (data) {
        console.log(`Found V5 predictions for ${season} Week ${week}`);
        return new Response(
          JSON.stringify(data),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=300"
            }
          }
        );
      }
    }
    
    // Try to get by date (if provided)
    if (date) {
      data = await store.get(`predictions/${date}.json`, { type: "json" });
      
      if (data) {
        console.log(`Found V5 predictions for date ${date}`);
        return new Response(
          JSON.stringify(data),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=3600"
            }
          }
        );
      }
    }
    
    // Fall back to latest
    const latestData = await store.get("predictions/latest.json", { type: "json" });
    
    if (!latestData) {
      return new Response(
        JSON.stringify({ 
          error: "No predictions available",
          message: week 
            ? `No V5 predictions found for ${season} Week ${week}. Try refreshing to generate.`
            : date
            ? `No V5 predictions found for date ${date}`
            : "No predictions available"
        }),
        { 
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    console.log(`Returning latest V5 predictions as fallback`);
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
