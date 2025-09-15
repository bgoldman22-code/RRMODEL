// ESM Netlify Function: nfl-train (resilient sources + blobs write)
import { saveToBlobs } from '../_lib/blobs-helper.mjs';

const YEARS_DEFAULT = [2022, 2023, 2024, 2025];

// Candidate URL factories. We try each until one works for a given year.
const sources = [
  (y) => `https://raw.githubusercontent.com/nflverse/nflverse-data/master/games/games_${y}.csv`, // new layout (if exists)
  (y) => `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/games_${y}.csv.gz`, // legacy
  // Single-file (all years) fallback; we'll fetch once and filter in code when used with single year.
  () => `https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv`
];

async function fetchFirst(year) {
  const seen = new Set();
  for (const f of sources) {
    const url = f(year);
    if (seen.has(url)) continue; seen.add(url);
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (r.ok) {
        const buf = await r.arrayBuffer();
        return { ok: true, url, buf };
      }
    } catch {}
  }
  return { ok: false, urlTried: Array.from(seen) };
}

// extremely light parser: just used to count rows & collect team names
function scanCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines.shift() || '';
  const idxHome = header.split(',').findIndex(h => /home_team/i.test(h));
  const idxAway = header.split(',').findIndex(h => /away_team/i.test(h));
  const teams = new Set();
  for (const line of lines) {
    const cols = line.split(',');
    if (idxHome >= 0 && cols[idxHome]) teams.add(cols[idxHome]);
    if (idxAway >= 0 && cols[idxAway]) teams.add(cols[idxAway]);
  }
  return { rows: lines.length, teams: Array.from(teams).sort() };
}

export const handler = async (event) => {
  const qp = event.queryStringParameters || {};
  const force = qp.force === '1' || qp.force === 'true';
  const years = (qp.years ? qp.years.split(',').map(s => +s.trim()) :
                 qp.season ? [+qp.season] : YEARS_DEFAULT).filter(Boolean);

  const seasonResults = [];
  let teamSet = new Set();
  let totalRows = 0;
  for (const y of years) {
    const got = await fetchFirst(y);
    if (!got.ok) {
      seasonResults.push({ year: y, ok: false, reason: 'no_source', tried: got.urlTried });
      continue;
    }
    // Attempt gunzip if it's gz (by signature), else treat as text.
    let text;
    const bytes = new Uint8Array(got.buf);
    const isGz = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    if (isGz) {
      // Lazy gunzip via Web Streams API if available; otherwise bail to Node zlib.
      const { gunzipSync } = await import('node:zlib');
      text = new TextDecoder().decode(gunzipSync(bytes));
    } else {
      text = new TextDecoder().decode(bytes);
    }
    const scan = scanCSV(text);
    totalRows += scan.rows;
    scan.teams.forEach(t => teamSet.add(t));
    seasonResults.push({ year: y, ok: true, status: 200, rowsProcessed: scan.rows, source: got.url });
  }

  const meta = {
    years,
    persisted: false,
    wrote: null,
    persist_error: null
  };

  // Minimal feature: team_form = each team default 0 rating (placeholder)
  const features = { updated: new Date().toISOString(), teams: Array.from(teamSet).sort(), form: {} };

  try {
    if (force && teamSet.size) {
      await saveToBlobs('team_form.json', features);
      meta.persisted = true;
      meta.wrote = 'team_form.json';
    }
  } catch (e) {
    meta.persist_error = String(e.message || e);
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      meta,
      summary: { teams: teamSet.size, totalRows },
      seasonResults,
      updated: new Date().toISOString()
    })
  };
};

export default { handler };
