import { getBlobsStore } from "./_blobs.js";

const createStore = (name) => getBlobsStore(name);

async function readJSON(store, key, fallback = null) {
  try {
    const val = await store.get(key, { type: "json" });
    return (val === undefined || val === null) ? fallback : val;
  } catch (e) {
    return fallback;
  }
}

// netlify/functions/mlb-daily-learn.mjs

function todayISO() {
  const now = new Date();
  return now.toISOString().slice(0,10);
}

export async function handler(event, context) {
  try {
    const store = createStore();
    const url = new URL(event.rawUrl || `https://${event.headers.host}${event.path}${event.rawQuery ? "?" + event.rawQuery : ""}`);
    const date = url.searchParams.get("date") || todayISO();

    const selfBase = `https://${event.headers.host}`;
    const computeURL = `${selfBase}/.netlify/functions/mlb-learn?date=${encodeURIComponent(date)}&run=true`;
    const rsp = await fetch(computeURL, { headers: { "accept": "application/json" } });
    if (!rsp.ok) {
      return { statusCode: 502, body: JSON.stringify({ ok:false, step:"fetch", date, error:`compute endpoint ${rsp.status}`, url: computeURL }) };
    }
    const data = await rsp.json();
    if (!data || data.ok === false) {
      return { statusCode: 500, body: JSON.stringify({ ok:false, step:"compute", date, error:(data && data.error) || "learn returned not ok", url: computeURL }) };
    }

    const dayKey = `learn/daily/${date}.json`;
    await writeJSON(store, dayKey, data);

    const manifestKey = "learn/manifest.json";
    const manifest = (await readJSON(store, manifestKey)) || [];
    if (!manifest.includes(date)) manifest.push(date);
    manifest.sort();
    await writeJSON(store, manifestKey, manifest);

    const latest = {
      ok: true,
      date,
      saved: dayKey,
      results_meta: {
        samples: data.samples ?? data.sample_count ?? data.count ?? null,
        picks_today: data.picksToday ?? data.picks_today ?? data.picks ?? null,
      },
      at: new Date().toISOString()
    };
    await writeJSON(store, "learn/latest.json", latest);

    return { statusCode: 200, body: JSON.stringify({ ok:true, date, saved: dayKey, manifest_days: manifest.length, latest }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(err) }) };
  }
}