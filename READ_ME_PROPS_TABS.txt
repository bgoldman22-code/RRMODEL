
SAFE ADDITIVE PROPS TABS (TB & HRRBI)

New serverless functions (no node-fetch required):
- /.netlify/functions/props-refresh       -> pulls TheOddsAPI props (TB & HRRBI) into Blobs
- /.netlify/functions/props-get           -> tiny getter
- /.netlify/functions/props-get-raw       -> raw map for pages
- /.netlify/functions/props-diagnostics   -> sanity check
- /.netlify/functions/props-stats         -> MLB season + last-15 game logs for players with odds
- /.netlify/functions/props-prob          -> computes P(Over 1.5) and EV from odds + features

Public pages (link these in your header safely as new tabs):
- /tools/tb.html
- /tools/hrrbi.html

ENV you need (Site Settings -> Environment variables):
- THEODDS_API_KEY = <your key>
- THEODDS_API_BASE = https://api.the-odds-api.com/v4  (optional)
- ODDS_REGIONS = us,us2
- BLOBS_STORE = rrmodelblobs
- (if using manual blobs) NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN

Add header tabs WITHOUT touching React (safe):
- In your existing header component, add two links:
  <a href="/tools/tb.html">Total Bases</a>
  <a href="/tools/hrrbi.html">Hits+Runs+RBIs</a>

Display & staking:
- Sort by EV. Suggested units: EV>=+0.10 → 1u, +0.05–0.10 → 0.5u, +0.02–0.05 → 0.25u.
- Optional 2-leg parlays only when both picks have EV>=+0.08 and are in different games.

Learning:
- props-prob uses season baseline + 15-game form + park.
- You can later add opponent pitcher adjustment by wiring probable pitchers to props-stats.
