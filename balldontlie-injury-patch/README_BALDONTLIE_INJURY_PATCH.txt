BallDontLie Injury Patch
=======================

Files included:
- netlify/functions/nfl-injuries-balldontlie.cjs
- netlify/functions/_lib/blobs-nfl.js (modified loadInjuries to prioritize BallDontLie)

Setup:
1. Add env var BALLDONTLIE_API_KEY in Netlify site settings.
2. Deploy.
3. Hit /.netlify/functions/nfl-injuries-balldontlie to verify.
4. Regenerate predictions.

Rollback: Remove the added block at top of loadInjuries and delete function file.
