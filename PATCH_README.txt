PATCH: Auto Top‑50 HR Leaders + Missing Odds table

Files included:
1) netlify/functions/hr-leaders.mjs
   - ESM; uses global fetch; Netlify Blobs optional.
   - Endpoint after deploy: /.netlify/functions/hr-leaders
   - Optional query: ?season=2025
   - Caches for 30 min when Blobs available (BLOBS_STORE or NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN).

2) src/components/TopHRLeaders.jsx
   - Renders Top‑50 HR leaders table.
   - Calls hr-leaders function; emits names via onLoaded callback.

3) src/components/MissingOddsTable.jsx
   - Shows up to 10 players missing odds (either Top‑50 HR hitters or Top‑20 model, depending on props).

How to wire (in src/MLB.jsx):
--------------------------------
import React, { useState } from "react";
import TopHRLeaders from "./components/TopHRLeaders.jsx";
import MissingOddsTable from "./components/MissingOddsTable.jsx";

// inside your component:
const [top50Names, setTop50Names] = useState([]);

// ...after your Bonus Picks table JSX:
<TopHRLeaders onLoaded={setTop50Names} />

<MissingOddsTable
  candidates={allCandidates}   // your full pre-sliced model pool
  oddsMap={oddsMap}            // Map/object from TheOddsAPI snapshot (normalized keys)
  normName={normName}          // your existing name normalizer
  leaderboard={top50Names}     // focus diagnostics on Top‑50 HR hitters
  maxRows={10}
/>

Env notes (optional for caching):
- BLOBS_STORE (e.g., rrmodelblobs)
- NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN (only needed if auto Blobs context isn't injected)
