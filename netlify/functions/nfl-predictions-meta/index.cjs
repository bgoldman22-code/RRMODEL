// netlify/functions/nfl-predictions-meta/index.cjs
exports.config = { includedFiles: ["lib/nfl/**"] };
const { getMeta } = require("../../../lib/nfl/meta");

exports.handler = async () => {
  try {
    const out = await getMeta();
    return {
      statusCode: 200,
      headers: { "content-type":"application/json", "cache-control":"no-store" },
      body: JSON.stringify(out)
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
