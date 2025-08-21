# MLB HR — DIRECT POST (Control vs Adjusted-v1)

This build requires **no internal baseline module**. You simply POST your baseline picks to the function.

## Files
- netlify/functions/mlb-hr-generate-exp.cjs
- netlify/functions/mlb-hr-exp-list.cjs
- src/utils/hrExp.cjs
- src/utils/sluggerSet.cjs
- tools/post-exp-example.json
- tools/post-exp-example.sh

## Deploy
1) Copy these files into your repo (preserve paths).
2) Ensure `@netlify/blobs` is in `dependencies` in `package.json`.
3) Deploy on Netlify.

## Use
- **Post baseline picks directly**:
  ```bash
  curl -X POST https://YOUR_SITE.netlify.app/.netlify/functions/mlb-hr-generate-exp     -H 'content-type: application/json'     --data @tools/post-exp-example.json
  ```

- **List recent experiments**:
  ```
  https://YOUR_SITE.netlify.app/.netlify/functions/mlb-hr-exp-list
  ```

## Behavior
- CONTROL: lineup validation only.
- ADJUSTED‑v1: slugger floor (+2.5%) + cluster bump (+1.8%), capped to +3% total, 0.60 max prob.
- Both tracks are logged to Blobs at:
  - mlb-hr/experiments/YYYY-MM-DD/control.json
  - mlb-hr/experiments/YYYY-MM-DD/adjusted-v1.json

## Morning scratches
Populate `known_out` with anybody obviously ruled out (e.g., "Shohei Ohtani") in your POST body. Re‑POST later to refresh blobs if new scratches appear.
