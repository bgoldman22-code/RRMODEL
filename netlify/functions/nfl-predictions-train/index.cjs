// netlify/functions/nfl-predictions-train/index.cjs
exports.config = { includedFiles: ["lib/nfl/**"] };
const { train } = require("../../../lib/nfl/model");
const SECRET = process.env.TRAIN_SECRET || "";

exports.handler = async (event) => {
  try {
    const key = event.queryStringParameters?.key || "";
    if (!SECRET || key !== SECRET) {
      return { statusCode: 401, body: JSON.stringify({ ok:false, error:"unauthorized" }) };
    }
    const meta = await train();
    return {
      statusCode: 200,
      headers: { "content-type":"application/json", "cache-control":"no-store" },
      body: JSON.stringify({ ok:true, ran:"train", meta })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
