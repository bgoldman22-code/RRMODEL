
NFL Predictions — TRAIN/SCORE fix patch (v7)

What this does
--------------
• Converts all functions to lazy-require the local _blobs helper so that any
  dependency/env problem is reported as JSON instead of a Netlify HTML 500.
• Ships a _blobs.cjs wrapper around @netlify/blobs (v7 API).
• Adds a diagnostics function: /.netlify/functions/nfl-predictions-diag

Required env
------------
• BLOBS_STORE_NFL = your store name (e.g. nfl-td or rrmodelblobs)
• NETLIFY_SITE_ID
• NETLIFY_BLOBS_TOKEN

Test URLs (tokenless for now via ?open=1)
----------------------------------------
1) TRAIN:
   https://YOUR_SITE/.netlify/functions/nfl-predictions-train?open=1

2) SCORE:
   https://YOUR_SITE/.netlify/functions/nfl-predictions-score?open=1

3) GET:
   https://YOUR_SITE/.netlify/functions/nfl-predictions-get

4) DIAG:
   https://YOUR_SITE/.netlify/functions/nfl-predictions-diag
