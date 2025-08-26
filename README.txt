PATCH: Header label swap + odds markets endpoint

Includes:
- netlify/functions/odds-list-markets.mjs
    * Calls TheOddsAPI /v4/sports/baseball_mlb/odds-markets
    * Returns all markets & a 'present' subset for HRR/Hits/HomeRuns

- snippets/HeaderNav.links.example.js
- snippets/HeaderNav.inline.example.jsx

How to apply:
1) Copy the file in netlify/functions/ into your repo (merge/replace same path).
2) Update your header nav using one of the snippets (array or inline version).
   - Remove MLB SB, Soccer AGS, Parlays
   - Add HRR -> '/hrr'
3) Ensure you have a route for '/hrr' pointing to your HRR page component.
4) Commit & deploy a full build (not just Functions) so the header updates.

Sanity:
- /.netlify/functions/odds-list-markets  → ok:true, 'present' includes batter_hits_runs_rbis* when supported by your regions/books.
