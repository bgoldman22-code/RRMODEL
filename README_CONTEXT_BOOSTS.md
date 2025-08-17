# Context Boosts (Additive, Safe) — Drop-in Patch

This patch adds:
- **`netlify/functions/lib/contextBoosts.js`** — flag-gated module that computes a *relative* multiplier for HR probabilities using:
  1) Pitch-type HR vulnerability (+3–6%)
  2) Recent form via 7d barrels (+3–6%, or −2–3%)
  3) Batter vs pitcher familiarity (+4–5%)
  4) Rookie/call-up floor (+3–5%)
  5) Park factor refinement by pitch type (0–4%)
- **`netlify/functions/_examples/mlb-log-picks-with-ctx.js`** — example logger that writes `p_ctx` **alongside** your existing `p_base` without touching the WHY column.
- **`netlify/functions/mlb-preds-get.js`** — optional reader to fetch the raw predictions for a given date: `/.netlify/functions/mlb-preds-get?date=YYYY-MM-DD`

## Safety
- The module is **read-only** and **additive**.
- Turn on/off with env `CTX_BOOSTS_ON=1` (off by default).
- If any input field is missing, that signal no-ops; no crashes.
- Total boost is capped (+15% up, −10% down). Final p is clamped to [0.1%, 70%].
- WHY column is **not** modified by this code.

## How to use (no local setup required)
1. **Upload these files** into your repo (keep paths).
2. **Shadow mode (recommended first):**
   - POST your usual picks payload to `/.netlify/functions/mlb-log-picks-with-ctx`
   - It will save to `mlb-logs/predictions-with-ctx/YYYY-MM-DD.json`
   - Compare `p_ctx` vs `p_base` before changing anything live.
3. **Live mode (later):**
   - In your current builder, import:
     ```js
     const { computeContextBoosts, applyBoosts } = require("./lib/contextBoosts");
     ```
   - After computing `p_base`, do:
     ```js
     const boosts = await computeContextBoosts(ctxForThisPick);
     const p_adj = applyBoosts(p_base, boosts);
     ```
   - Use `p_adj` internally. **Do not** change WHY text.
   - Toggle with env `CTX_BOOSTS_ON`.
4. **Retrieve a past slate:**
   - `/.netlify/functions/mlb-preds-get?date=YYYY-MM-DD`

## Rollback
- Remove `CTX_BOOSTS_ON` or delete the example function.
- Your existing live functions remain untouched by this patch.
