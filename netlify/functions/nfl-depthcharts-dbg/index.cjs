// netlify/functions/nfl-depthcharts-dbg/index.cjs
// Deep diagnostics for Netlify Blobs connectivity and local fallbacks.
const path = require('path');
const fs = require('fs');
const { getStore } = require('@netlify/blobs');

function short(s) {
  if (!s) return null;
  return s.slice(0, 4) + "…" + s.slice(-4);
}

async function tryStore(name, opts, keyBase) {
  const out = { method: opts ? "getStore(name, {siteID, token})" : "getStore(name)", ok: false };
  try {
    const store = opts ? getStore(name, opts) : getStore(name);
    const key = `diagnostics/${keyBase}-${Date.now()}.json`;
    const payload = { ping: true, ts: new Date().toISOString(), method: out.method };
    await store.set(key, JSON.stringify(payload), { contentType: 'application/json' });
    const got = await store.get(key);
    out.ok = Boolean(got);
    out.key = key;
    if (got) {
      out.bytes = (await got.blob()).size;
    }
  } catch (e) {
    out.error = String(e);
  }
  return out;
}

exports.handler = async () => {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;

  const info = {
    node: process.version,
    env: {
      HAS_SITE_ID: Boolean(siteID),
      HAS_TOKEN: Boolean(token),
      SITE_ID_PREVIEW: short(siteID),
      TOKEN_PREVIEW: short(token)
    },
    attempts: [],
    local: {}
  };

  // Attempt A: explicit credentials
  info.attempts.push(await tryStore("nfl-td", siteID && token ? { siteID, token } : null, "explicit"));

  // Attempt B: implicit (platform-provided)
  info.attempts.push(await tryStore("nfl-td", null, "implicit"));

  // Local paths that depthcharts-get would use
  const here = __dirname;
  const localCurrent = path.join(here, "..", "nfl-depthcharts-get", "_data", "nfl", "current.json");
  const localWeek1   = path.join(here, "..", "nfl-depthcharts-get", "_data", "nfl", "2025", "week1", "depth-charts.json");
  info.local = {
    here,
    exists: {
      current: fs.existsSync(localCurrent),
      week1: fs.existsSync(localWeek1)
    },
    paths: {
      current: localCurrent,
      week1: localWeek1
    }
  };

  const ok = info.attempts.some(a => a.ok);
  return { statusCode: 200, body: JSON.stringify({ ok, info }) };
};
