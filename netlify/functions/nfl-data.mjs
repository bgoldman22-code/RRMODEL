// netlify/functions/nfl-data.mjs
import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  try {
    const store = getStore({ name: 'nfl' });
    const params = event.queryStringParameters || {};
    const type = params.type;

    if (type === 'schedule') {
      const season = Number(params.season || 2025);
      const week = Number(params.week || 1);
      const key = `weeks/${season}/${week}/schedule.json`;
      const json = await store.get(key, { type: 'json' });
      if (!json) return resp({ ok: false, error: 'no data' }, 404);
      return resp({ ok: true, data: json });
    }

    if (type === 'depth-charts') {
      const season = Number(params.season || 2025);
      const week = Number(params.week || 1);
      const teamId = params.teamId;
      const prefix = `weeks/${season}/${week}/depth/`;
      if (teamId) {
        const json = await store.get(`${prefix}${teamId}.json`, { type: 'json' });
        return resp({ ok: !!json, data: json || null, teamId });
      }
      const list = await store.list({ prefix });
      return resp({ ok: true, keys: list.blobs.map(b => b.key) });
    }

    return resp({ ok: false, error: 'unknown type' }, 400);
  } catch (e) {
    return resp({ ok: false, error: String(e) }, 500);
  }
};

const resp = (body, statusCode = 200) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});