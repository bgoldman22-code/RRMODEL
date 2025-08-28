// ESM
import { getBlobsStore } from "./_blobs.js";

export async function handler(event) => {
  try {
    const params = new URLSearchParams(event.rawQuery || event.queryStringParameters || {});
    const model = params.get("model") || "mlb_hits2";
    const date  = params.get("date")  || ""; // optional

    const storeName = process.env.BLOBS_STORE || "mlb-odds";
    const store = getBlobsStore(storeName);

    // what we try to read (same keys you were checking)
    const tbKey   = "props/latest_tb.json";
    const hrrbiKey= "props/latest_hrrbi.json";

    const [tb, hrrbi] = await Promise.all([
      store.getJSON(tbKey).catch(e => `ERR: ${e?.message || e}`),
      store.getJSON(hrrbiKey).catch(e => `ERR: ${e?.message || e}`),
    ]);

    return resp({ ok: true, model, date, store: storeName, snapshots: {
      [tbKey]:   tb,
      [hrrbiKey]:hrrbi
    }});
  } catch (e) {
    return resp({ ok:false, error: e?.message || String(e) }, 500);
  }
};

function resp(body, statusCode = 200) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
