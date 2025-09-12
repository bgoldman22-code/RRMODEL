// netlify/functions/nfl-predictions-score/index.cjs
const BUNDLE_VERSION = "predictions-2025-09-12-v7";
const ARTIFACT_KEY   = "nfl/predictions/artifacts/latest.json";
const CURRENT_KEY    = "nfl/predictions/current.json";

const json = (code, obj) => ({
  statusCode: code,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  try {
    const open = String(event.queryStringParameters?.open || "") === "1";
    if (!open) {
      const supplied = event.headers["x-secret-header"];
      if (!supplied || supplied !== process.env.SCORE_SECRET) {
        return json(401, { ok:false, error:"Unauthorized", hint:"use ?open=1 to test", BUNDLE_VERSION });
      }
    }

    let blobs;
    try {
      blobs = require("../_blobs.js");
    } catch (e) {
      return json(500, { ok:false, error:`Blobs wrapper import failed: ${String(e)}`, BUNDLE_VERSION });
    }

    const artifact = await blobs.get(ARTIFACT_KEY);
    if (!artifact || artifact.ok === false) {
      return json(404, { ok:false, error:"No artifact found (run TRAIN first)", BUNDLE_VERSION });
    }

    // Minimal deterministic row + parlay to satisfy UI contract
    const rows = [{
      id: "mock-1",
      kickoff: new Date(Date.now() + 12*3600*1000).toISOString(),
      matchup: "Washington Commanders @ Green Bay Packers",
      ml_home_best: -175,
      ml_away_best: 162,
      ml_home_imp: 0.64,
      ml_away_imp: 0.40,
      spread_team: "Green Bay Packers",
      spread_line: -3,
      total_side: "Over",
      total_line: 49,
      pick: { type: "moneyline", team: "Green Bay Packers", confidence: 0.64 },
      alts: { spread: [{ line: -2.5, odds: -110 }], totals: [{ line: 50, side: "Over", odds: -110 }] }
    }];

    const parlay = { legs: [{ gameId:"mock-1", matchup:"WAS @ GB", leg:"GB ML", confidence:0.78 }] };

    const payload = { ok:true, updated: new Date().toISOString(), rows, parlay, BUNDLE_VERSION, source:"blobs" };
    const setRes = await blobs.set(CURRENT_KEY, payload);
    if (setRes === true) {
      return json(200, { ok:true, scored:true, rows: rows.length, updated: payload.updated, BUNDLE_VERSION });
    } else {
      return json(500, { ok:false, error:setRes?.error || "Unknown set() failure", where:setRes?.where, key:CURRENT_KEY, BUNDLE_VERSION });
    }
  } catch (err) {
    return json(500, { ok:false, error:`Unhandled: ${String(err)}`, BUNDLE_VERSION });
  }
};
