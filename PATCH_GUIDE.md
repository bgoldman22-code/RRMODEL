# Depth Chart Patch (Week 2, 2025) — Bundle Fallbacks

This patch contains updated JSONs in **all** fallback locations your function might read when Blobs are off.
Drop these files into your repo, commit, and deploy:

- `netlify/functions/nfl-depthcharts-get/_data/nfl/current.json`
- `netlify/functions/nfl-depthcharts-get/_data/nfl/depth-charts.json`
- `netlify/functions/nfl-depthcharts-get/_data/nfl/2025/week2/depth-charts.json`
- `netlify/functions/nfl-depthcharts-get/_data/nfl/2025/week1/depth-charts.json`

## Important
Make sure Netlify bundles `_data/**` with your function. Either:

### Option A — netlify.toml
Add this to `netlify.toml` (merge if file already exists):
```
[functions]
  included_files = [
    "netlify/functions/nfl-depthcharts-get/_data/**"
  ]
```

### Option B — In your function module (ESM only)
At the top of `netlify/functions/nfl-depthcharts-get/index.js`:
```js
export const config = {
  includedFiles: ["netlify/functions/nfl-depthcharts-get/_data/**"]
};
```

Then redeploy.

## Sanity test
Open any page, press F12 → Console, paste the contents of:
`sanity/console-check-week2.js`