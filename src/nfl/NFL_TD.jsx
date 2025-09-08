import { useEffect, useState } from "react";

export default function NFL_TD() {
  const [sched, setSched] = useState(null);
  const [charts, setCharts] = useState(null);
  const [cands, setCands] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const s = await fetch("/.netlify/functions/nfl-schedule").then(r => r.json());
        setSched(s);
        const d = await fetch("/.netlify/functions/nfl-depthcharts").then(r => r.json());
        setCharts(d);
        const c = await fetch("/.netlify/functions/nfl-td-candidates").then(r => r.json());
        setCands(c);
      } catch (e) {
        setErr(String(e));
      }
    })();
  }, []);

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold">NFL TD – Step 1 Sanity</h1>
      {err && <div className="text-red-600">Error: {err}</div>}

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Schedule</h2>
        <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto">
          {sched ? JSON.stringify(sched, null, 2) : "Loading..."}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Depth Charts</h2>
        <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto">
          {charts ? JSON.stringify(charts, null, 2) : "Loading..."}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">TD Candidates (scaffold)</h2>
        <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto">
          {cands ? JSON.stringify(cands, null, 2) : "Loading..."}
        </pre>
        <p className="text-sm text-gray-600">
          Expect td_prob = null and notes = "scaffold" in Step 1. We wire probabilities in Step 2.
        </p>
      </section>
    </div>
  );
}
