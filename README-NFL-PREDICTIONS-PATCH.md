# NFL Predictions Patch

This patch adds a new page **NFL Predictions** that renders the output of your Netlify function:
`/.netlify/functions/nfl-predictions-get`.

## Files included
- `src/pages/NFLPredictions.jsx` — the actual page component (fetches and renders predictions & a parlay card).
- `src/App.example.patch.jsx` — a **minimal** example of how to add the route and nav item for **NFL Predictions** without touching any other pages.

## How to apply

1) **Add the page**
   - Copy `src/pages/NFLPredictions.jsx` into your repo at the same path.

2) **Wire the route + nav (safest)**
   - Open your existing `src/App.jsx` and:
     - Add: `import NFLPredictions from "./pages/NFLPredictions";`
     - Replace the old "NFL NeggCorr" nav item with a link to `/nfl/predictions`.
     - Add a route:
       ```jsx
       <Route path="/nfl/predictions" element={<NFLPredictions />} />
       ```
   - Use `src/App.example.patch.jsx` as a reference only. Do **not** overwrite your whole App.jsx if you have other working routes.

3) **Deploy**
   - Commit these changes and deploy. No environment vars are required for the UI.
   - The page reads predictions from your function. If the table shows "No predictions available," verify the function is returning data locally:
     ```js
     fetch("/.netlify/functions/nfl-predictions-get").then(r=>r.json()).then(console.log)
     ```

## Sanity checks (paste in browser console on the NFL Predictions page)
```js
(async () => {
  const r = await fetch("/.netlify/functions/nfl-predictions-get").then(r=>r.json());
  console.table((r.rows||[]).slice(0,5).map(x => ({ id:x.id, kickoff:x.kickoff, pick:x?.pick?.type, team:x?.pick?.team, conf:(x?.pick?.confidence||0).toFixed(3) })));
})();
```

— Generated 2025-09-11T18:10:34.932672Z
