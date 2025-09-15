
const { loadFromBlobs, openStore } = await (async () => {
  // dynamic import ESM helper from CJS file
  const mod = await import('../_lib/blobs-helper.mjs');
  return { loadFromBlobs: mod.loadFromBlobs, openStore: mod.openStore };
})();

exports.handler = async () => {
  const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
  const store = await openStore(storeName);
  const hasTeamForm = !!(await loadFromBlobs("team_form.json", { storeName }));
  return {
    statusCode: 200,
    headers: { "content-type":"application/json" },
    body: JSON.stringify({ ok: true, store: storeName, hasTeamForm, now: new Date().toISOString() })
  };
};
