# Structure Patch: Top 12 → Next 3 → Game Diversification (with Odds Buckets)

This patch adds:
- **Next 3** table (best remaining picks after Top 12)
- **Game Diversification picks** table to reach ~8–9 unique games
- **Odds bucket toggle** (All / Short / Mid / Long) to choose which prices fill the diversification table
- Enforces **max 3–4 double-up games** in the Top 12 selection
- Prefers at least one pick from **high-HR parks** (Coors, Yankee Stadium, Great American, Citizens Bank)

## Config (optional)
- `VITE_TARGET_GAMES` / `TARGET_GAMES` (default **8**)
- `VITE_MAX_DOUBLES` / `MAX_DOUBLES` (default **4**)
- `VITE_HIGH_HR_PARKS` / `HIGH_HR_PARKS` (CSV, default `COL:Coors Field,NYY:Yankee Stadium,CIN:Great American,PHI:Citizens Bank`)

## How it works
1. Sort candidates by **EV** (your current behavior).
2. Build **Top 12** allowing two per game, but only across up to **MAX_DOUBLES** games.
3. Build **Next 3** favoring *new-game* picks first.
4. Build **Diversification** to reach **TARGET_GAMES** unique games; ensure at least one from a **high-HR park** if possible.
5. Diversification table respects the selected **odds bucket**:
   - Short: +150–+250
   - Mid: +251–+400
   - Long: +401+
   - All: no filter

## Install
Drop the files into your repo:
- `src/MLB.jsx` (replacement/additive)
- `src/components/OddsBucketToggle.jsx` (new)

No backend changes required.
