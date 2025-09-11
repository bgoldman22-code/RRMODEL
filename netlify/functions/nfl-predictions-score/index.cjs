// netlify/functions/nfl-predictions-score/index.cjs
exports.config = { includedFiles: ["lib/nfl/**"] };
const { score } = require("../../../lib/nfl/score");
const SECRET = process.env.TRAIN_SECRET || "";

exports.handler = async (event, ctx) => {
  try {
    const key = event.queryStringParameters?.key || "";
    if (!SECRET || key !== SECRET) {
      return { statusCode: 401, body: JSON.stringify({ ok:false, error:"unauthorized" }) };
    }
    const baseUrl = process.env.URL || `https://${process.env.SITE_NAME}.netlify.app` || "";
    const out = await score(baseUrl);
    return {
      statusCode: 200,
      headers: { "content-type":"application/json", "cache-control":"no-store" },
      body: JSON.stringify({ ok:true, ran:"score", count: out?.data?.rows?.length || 0, meta: out?.meta })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
