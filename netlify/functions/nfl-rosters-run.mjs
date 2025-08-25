import { getStore } from "@netlify/blobs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export default async function handler(req) {
  const url = new URL(req.url);
  const source = url.searchParams.get("source"); // "repo" to seed from repo file
  const storeName = process.env.NFL_TD_BLOBS || "nfl-td";
  const store = getStore({ name: storeName });

  let charts = null;

  // 1) If POST with JSON body, take it as charts
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body === "object") charts = body;
    } catch {}
  }

  // 2) If ?source=repo, pull from repo file
  if (!charts && source === "repo") {
    try {
      const txt = await readFile(join(process.cwd(), "data/nfl-td/depth-charts.json"), "utf-8");
      charts = JSON.parse(txt);
    } catch {}
  }

  if (!charts) {
    return new Response(
      JSON.stringify({ ok: false, error: "no charts provided (POST JSON or use ?source=repo)" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  await store.setJSON("depth-charts.json", charts);
  await store.setJSON("meta-rosters.json", {
    updatedAt: new Date().toISOString(),
    teams: Object.keys(charts || {}).length,
    source: source || (req.method === "POST" ? "api" : "unknown"),
  });

  return new Response(JSON.stringify({ ok: true, wrote: "depth-charts.json" }), {
    headers: { "content-type": "application/json" },
  });
}
