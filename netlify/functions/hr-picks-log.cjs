const { listRecent, readDailyPicks } = require('../../src/utils/hrLog.cjs');

exports.handler = async (event) => {
  try {
    const qs = event.rawQuery || '';
    const params = new URLSearchParams(qs);
    const days = Math.max(1, Math.min(31, parseInt(params.get('days') || '7', 10)));

    const keys = await listRecent(days + 5);
    const out = [];
    for (const key of keys.slice(0, days)) {
      const iso = key.split('/').pop().replace('.json', '');
      const obj = await readDailyPicks(iso);
      if (obj) out.push({ date: iso, count: (obj.picks || []).length, data: obj });
    }

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({ ok: true, days: out.length, logs: out }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
