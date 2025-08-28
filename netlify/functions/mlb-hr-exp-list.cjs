const { getBlobsStore } = require('./_blobs.cjs');

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const days = Math.max(1, Math.min(31, parseInt(qs.days || '7', 10)));
    const store = getBlobsStore();
    const prefix = 'mlb-hr/experiments/';
    const listing = await store.list({ prefix });
    const blobs = (listing?.blobs || []).map(b => ({
      key: b.key, size: b.size, uploadedAt: b.uploadedAt
    })).sort((a,b) => (a.key < b.key ? 1 : -1));

    const byDate = {};
    for (const b of blobs){
      const parts = b.key.split('/');
      const idx = parts.indexOf('experiments');
      if (idx >= 0 && parts.length > idx+1){
        const date = parts[idx+1];
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(b);
      }
    }
    const dates = Object.keys(byDate).sort((a,b)=> (a<b?1:-1)).slice(0, days);
    const out = dates.map(d => ({ date:d, items: byDate[d] }));

    return { statusCode: 200, headers: {'content-type':'application/json'},
      body: JSON.stringify({ ok:true, days: out.length, data: out }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: e?.message || 'Server error' }) };
  }
};
