// netlify/functions/_lib/http-helpers.cjs
const https = require("https");
const { setTimeout: sleep } = require("timers/promises");

/**
 * Fetch with retries and mirror fallbacks.
 * @param {string[]} urls - ordered list of mirrors to try
 * @param {object} opts - fetch options { retries, timeoutMs }
 * @returns {Promise<{ok:boolean, status:number, url:string, buffer:Buffer, error?:any}>}
 */
async function fetchWithMirrors(urls, opts = {}) {
  const { retries = 2, timeoutMs = 15000 } = opts;
  const headers = {
    "User-Agent": "bgroundrobin-nfl-train/1.0 (+https://bgroundrobin.com)",
    "Accept": "*/*",
    "Accept-Encoding": "gzip,deflate,br",
    "Connection": "keep-alive",
  };

  const tryFetch = (url) =>
    new Promise((resolve) => {
      const req = https.get(url, { headers, timeout: timeoutMs }, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, url, buffer });
        });
      });
      req.on("timeout", () => {
        req.destroy(new Error("ETIMEDOUT"));
      });
      req.on("error", (error) => resolve({ ok: false, status: 0, url, buffer: Buffer.alloc(0), error }));
    });

  for (const url of urls) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await tryFetch(url);
      if (res.ok) return res;
      const backoff = Math.min(2000 * (attempt + 1), 6000);
      await sleep(backoff);
    }
  }
  return { ok: false, status: 0, url: urls[urls.length - 1], buffer: Buffer.alloc(0), error: new Error("All mirrors failed") };
}

/**
 * Build mirrors for nflfastR games .csv.gz path for a given year
 */
function buildNflfastRMirrors(year) {
  const path = `data/games/${year}.csv.gz`;
  return [
    `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/${path}`,
    `https://github.com/nflverse/nflfastR-data/raw/master/${path}`,
    `https://cdn.jsdelivr.net/gh/nflverse/nflfastR-data@master/${path}`,
    `https://raw.fastgit.org/nflverse/nflfastR-data/master/${path}`,
  ];
}

module.exports = { fetchWithMirrors, buildNflfastRMirrors };