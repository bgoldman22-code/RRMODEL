// CJS shim for odds-status to avoid ESM require() errors
// Drop this file into netlify/functions/odds-status/index.cjs
// and remove/rename any previous odds-status.mjs to avoid routing collisions.
exports.handler = async () => {
  const store = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
  let hasTeamForm = false;
  try {
    // blobs-helper is ESM; use dynamic import from CJS
    const helper = await import("../_lib/blobs-helper.mjs");
    if (helper && typeof helper.exists === "function") {
      hasTeamForm = !!(await helper.exists("team_form.json", store));
    } else if (helper && typeof helper.get === "function") {
      const v = await helper.get("team_form.json", store);
      hasTeamForm = !!v;
    }
  } catch (e) {
    // Silent: this endpoint is diagnostic; if blobs not available, just report false
    console.log("[odds-status] blobs check skipped:", e?.message || e);
  }
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true, store, hasTeamForm, now: new Date().toISOString() })
  };
};
