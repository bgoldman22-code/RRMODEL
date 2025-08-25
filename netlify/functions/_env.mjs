export function getEnv() {
  const NFL_STORE_NAME = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
  const BACKOFF_MS = Number(process.env.BACKOFF_MS || 350);
  const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || null;
  const NETLIFY_AUTH_TOKEN = process.env.NETLIFY_AUTH_TOKEN || process.env.API_TOKEN || process.env.PERSONAL_ACCESS_TOKEN || null;
  const BOOKMAKERS = process.env.BOOKMAKERS || process.env.ODDSAPI_BOOKMAKER_NFL || "draftkings";
  const ODDS_API_KEY_NFL = process.env.ODDS_API_KEY_NFL || process.env.ODDS_API_KEY || "";
  const ODDSAPI_MARKET_NFL = process.env.ODDSAPI_MARKET_NFL || "player_anytime_touchdown";
  const ODDSAPI_REGION_NFL = process.env.ODDSAPI_REGION_NFL || "us,us2";
  const ODDSAPI_SPORT_NFL = process.env.ODDSAPI_SPORT_NFL || "americanfootball_nfl";
  return {
    NFL_STORE_NAME, BACKOFF_MS,
    NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN,
    BOOKMAKERS, ODDS_API_KEY_NFL,
    ODDSAPI_MARKET_NFL, ODDSAPI_REGION_NFL, ODDSAPI_SPORT_NFL
  };
}
