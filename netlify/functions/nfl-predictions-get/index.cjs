// netlify/functions/nfl-predictions-get/index.cjs
const { scorePredictions } = require("../nfl-predictions-score");

exports.handler = async (event) => {
  try {
    const season = Number(event.queryStringParameters?.season || 2025);
    const week = Number(event.queryStringParameters?.week || 2);
    const rows = await scorePredictions(season, week);
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, season, week, rows, source: "live" })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(e) })
    };
  }
};
