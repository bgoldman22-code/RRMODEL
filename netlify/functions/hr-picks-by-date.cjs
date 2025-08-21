const { readDailyPicks } = require('../../src/utils/hrLog.cjs');

exports.handler = async (event) => {
  try {
    const qs = event.rawQuery || '';
    const params = new URLSearchParams(qs);
    const date = params.get('date'); // YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Provide ?date=YYYY-MM-DD' }) };
    }
    const data = await readDailyPicks(date);
    if (!data) return { statusCode: 404, body: JSON.stringify({ ok: false, error: 'Not found for date' }) };

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({ ok: true, data }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
