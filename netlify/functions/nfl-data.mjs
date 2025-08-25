import { getStore } from "@netlify/blobs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const REPO_PATHS = {
  "depth-charts": "data/nfl-td/depth-charts.json",
};

async function readRepoJSON(key) {
  const rel = REPO_PATHS[key];
  if (!rel) return null;
  try {
    const full = join(process.cwd(), rel);
    const txt = await readFile(full, "utf-8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");       // e.g., "depth-charts"
  const source = url.searchParams.get("source");   // optional: "repo"
  const storeName = process.env.NFL_TD_BLOBS || "nfl-td";

  if (!type) {
    return new Response(JSON.stringify({ ok: false, error: "missing `type`" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Force repo if caller asks for it
  if (source === "repo") {
    const repo = await readRepoJSON(type);
    if (repo) {
      return new Response(JSON.stringify(repo), { headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false, error: "repo file missing" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  // Try Blobs first
  try {
    const store = getStore({ name: storeName });
    const data = await store.getJSON(`${type}.json`);
    if (data) {
      return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
    }
  } catch (e) {
    // swallow and fall back
  }

  // Fall back to repo JSON
  const repo = await readRepoJSON(type);
  if (repo) {
    return new Response(JSON.stringify(repo), { headers: { "content-type": "application/json" } });
  }

  return new Response(JSON.stringify({ ok: false, error: "no data" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
