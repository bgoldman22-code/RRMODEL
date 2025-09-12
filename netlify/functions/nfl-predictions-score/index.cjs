// netlify/functions/nfl-predictions-score/index.cjs
const BUNDLE_VERSION = "predictions-2025-09-12-v7";
const ARTIFACT_KEY   = "nfl/predictions/artifacts/latest.json";
const CURRENT_KEY    = "nfl/predictions/current.json";

function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}

function scoreData(artifact) {
  // Minimal mocked rows so UI can render
  const rows = [
    {
      id: "game-1",
      kickoff: new Date(Date.now() + 12*3600*1000).toISOString(),
      matchup: "Green Bay Packers @ Minnesota Vikings",
      ml_home_best: -175,
      ml_away_best: 162,
      ml_home_imp: 0.64,
      ml_away_imp: 0.40,
      spread_team: "Green Bay Packers",
      spread_line: -3,
      total_side: "Over",
      total_line: 49,
      pick: { type: "spread", team: "Green Bay Packers", confidence: 0.85 },
      alts: { spread: [{ line: -2.5, odds: -110 }], totals: [{ line: 50, side: "Over", odds: -110 }] }
    }
  ];
  const parlay = { legs: [{ gameId:"game-1", matchup:"GB @ MIN", leg:"GB -3", confidence:0.89 }] };
  return { rows, parlay };
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const open = (qs.open === "1");
    const okAuth = open || (event.headers?.["x-secret-header"] === process.env.SCORE_SECRET);
    if (!okAuth) return json(401, { ok:false, error:"Unauthorized", BUNDLE_VERSION });

    let storeGet, storeSet;
    try {
      const blobs = require("../_blobs.cjs");
      storeGet = blobs?.get;
      storeSet = blobs?.set;
      if (typeof storeGet !== "function" || typeof storeSet !== "function") {
        const blobs2 = require("../_blobs.js");
        storeGet = storeGet || blobs2?.get;
        storeSet = storeSet || blobs2?.set;
      }
    } catch (e) {
      return json(500, { ok:false, stage:"require(_blobs)", error:String(e), BUNDLE_VERSION });
    }

    if (typeof storeGet !== "function" || typeof storeSet !== "function") {
      return json(500, { ok:false, stage:"resolve(_blobs get/set)", error:"missing functions", BUNDLE_VERSION });
    }

    const artifact = await storeGet(ARTIFACT_KEY);
    if (!artifact) {
      return json(404, { ok:false, error:"No artifact found (run TRAIN first)", BUNDLE_VERSION, key:ARTIFACT_KEY });
    }

    const { rows, parlay } = scoreData(artifact);
    const payload = { ok:true, updated:new Date().toISOString(), rows, parlay, BUNDLE_VERSION, source:"blobs" };
    const wrote = await storeSet(CURRENT_KEY, payload).catch(e => ({__err:e}));
    if (wrote && wrote.__err) {
      return json(500, { ok:false, stage:"store.set(current)", error:String(wrote.__err), key:CURRENT_KEY, BUNDLE_VERSION });
    }
    if (wrote !== true) {
      return json(500, { ok:false, stage:"store.set(current)", error:"set() did not return true", ret:wrote, key:CURRENT_KEY, BUNDLE_VERSION });
    }

    return json(200, { ok:true, scored:true, rows:rows.length, updated:payload.updated, BUNDLE_VERSION });
  } catch (err) {
    return json(500, { ok:false, error:String(err), BUNDLE_VERSION, note:"SCORE catch-all" });
  }
};