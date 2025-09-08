
'use strict';
const fs = require('fs');
const path = require('path');
const { getStore } = require('@netlify/blobs');

async function readSchedule(season = 2025) {
  // 1) Try Netlify Blobs (persisted after refresh)
  try {
    const store = getStore({ name: 'schedules' });
    const blobKey = `${season}/full.json`;
    const fromBlobs = await store.get(blobKey, { type: 'json' });
    if (fromBlobs && fromBlobs.season) return { data: fromBlobs, source: `blobs:${blobKey}` };
  } catch (e) { /* ignore and fallback */ }

  // 2) Try shared repo data override
  const shared = path.resolve(__dirname, '../..', 'data/nfl', String(season), 'schedule.full.json');
  if (fs.existsSync(shared)) {
    return { data: JSON.parse(fs.readFileSync(shared, 'utf8')), source: shared };
  }

  // 3) Fallback to function-local stub
  const local = path.resolve(__dirname, './_data/schedule.json');
  return { data: JSON.parse(fs.readFileSync(local, 'utf8')), source: local };
}
exports.handler = async (event) => {
  try {
    const qs = (event && event.queryStringParameters) || {};
    const season = qs.season ? parseInt(qs.season, 10) : 2025;
    const { data: sched, source } = await readSchedule(season);
    const weekStr = qs.week ? String(parseInt(qs.week, 10)) : '1';
    const games = (sched.weeks && sched.weeks[weekStr]) ? sched.weeks[weekStr] : [];
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, season: sched.season, week: parseInt(weekStr,10), games, meta: { source } })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:String(err && err.message ? err.message : err) }) };
  }
};
