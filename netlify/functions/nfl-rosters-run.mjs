import { getStore } from "@netlify/blobs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

function corsHeaders() {
  return {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-nfl-secret",
  };
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response("", { headers: corsHeaders() });
  }

  const url = new URL(req.url);
  const source = url.searchParams.get("source"); // "repo" to seed from repo file
  const requireSecret = !!process.env.NFL_BLOBS_SECRET;
  const passed = req.headers.get("x-nfl-secret");

  if (requireSecret && passed !== process.env.NFL_BLOBS_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: corsHeaders() });
  }

  const storeName = process.env.NFL_TD_BLOBS || "nfl-td";
  let charts = null;

  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body === "object") charts = body;
    } catch {}
  }

  if (!charts && source === "repo") {
    try {
      const txt = await readFile(join(process.cwd(), "data/nfl-td/depth-charts.json"), "utf-8");
      charts = JSON.parse(txt);
    } catch {}
  }

  if (!charts) {
    return new Response(JSON.stringify({ ok: false, error: "no charts provided (POST JSON or use ?source=repo)" }), {
      status: 400, headers: corsHeaders(),
    });
  }

  const store = getStore({ name: storeName });
  await store.setJSON("depth-charts.json", charts);
  await store.setJSON("meta-rosters.json", {
    updatedAt: new Date().toISOString(),
    teams: Object.keys(charts || {}).length,
    source: source || (req.method === "POST" ? "api" : "unknown"),
  });

  return new Response(JSON.stringify({ ok: true, wrote: "depth-charts.json", store: storeName }), {
    headers: corsHeaders(),
  });
}
