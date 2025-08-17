// netlify/functions/mlb-slate-lite_orig.mjs
// Minimal shim so the wrapper can import something and not crash.
// Replace this later with your real original once you locate/restore it.

export const handler = async (event) => {
  const nowET = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const payload = {
    ok: true,
    source: "shim",
    dateET: nowET.split(",")[0] ?? null,
    candidates: [],        // <-- empty so UI won’t explode; just renders “0 candidates”
    diagnostics: {
      note: "mlb-slate-lite_orig.mjs shim; replace with real original when ready"
    }
  };
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  };
};
