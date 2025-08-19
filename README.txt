
PATCH: pitcher-side safety for Why column

Files included:
- src/utils/why.js

What it does:
- Prefers `opponentPitcher` if present.
- If only `pitcher` is provided and its `team` matches the batter's team,
  it's ignored to avoid "vs own pitcher" mistakes.
- Keeps the rest of the Why generation intact and backward-compatible.
- Accepts optional fields your app already passes (odds_best_american, implied_prob, true_hr_prob, ev, env, pitch_match).

How to deploy:
1) Drop `src/utils/why.js` over your existing file (same path).
2) Commit and deploy — no other code changes required.

Optional (front-end, if you want to be explicit):
- When constructing the input for buildWhy, pass `opponentPitcher` instead of `pitcher`.
