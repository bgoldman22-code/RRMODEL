
# Predictions MVP Patch

This patch adds a new Netlify Function for **NFL Game Predictions**, a demo data file for Week 2, a front-end page, and a quick sanity script.

## What’s included
- `netlify/functions/nfl-predictions-get/index.cjs` – reads bundled JSON and returns predictions + auto-built 3/5-leg parlays.
- `netlify/functions/nfl-predictions-get/_data/2025/week2.json` – demo predictions data to prove the path works. Replace weekly.
- `public/predictions.html` – simple page that fetches and renders predictions.
- `sanity_tests/predictions-sanity.js` – console snippet to confirm the function is reading the bundled JSON.

## How to use
1. Drop the `netlify/` and `public/` folders into your repo (merge – don’t replace existing content).
2. Commit + deploy.
3. Visit `/predictions.html` on your site to see the table and parlay suggestions.
4. (Optional) Add a nav link to `/predictions.html` in your header.

## Updating weekly
- Add or overwrite `netlify/functions/nfl-predictions-get/_data/2025/weekX.json` with the same schema.
- No code changes required. Deploy and it will serve the new file.

## Sanity check
Open your site, press F12, Console, and paste:
```
fetch('/.netlify/functions/nfl-predictions-get?season=2025&week=2').then(r=>r.json()).then(j=>console.log(j));
```
Or run the full script in `sanity_tests/predictions-sanity.js`.
