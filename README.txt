# NFL Odds Debug Patch (2025-08-21)

Files:
- netlify/functions/nfl-odds.cjs  → Adds verbose logging and returns `offers[]` (not `props[]`). Use `?debug=1`.
- src/nfl/oddsClient.js           → Consumes `offers[]`, tolerates legacy `props[]`.

How to test:
1) Deploy, then hit:
   /.netlify/functions/nfl-odds?book=draftkings&market=player_anytime_td&debug=1
2) Check Netlify → Functions → nfl-odds → Logs for lines beginning with [nfl-odds].
3) You should see either a raw sample and offers populated, or a clear http error.
