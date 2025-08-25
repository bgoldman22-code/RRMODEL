// netlify/functions/nfl-rosters-list.mjs
// Minimal placeholder that just returns ok (no blobs usage here).
export const handler = async (event) => {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok:true, keys: { blobs: [], directories: [] } })
  };
};