# Turned-ON Patch (Weather + BvP) — 2025-08-28

## What this does
Adds Weather and Batter-vs-Pitcher multipliers **on by default** via a safe *post* wrapper endpoint:
`/.netlify/functions/mlb-preds-get-post`

It calls your existing `mlb-preds-get`, applies small capped adjustments, and returns the same shape.

## Install
Copy folder contents into your repo at the same paths:
- `netlify/functions/_lib/*.mjs`
- `netlify/functions/mlb-preds-get-post.mjs`

## How to use (no backend edits needed)
Change the frontend fetch URL from:
```
/.netlify/functions/mlb-preds-get?date=YYYY-MM-DD
```
to:
```
/.netlify/functions/mlb-preds-get-post?date=YYYY-MM-DD
```

## Notes
- Effects are modest and clamped; if any helper fails, it no-ops and returns your original numbers.
- Later, if you prefer in-model integration, call `_lib/extensions-apply.mjs` inside your existing function and delete the wrapper.
