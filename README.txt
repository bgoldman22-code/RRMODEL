# Netlify functions patch (safe blobs + BvP helper)

Files to drop into your repo:

- netlify/functions/lib/blobs.js      (NEW)
- netlify/functions/lib/bvp.js        (NEW)

Edit **netlify/functions/mlb-preds-get.js**:
1) Replace the import:
   from:
     import { getStore } from '@netlify/blobs';
   to:
     import { getSafeStore } from './lib/blobs.js';

2) Replace the store creation:
     const store = getStore(process.env.BLOBS_STORE || 'mlb-odds');
   with:
     const store = getSafeStore();

3) Guard usages (if not already guarded):
     const raw = store ? await store.get('mlb_preds:' + date) : null;
     if (store) { await store.set('mlb_preds:' + date, JSON.stringify(resp), { ttl: 3600 }); }
