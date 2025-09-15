const path = require("path");
let makeStore;
try {
  // try requiring the ESM file through eval(require) shim inside blobs.mjs
  ({ makeStore } = require("../_lib/blobs.mjs"));
} catch (e) {
  makeStore = () => ({ name: process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td", hasBlobs: false, get: async () => null });
}

exports.handler = async () => {
  const store = makeStore();
  const hasTeamForm = store.hasBlobs ? !!(await store.get("team_form.json")) : false;
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      store: store.name,
      hasTeamForm,
      now: new Date().toISOString(),
    }),
  };
};
