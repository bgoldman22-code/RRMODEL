Implements (flagless by default, but tunable via env):
- Odds weight suppression in ranking (RANK_ODDS_WEIGHT, default 0.3; use VITE_RANK_ODDS_WEIGHT or RANK_ODDS_WEIGHT)
- Career BvP modifier (>=10 AB) capped at ±6%
- Lineup/context protection capped at +5%
- WHY column unchanged; EV unchanged; learning logs untouched

New per-row fields: rankScore, bvp_mod, protection_mod
Safe fallbacks: if BvP or lineup unavailable -> modifiers = 0

Revert: replace src/MLB.jsx with your previous version.
