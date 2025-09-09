const { NetlifyBlobs } = require('@netlify/blobs');
const zlib = require('zlib');
const { parse } = require('csv-parse/sync');

async function fetchGzCsv(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const gunzipped = zlib.gunzipSync(buf);
  return gunzipped.toString('utf8');
}

async function getStore() {
  try {
    const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE;
    if (!name) return null;
    const client = new NetlifyBlobs();
    return client.getStore(name);
  } catch (_) { return null; }
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const season = Number(q.season || '2025');
    const dryRun = String(q.dryRun || '0') === '1';

    const urls = [
      `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`,
      `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season-1}.csv.gz`
    ];

    let csv = null, hit = null, tried = [];
    for (const u of urls) {
      try {
        csv = await fetchGzCsv(u);
        hit = u;
        break;
      } catch (e) {
        tried.push({ url: u, error: String(e.message || e) });
      }
    }
    if (!csv) {
      return { statusCode: 502, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:'Failed to fetch pbp CSV (releases)', tried }) };
    }

    // Parse a small sample to validate
    const rows = parse(csv.split('\n').slice(0, 1000).join('\n'), { columns: true, skip_empty_lines: true });
    const totalRows = (csv.match(/\n/g) || []).length;

    if (dryRun) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok:true, season, source:'nflverse-data releases', url: hit, sampleRows: rows.length, approxLines: totalRows })
      };
    }

    const store = await getStore();
    let blobKey = null;
    if (store) {
      blobKey = `history/${season}/pbp.csv`;
      await store.set(blobKey, csv, { contentType: 'text/csv; charset=utf-8' });
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok:true, season, source:'nflverse-data releases', url: hit, stored: !!store, blobKey, sampleRows: rows.length, approxLines: totalRows })
    };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err && err.stack || err) }) };
  }
};