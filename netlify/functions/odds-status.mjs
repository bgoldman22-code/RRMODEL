export async function handler() {
  const env = {
    BOOKMAKERS: process.env.ODDSAPI_BOOKMAKER_NFL || process.env.BOOKMAKERS || null,
    MARKET: process.env.ODDSAPI_MARKET_NFL || process.env.MARKET || null,
    REGION: process.env.ODDSAPI_REGION_NFL || process.env.REGION || null,
    SPORT: process.env.ODDSAPI_SPORT_NFL || process.env.SPORT || null,
    API_KEY_SET: !!process.env.ODDS_API_KEY_NFL,
    NFL_STORE_NAME: process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td",
    HAS_NETLIFY: !!process.env.NETLIFY,
    HAS_SITE_ID: !!process.env.NETLIFY_SITE_ID,
  };
  return new Response(JSON.stringify({ ok:true, env }), { status:200 });
}
