/**
 * netlify/functions/nfl-v5-weekly-refresh.mjs
 * 
 * Scheduled function to automatically refresh V5 predictions weekly
 * Runs: Tuesday 10:00 AM ET (14:00 UTC) - after Monday Night Football
 * 
 * Workflow:
 * 1. Generates new predictions for current week
 * 2. Creates bundle_v5.json
 * 3. Uploads to Netlify Blobs
 * 4. Sends notification (optional)
 */

import { schedule } from "@netlify/functions";

async function refreshV5Predictions() {
  try {
    console.log("🔄 Starting V5 weekly refresh...");
    
    const baseUrl = process.env.URL || "https://roundrobinrecs.netlify.app";
    
    // Step 1: Trigger prediction generation (via the existing endpoint)
    console.log("📊 Step 1: Generating predictions...");
    const season = new Date().getFullYear();
    const generateUrl = `${baseUrl}/.netlify/functions/nfl-predictions-generate`;
    
    // Get current week's schedule first
    const scheduleRes = await fetch(`${baseUrl}/.netlify/functions/nfl-schedule-get?season=${season}`);
    if (!scheduleRes.ok) {
      throw new Error(`Schedule fetch failed: ${scheduleRes.status}`);
    }
    const scheduleData = await scheduleRes.json();
    const games = scheduleData.matchups || scheduleData.games || [];
    
    if (games.length === 0) {
      console.log("⚠️ No games found for current week");
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No games this week, skipping refresh" })
      };
    }
    
    // Generate predictions
    const predRes = await fetch(generateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        season: season.toString(),
        games: games.map(g => ({
          game_id: g.id,
          home_team: g.homeTeam,
          away_team: g.awayTeam,
          start: g.kickoff
        })),
        refresh: true
      })
    });
    
    if (!predRes.ok) {
      throw new Error(`Prediction generation failed: ${predRes.status}`);
    }
    
    console.log("✅ Predictions generated");
    
    // Step 2: Trigger upload to Blobs
    console.log("📤 Step 2: Uploading to Blobs...");
    const uploadUrl = `${baseUrl}/.netlify/functions/nfl-v5-upload`;
    const uploadRes = await fetch(uploadUrl, {
      method: "POST"
    });
    
    if (!uploadRes.ok) {
      throw new Error(`Upload failed: ${uploadRes.status}`);
    }
    
    const uploadData = await uploadRes.json();
    console.log("✅ Upload complete:", uploadData);
    
    // Optional: Send notification (add your notification logic here)
    // await sendNotification({ ...uploadData });
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "V5 predictions refreshed successfully",
        data: uploadData
      })
    };
    
  } catch (error) {
    console.error("❌ V5 refresh failed:", error);
    
    // Optional: Send error notification
    // await sendErrorNotification(error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
}

// Schedule for Tuesday 10:00 AM ET (14:00 UTC) weekly
// Cron: minute hour day month dayOfWeek
export const handler = schedule("0 14 * * 2", refreshV5Predictions);
