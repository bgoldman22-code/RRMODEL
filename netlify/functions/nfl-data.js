import { getJSON } from './_lib/blobs.js';

export const handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `https://dummy.local${event.path}${event.queryString || ''}`);
    const type = url.searchParams.get('type') || 'schedule';
    const season = Number(url.searchParams.get('season') || 2025);
    const week = Number(url.searchParams.get('week') || 1);

    let key;
    if (type === 'schedule') key = `weeks/${season}/${week}/schedule.json`;
    else if (type === 'candidates') key = `weeks/${season}/${week}/candidates.json`;
    else if (type === 'depth-charts') key = `weeks/${season}/${week}/depth/*`; // placeholder (no glob here)
    else return json({ ok: false, error: 'unknown type' }, 400);

    const data = await getJSON(key);
    if (!data) return json({ ok: false, error: 'no data' }, 404);

    return json({ ok: true, data });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
};

function json(obj, status = 200) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
