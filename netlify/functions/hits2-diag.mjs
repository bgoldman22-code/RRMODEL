// netlify/functions/hits2-diag.mjs
export const handler = async () => {
  const key = !!(process.env.THEODDSAPI_KEY || process.env.ODDS_API_KEY);
  const regions = process.env.ODDS_REGIONS || "us";
  const market = process.env.ODDSMARKET_HITS || "player_hits";
  const books = process.env.BOOKMAKERS || "";
  const blobs = process.env.BLOBS_STORE || "";
  return {
    statusCode: 200,
    headers: { "content-type":"application/json" },
    body: JSON.stringify({ ok:true, keyPresent:key, regions, market, books, blobs })
  };
};
