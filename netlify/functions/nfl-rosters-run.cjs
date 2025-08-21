// netlify/functions/nfl-rosters-run.cjs
const { runUpdate } = require("./_shared/rosters-shared.cjs");

module.exports.handler = async (event) => {
  const params = (event && event.queryStringParameters) || {};
  const debug = params.debug === "1";
  const STORE = process.env.NFL_TD_BLOBS || "nfl-td";
  // default to espn unless explicitly set
  const PROVIDER = process.env.NFL_ROSTERS_SOURCE || "espn";
  try{
    const result = await runUpdate({ STORE, PROVIDER, debug });
    return { statusCode: 200, body: JSON.stringify({ source:"manual", ...result }) };
  }catch(e){
    return { statusCode: 200, body: JSON.stringify({ source:"manual", ok:false, error:String(e) }) };
  }
};
