// netlify/functions/hrr-diag.mjs
export const handler = async () => {
  const env = {
    THEODDSAPI_KEY: !!(process.env.THEODDSAPI_KEY || process.env.ODDS_API_KEY),
    ODDS_REGIONS: process.env.ODDS_REGIONS || "us,us2",
    BOOKMAKERS: process.env.BOOKMAKERS || "",
    ODDSMARKET_HRR_MULTI: process.env.ODDSMARKET_HRR_MULTI || "batter_hits_runs_rbis,batter_hits_runs_rbis_alternate",
  };
  return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:true, env }) };
};
