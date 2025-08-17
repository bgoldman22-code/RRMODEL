// netlify/functions/mlb-slate-lite_orig.mjs
export const handler = async () => {
  const nowET = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      source: "shim",
      dateET: nowET.split(",")[0] ?? null,
      candidates: [],
      diagnostics: { note: "shim present; replace with real original when ready" }
    })
  };
};
