import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    // Get Netlify Blobs store
    const store = getStore("nba-ddtd-cache");
    
    // Try to get cached picks (24hr TTL)
    const cached = await store.get("today-picks", { type: "json" });
    
    if (cached) {
      console.log("✅ Cache HIT - Returning cached picks");
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600", // 1 hour browser cache
          "X-Cache": "HIT"
        }
      });
    }
    
    // Cache MISS - Fetch from GitHub
    console.log("⚠️ Cache MISS - Fetching from GitHub");
    
    const githubUrl = "https://raw.githubusercontent.com/bgoldman22-code/NBA-DDTD-RESEARCH/main/data/nba/ddtd_today_picks.json";
    
    const response = await fetch(githubUrl);
    
    if (!response.ok) {
      throw new Error(`GitHub fetch failed: ${response.statusText}`);
    }
    
    const picks = await response.json();
    
    // Cache for 24 hours
    await store.setJSON("today-picks", picks, {
      metadata: {
        cachedAt: new Date().toISOString(),
        date: picks.date
      }
    });
    
    console.log("✅ Fetched from GitHub and cached");
    
    return new Response(JSON.stringify(picks), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        "X-Cache": "MISS"
      }
    });
    
  } catch (error) {
    console.error("❌ Error fetching picks:", error);
    
    return new Response(
      JSON.stringify({
        error: "Failed to fetch NBA DD/TD picks",
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
  path: "/api/nba-ddtd-picks"
};
