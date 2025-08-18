import { getStore } from "@netlify/blobs";

export default async (req, res) => {
  try {
    const store = getStore(process.env.BLOBS_STORE || "mlb-odds");
    const snap = await store.get("latest.json");

    let diag = { ok: true, env_present: !!process.env.THEODDS_API_KEY };

    if (!snap) {
      // Try probe
      try {
        const apiKey = process.env.THEODDS_API_KEY;
        const sport = process.env.ODDSAPI_SPORT_KEY || "baseball_mlb";
        const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds?regions=us&markets=batter_home_runs&apiKey=${apiKey}`;
        const r = await fetch(url);
        const j = await r.json();
        diag.probe = { len: j?.length || 0 };
      } catch (e) {
        diag.probe = { error: e.message };
      }
      return res.json({ ok: true, env_present: diag.env_present, has_hr_market: false, events_count: 0, probe: diag.probe });
    }

    return res.json({
      ok: true,
      env_present: diag.env_present,
      has_hr_market: true,
      ts: snap.ts,
      market: snap.market,
      events_count: snap.raw?.length || 0,
      sample: (snap.raw?.[0]?.bookmakers || []).slice(0, 3),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};