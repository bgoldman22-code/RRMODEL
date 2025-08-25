// netlify/functions/nfl-rosters-run.mjs
import { openStore } from "./_lib/blobs-helper.mjs";
import { ok, err } from "./_lib/respond.js";

export const handler = async (event) => {
  const store = openStore("nfl");
  const source = event.queryStringParameters?.source;

  // POST: accept a JSON body (depth charts object) and store as depth-charts.json
  if (event.httpMethod === "POST") {
    if (!event.body) return err("no charts provided (missing body)");
    const charts = JSON.parse(event.body);
    await (await store).set("depth-charts.json", JSON.stringify(charts), { contentType: "application/json" });
    await (await store).set("meta-rosters.json", JSON.stringify({ updatedAt: new Date().toISOString() }), { contentType: "application/json" });
    return ok({ mode: "post", keys: ["depth-charts.json", "meta-rosters.json"] });
  }

  // GET with ?source=repo could read from /data if site exposes it; here we just noop and report
  if (source === "repo") {
    // In your app, this would fetch from /data/nfl-td/depth-charts.json and push to blobs
    // We keep a placeholder to avoid crashes.
    return ok({ mode: "repo", note: "no-op in patch (expects site to expose /data). Use POST to upload charts." });
  }

  return ok({ note: "call with POST charts body to seed depth-charts.json" });
};