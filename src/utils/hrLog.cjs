// Simple picks logger for Netlify Blobs (CommonJS)
const { createBlob, list, getBlob } = require('@netlify/blobs');

const ROOT = 'mlb-hr/logs'; // e.g., mlb-hr/logs/2025-08-20.json

function dateKey(d = new Date(), tzOffsetMinutes = 0) {
  const dt = new Date(d.getTime() + tzOffsetMinutes * 60000);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${ROOT}/${yyyy}-${mm}-${dd}.json';
}

/**
 * Write/overwrite the day's picks.
 * @param {Object} payload - { date, league_hr_total, picks: [...], diagnostics: {...} }
 * @param {Date} [when] - JS Date for keying, defaults now
 * @param {number} [tzOffsetMin] - offset minutes if you want ET dating
 */
async function writeDailyPicks(payload, when, tzOffsetMin = 0) {
  const key = dateKey(when, tzOffsetMin);
  await createBlob({
    key,
    data: Buffer.from(JSON.stringify(payload, null, 2)),
    contentType: 'application/json',
  });
  return key;
}

/** Get a day’s picks JSON (object or null) */
async function readDailyPicks(isoDate) {
  const key = `${ROOT}/${isoDate}.json`;
  const res = await getBlob({ key });
  if (!res || !res.body) return null;
  return JSON.parse(res.body.toString());
}

/** List recent day keys (descending) */
async function listRecent(limit = 14) {
  const items = await list({ prefix: ROOT + '/' });
  const sorted = items.sort((a, b) => (a.key < b.key ? 1 : -1));
  return sorted.slice(0, limit).map(x => x.key);
}

module.exports = { writeDailyPicks, readDailyPicks, listRecent, dateKey, ROOT };
