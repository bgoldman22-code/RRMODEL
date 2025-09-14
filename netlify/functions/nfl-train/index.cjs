// CommonJS Netlify Function: nfl-train
// Purpose: Train and write team_form.json while gracefully skipping missing seasons
// and honoring env var TRAIN_YEARS and query param ?years=.
const zlib = require('zlib');

// Simple response helpers
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function parseQueryParams(event) {
  const url = new URL(event.rawUrl || `https://dummy${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`);
  const params = Object.fromEntries(url.searchParams.entries());
  return params;
}

function resolveYears(params) {
  const clampMin = y => Math.max(2018, Number(y)); // clamp to 2018+ to avoid nflfastR old paths
  // Accept hierarchy: query ?years=2022,2023 -> env TRAIN_YEARS -> default recent set
  let list = [];
  if (params.years) {
    list = params.years.split(',').map(s => s.trim()).filter(Boolean);
  } else if (process.env.TRAIN_YEARS) {
    list = process.env.TRAIN_YEARS.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    list = ['2022','2023','2024','2025'];
  }
  const years = Array.from(new Set(list.map(clampMin).filter(n => Number.isFinite(n)))).sort();
  return years;
}

async function fetchSeasonCsv(year) {
  const url = `https://raw.githubusercontent.com/nflverse/nflfastR-data/master/data/games/${year}.csv.gz`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[TRAIN] skip year ${year}: HTTP ${res.status} (${url})`);
    return null;
  }
  const gz = Buffer.from(await res.arrayBuffer());
  try {
    const csv = zlib.gunzipSync(gz).toString('utf-8');
    return csv;
  } catch (e) {
    console.warn(`[TRAIN] skip year ${year}: gunzip failed: ${e.message}`);
    return null;
  }
}

// Extremely light "model": compute a per-team rolling average margin as a stand-in
// (Keeps the function useful even if upstream logic isn't present.)
function computeTeamForm(csvByYear) {
  // Expect csv with columns incl. home_team, away_team, result (home_score - away_score), etc.
  // We’ll be resilient to schema differences and just try a simple parse.
  const form = {}; // {TEAM: {games: n, marginAvg: x}}
  for (const { year, csv } of csvByYear) {
    const lines = csv.split(/\r?\n/);
    const header = lines.shift() || '';
    const cols = header.split(',');
    const idx = {
      home_team: cols.indexOf('home_team'),
      away_team: cols.indexOf('away_team'),
      home_score: cols.indexOf('home_score'),
      away_score: cols.indexOf('away_score'),
    };
    for (const req of Object.values(idx)) {
      if (req < 0) { continue; } // tolerate missing columns
    }
    for (const line of lines) {
      if (!line) continue;
      const parts = line.split(',');
      const H = parts[idx.home_team];
      const A = parts[idx.away_team];
      const hs = Number(parts[idx.home_score]);
      const as = Number(parts[idx.away_score]);
      if (!H || !A || !Number.isFinite(hs) || !Number.isFinite(as)) continue;
      const hMargin = hs - as;
      const aMargin = as - hs;
      for (const [team, margin] of [[H, hMargin],[A, aMargin]]) {
        if (!form[team]) form[team] = { games: 0, marginSum: 0 };
        form[team].games += 1;
        form[team].marginSum += margin;
      }
    }
  }
  const out = {};
  for (const [team, s] of Object.entries(form)) {
    out[team] = {
      games: s.games,
      margin_avg: s.games ? s.marginSum / s.games : 0,
      updated: new Date().toISOString(),
    };
  }
  return out;
}

exports.handler = async (event) => {
  const t0 = Date.now();
  const params = parseQueryParams(event || {});
  const years = resolveYears(params);
  const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'rrmodel-nfl';
  const { openStore } = await import('../_lib/blobs-helper.mjs');
  const store = await openStore(storeName);

  console.log('[TRAIN] start', { years, store: storeName });

  const csvByYear = [];
  for (const y of years) {
    try {
      const csv = await fetchSeasonCsv(y);
      if (csv) csvByYear.push({ year: y, csv });
    } catch (e) {
      console.warn(`[TRAIN] skip year ${y}: ${e.message}`);
    }
  }
  if (csvByYear.length === 0) {
    const body = { ok: false, error: 'No seasons fetched (check TRAIN_YEARS or ?years=)', years };
    console.error('[TRAIN] abort', body);
    return json(200, body);
  }

  // Compute and write team form
  const teamForm = computeTeamForm(csvByYear);
  await store.setJSON('team_form.json', teamForm);

  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  const resp = { ok: true, updated: new Date().toISOString(), years, meta: { source: 'model-epa-v1', wrote:'team_form.json', seconds:+dt } };
  console.log('[TRAIN] done', resp);
  return json(200, resp);
};
