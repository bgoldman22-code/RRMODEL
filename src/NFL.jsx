import React, { useEffect, useState } from "react";

async function fetchDepthCharts() {
  // First attempt: use nfl-data (falls back to repo file if blobs empty)
  try {
    const res = await fetch("/.netlify/functions/nfl-data?type=depth-charts");
    if (res.ok) {
      const json = await res.json();
      if (json && Object.keys(json).length > 0) return json;
    }
  } catch (err) {
    console.error("nfl-data depth-charts fetch failed", err);
  }

  // Second attempt: try nfl-rosters-get
  try {
    const res2 = await fetch("/.netlify/functions/nfl-rosters-get");
    if (res2.ok) {
      const json2 = await res2.json();
      if (json2 && Object.keys(json2).length > 0) return json2;
    }
  } catch (err2) {
    console.error("nfl-rosters-get fetch failed", err2);
  }

  return null;
}

export default function NFL() {
  const [depthCharts, setDepthCharts] = useState(null);

  useEffect(() => {
    fetchDepthCharts().then(setDepthCharts);
  }, []);

  return (
    <div>
      <h1>NFL — Anytime TD</h1>
      <pre>{JSON.stringify(depthCharts, null, 2)}</pre>
    </div>
  );
}
