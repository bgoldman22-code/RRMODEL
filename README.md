# PATCH: Moderate-power exploitable micro-boost (+3%)

This patch adds a tiny, **safe** multiplier that only applies when:
- Model HR probability is in the **0.20–0.30** band, and
- The pitcher is effectively **one‑pitch** (>= 45% usage of a single pitch), and
- The hitter **crushes that pitch** (xwOBA-like >= 0.50).

It also appends `mod-power exploitable +3%` to the Why column.

## Files in this patch
- `src/mpex-helper.js` — the helper function (ESM export).
- `src/MLB.jsx.additions.txt` — **exact lines to paste** in your `src/MLB.jsx`:
  1) an import near the top
  2) a 6‑line call block placed **after park/hot-cold** multipliers (when you have `pModel`) and **before** EV is computed.

We are not auto-editing your `MLB.jsx` to avoid breaking your good repo. Just paste the two snippets where indicated.

## 1) Import (near the top of `src/MLB.jsx`)
```js
import { moderatePowerExploitableMultiplier } from "./mpex-helper.js";
```

## 2) Call (after park/hot-cold multipliers, before EV)
You should already have `candidate`, `pModel` (0..1), and `why` (array of strings). Insert:
```js
// === PATCH: Moderate-power exploitable micro-boost ===
const mpex = moderatePowerExploitableMultiplier(candidate, pModel);
if (mpex > 1) {
  pModel = Math.min(pModel * mpex, 0.60); // safety cap
  if (Array.isArray(why)) {
    why.push('mod-power exploitable +3%');
  } else if (candidate) {
    candidate._whyTags = candidate._whyTags || [];
    candidate._whyTags.push('mod-power exploitable +3%');
  }
}
// === END PATCH ===
```

### Notes
- Pure JS (`&&`), defensive against missing fields.
- No changes to EV math or table wiring beyond a small, capped multiplier.
- Reversible: delete the import + block to revert.
