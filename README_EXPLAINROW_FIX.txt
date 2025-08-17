ExplainRow Fix Pack
===================

This fixes the "explainRow is not defined" error and makes your WHY column render again.

What's included
---------------
1) **src/utils/why.js**  
   - Exports `explainRow(...)` that accepts EITHER an **object** or **legacy positional** args.
   - Builds a compact WHY string like:  
     `model 31.4% • hot/cold +1% • vs Max Fried • park HR −5% • odds +219`

2) **scripts/ensure-explain-import.mjs**  
   - Prebuild step that ensures `import { explainRow } from "./utils/why.js"` is added to `src/MLB.jsx`.

3) **scripts/fix-explain-call.mjs**  
   - Prebuild step that converts invalid pseudo-named calls (e.g., `explainRow(baseProb: x, hotBoost: y)`) into the correct object call `explainRow({ baseProb: x, hotBoost: y })`.

How to apply
------------
1) Drop these files into your repo (preserve folders):
   - `src/utils/why.js`
   - `scripts/ensure-explain-import.mjs`
   - `scripts/fix-explain-call.mjs`

2) Update your `package.json` scripts to run the fixers before build:
   ```json
   {
     "scripts": {
       "prebuild": "node ./scripts/ensure-explain-import.mjs && node ./scripts/fix-explain-call.mjs",
       "build": "vite build"
     }
   }
   ```
   (If you already have a `prebuild`, just append the two node commands with `&&`.)

3) Commit and redeploy on Netlify.

Notes
-----
- `why.js` uses the `.js` extension on purpose to keep ESM happy in your Vite setup.
- The helper accepts legacy **positional** args too, so older code paths remain compatible:
  `explainRow(baseProb, hotBoost, calScale, pitcherName, parkHR, weatherHR, oddsAmerican)`
- If your table already passes an object, no changes are necessary—the import + helper are enough.
