import { useEffect, useState } from "react";

export default function useDiagJson(url) {
  const [data, setData] = useState(null);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let aborted = false;
    async function run() {
      try {
        const res = await fetch(url, { headers: { "accept": "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        // Try JSON; some lambdas respond with text on diag
        let json = null;
        try { json = JSON.parse(text); } catch {
          json = { raw: text };
        }
        if (!aborted) {
          setData(json);
          setOk(true);
        }
      } catch (e) {
        if (!aborted) {
          setErr(String(e));
          setOk(false);
        }
      }
    }
    run();
    return () => { aborted = true; };
  }, [url]);

  return { data, ok, err };
}
