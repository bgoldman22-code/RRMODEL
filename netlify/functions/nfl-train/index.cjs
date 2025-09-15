
'use strict';

const { saveToBlobs } = require('../_lib/blobs-helper.cjs');
const { fetchSeasonCSV, parseCSVBasic, computeTeamForm } = require('../_lib/fastr-sources.cjs');

exports.handler = async (event) => {
  const started = new Date().toISOString();
  const qs = event && event.queryStringParameters || {};
  const yearsParam = qs.years;
  const force = String(qs.force || '').trim();
  const logs = [];

  if (!force) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: false, error: "missing_force", msg: "Append ?force=1 to retrain.", updated: started })
    };
  }

  let years = [];
  if (yearsParam) {
    years = yearsParam.split(',').map(s => Number(s.trim())).filter(Boolean);
  } else {
    const yr = new Date().getUTCFullYear();
    years = [yr-3, yr-2, yr-1, yr];
  }

  const seasonResults = [];
  let combined = [];
  for (const y of years) {
    try {
      const txt = await fetchSeasonCSV(y);
      logs.push({ level: "info", year: y, bytes: txt.length });
      const rows = parseCSVBasic(txt);
      seasonResults.push({ year: y, ok: true, status: 200, rowsProcessed: rows.length });
      combined = combined.concat(rows);
    } catch (e) {
      seasonResults.push({ year: y, ok: false, reason: e.code || e.message, status: e.status || 500 });
      logs.push({ level: "warn", year: y, err: e.message || String(e) });
    }
  }

  const features = computeTeamForm(combined);
  let persisted = false, wrote = null, persist_error = null;
  try {
    await saveToBlobs("team_form.json", { updated: started, years, features });
    persisted = true; wrote = "team_form.json";
  } catch (e) {
    persist_error = e.message || String(e);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      meta: { years, persisted, wrote, persist_error },
      summary: { teams: Object.keys(features).length },
      seasonResults,
      logs,
      updated: started
    })
  };
};
