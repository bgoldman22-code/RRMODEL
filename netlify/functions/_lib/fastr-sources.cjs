
// netlify/functions/_lib/fastr-sources.cjs
// Minimal fetchers for nflverse games CSV with resilient fallbacks.
const https = require('https');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error("HTTP " + res.statusCode + " for " + url));
        res.resume?.();
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Primary (current) location used by nflverse:
// https://github.com/nflverse/nflverse-data/releases/download/games/games_YYYY.csv
function primaryUrl(year) {
  return `https://raw.githubusercontent.com/nflverse/nflverse-data/releases/download/games/games_${year}.csv`;
}

// Extra fallback mirrors (less likely needed)
function fallbackUrls(year) {
  return [
    `https://github.com/nflverse/nflverse-data/releases/download/games/games_${year}.csv`,
    // Legacy (was used historically and now 404s; kept as last resort):
    `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/${year}.csv.gz`
  ];
}

async function fetchSeasonCsv(year) {
  const urls = [primaryUrl(year), ...fallbackUrls(year)];
  const errors = [];
  for (const u of urls) {
    try {
      const txt = await fetchText(u);
      if (txt && txt.length > 1000) return { ok: true, url: u, text: txt };
    } catch (e) {
      errors.push({ url: u, error: String(e.message || e) });
    }
  }
  return { ok: false, errors };
}

function simpleCsvParse(text) {
  // very light CSV parser (assumes no embedded commas in quoted fields for speed)
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(',');
  return lines.map(line => {
    const cells = line.split(',');
    const obj = {};
    for (let i=0;i<header.length;i++) obj[header[i]] = cells[i];
    return obj;
  });
}

module.exports = { fetchSeasonCsv, simpleCsvParse };
