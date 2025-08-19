
Patch contents
==============
- src/components/MissingOddsTable.jsx   ← fixes your build by supplying the referenced component
- src/utils/opponentPitchers.js         ← helper used by MLB.jsx to guarantee "vs [opponent pitcher]" correctness

How to install
--------------
1) Drop these files into the same relative paths in your repo.
2) Commit and deploy.

Notes
-----
* MissingOddsTable.jsx is defensive and will render if any of these props are provided by MLB.jsx:
  items, data, missing, list, rows. It auto-detects fields like {name, reason, hint}.
* opponentPitchers.js just provides helpers. MLB.jsx should already import and use it
  if you followed the earlier patch. No backend changes required.
