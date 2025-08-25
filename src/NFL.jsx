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

async function fetchDepthCharts() {
  // Prefer Blobs via nfl-data
  let j = await getJSON("/.netlify/functions/nfl-data?type=depth-charts");
  if (j) {
    const payload = j.data ?? j;
    if (payload && typeof payload === "object" && Object.keys(payload).length) return payload;
  }
  // Force repo if blobs are empty/unavailable
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
      const charts = await fetchDepthCharts();
      if (!alive) return;
      setDepthCharts(charts);
      setStatus((s) => ({ ...s, rosters: charts ? "ok" : "missing" }));
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
          No depth charts available yet. Seed Blobs by visiting{" "}
          <code>/.netlify/functions/nfl-rosters-run?source=repo</code> once after deploy,
          or POST charts to <code>/.netlify/functions/nfl-rosters-run</code>.
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
