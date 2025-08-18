# Auto-updating Top 50 HR Leaders

This bundle adds an always-updating **Top 50 Home Run Leaders** table using the public MLB StatsAPI.

## Included
- `netlify/functions/hr-leaders.js` — Netlify Function (CommonJS) that fetches Top 50 HR leaders from MLB StatsAPI and caches in Netlify Blobs for 30 minutes.
- `src/components/TopHRLeaders.jsx` — React table that hits the function and renders the leaders. It also returns the names via `onLoaded` so you can feed them to MissingOddsTable.

## How to install
1) Copy both files into your repo in the same paths.
2) Ensure your **Environment variable** `BLOBS_STORE` is set (you already use it; e.g., `rrmodelblobs`).
3) Deploy.

## How to render (in MLB.jsx)
```jsx
import TopHRLeaders from "./components/TopHRLeaders.jsx";
import MissingOddsTable from "./components/MissingOddsTable.jsx"; // if you added it

function MLBPage() {
  const [top50Names, setTop50Names] = useState([]);

  return (
    <>
      {/* ... your existing Top + Bonus tables ... */}

      {/* Auto Top 50 HR Leaders */}
      <TopHRLeaders onLoaded={setTop50Names} />

      {/* Optional: Missing odds among the Top 50 */}
      <MissingOddsTable
        candidates={allCandidates}
        oddsMap={oddsMap}
        normName={normName}
        leaderboard={top50Names}     // <- just pass the names here
        maxRows={10}
      />
    </>
  );
}
```

## Endpoint details
- MLB StatsAPI (unofficial public): `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=homeRuns&season=YYYY&sportId=1&limit=50`
- We cache the payload for 30 minutes. You can change `TTL_MS` in the function if you want it fresher.
