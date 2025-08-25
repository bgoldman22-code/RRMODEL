import React, { useEffect, useMemo, useState } from "react";

async function getJSON(url) {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error("GET", url, "failed:", err);
    return null;
  }
}

// Depth charts loader that avoids Netlify Blobs; prefers repo fallback.
async function fetchDepthCharts() {
  // Try generic handler (which should fall back to repo if blobs empty)
  let j = await getJSON("/.netlify/functions/nfl-data?type=depth-charts");
  if (j) {
    const payload = j.data ?? j;
    if (payload && typeof payload === "object" && Object.keys(payload).length) return payload;
    if (j.error && String(j.error).includes("MissingBlobsEnvironmentError")) {
      // Force repo if we detect a blobs error shape
      j = await getJSON("/.netlify/functions/nfl-data?type=depth-charts&source=repo");
      const forced = j?.data ?? j;
      if (forced && Object.keys(forced).length) return forced;
    }
  }

  // Force repo regardless, as a safe fallback
  const repoOnly = await getJSON("/.netlify/functions/nfl-data?type=depth-charts&source=repo");
  const repoPayload = repoOnly?.data ?? repoOnly;
  if (repoPayload && typeof repoPayload === "object" && Object.keys(repoPayload).length) return repoPayload;

  return null;
}

export default function NFL() {
  const [depthCharts, setDepthCharts] = useState(null);
  const [status, setStatus] = useState({ rosters: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const charts = await fetchDepthCharts();
        if (!alive) return;
        setDepthCharts(charts);
        setStatus((s) => ({ ...s, rosters: charts ? "ok" : "missing" }));
      } catch (e) {
        if (!alive) return;
        console.error("fetchDepthCharts fatal", e);
        setStatus((s) => ({ ...s, rosters: "missing" }));
      }
    })();
    return () => { alive = false; };
  }, []);

  const rosterCount = useMemo(() => {
    if (!depthCharts || typeof depthCharts !== "object") return 0;
    return Object.keys(depthCharts).length;
  }, [depthCharts]);

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">NFL — Anytime TD</h1>
      <div className="text-sm text-gray-600 mb-4">
        rosters:{status.rosters}{rosterCount ? ` • teams:${rosterCount}` : ""}
      </div>

      {!depthCharts && (
        <div className="rounded-lg border p-3 text-sm">
          Couldn&apos;t load depth charts via repo fallback.
          Make sure <code>data/nfl-td/depth-charts.json</code> exists in the repo and that
          <code>/.netlify/functions/nfl-data</code> can read it (supports <code>?source=repo</code>).
        </div>
      )}

      {depthCharts && (
        <pre className="text-xs overflow-auto max-h-[55vh] border rounded p-2 bg-gray-50">
{JSON.stringify(depthCharts, null, 2)}
        </pre>
      )}
    </div>
  );
}
