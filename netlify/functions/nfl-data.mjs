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
  } catch (e) {
    return { __error: "repo_read_failed", message: String(e) };
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");       // e.g., "depth-charts"
  const source = url.searchParams.get("source");   // optional: "repo"
  const debug = url.searchParams.get("debug") === "1";
  const storeName = process.env.NFL_TD_BLOBS || "nfl-td";

  if (!type) {
    return new Response(JSON.stringify({ ok: false, error: "missing `type`" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  if (source === "repo") {
    const repo = await readRepoJSON(type);
    const ok = repo && !repo.__error && Object.keys(repo).length > 0;
    return new Response(JSON.stringify(ok ? repo : { ok: false, error: repo?.__error || "repo empty" }), {
      status: ok ? 200 : 404, headers: { "content-type": "application/json" },
    });
  }

  let blobsErr = null;
  try {
    const store = getStore({ name: storeName });
    const data = await store.getJSON(`${type}.json`);
    if (data && Object.keys(data).length) {
      return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
    }
  } catch (e) {
    blobsErr = String(e);
  }

  const repo = await readRepoJSON(type);
  const payload = repo && !repo.__error ? repo : null;
  const body = debug
    ? { ok: false, from: "fallback-repo", storeName, blobsErr, repoError: repo?.__error || null }
    : (payload || { ok: false, error: "no data" });
  const status = payload ? 200 : 404;
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
