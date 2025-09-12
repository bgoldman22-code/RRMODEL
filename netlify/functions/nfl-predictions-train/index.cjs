// netlify/functions/nfl-predictions-train/index.cjs
const { scorePredictions } = require("../nfl-predictions-score");
const { getBlobsStore } = require("../_blobs.js");

exports.handler = async (event) => {
  try {
    const season = Number(event.queryStringParameters?.season || 2025);
    const week = Number(event.queryStringParameters?.week || 2);

    const rows = await scorePredictions(season, week);
    const store = getBlobsStore("nfl-predictions");
    const key = `season/${season}/week${week}.json`;
    await store.set(key, JSON.stringify({ ok: true, season, week, rows }));

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, season, week, wrote: key, count: rows.length })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(e) })
    };
  }
};
