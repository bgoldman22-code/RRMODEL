# BTTS + NHL SOG Bundle

This zip contains the minimal set of files to add Soccer BTTS and NHL SOG models into a branch. Preserve paths on upload.

Included paths:
- netlify/functions/soccer-btts-predictions.js
- netlify/functions/nhl-sog-scanner-v3-optimized.mjs
- src/pages/SoccerBTTS.jsx
- src/NHL.jsx
- src/App.jsx (routes)

After upload:
1) Ensure Netlify deploys from the branch and functions are enabled.
2) Verify /soccer-btts and /nhl-sog routes load.
3) Optional env keys for better data:
   - FOOTBALL_DATA_API_KEY (Soccer fixtures, optional)
   - ODDS_API_KEY or THE_ODDS_API_KEY (if used in NHL function)
