# Season-weighted Elo training patch

- Weights by season using `seasonWeight()`:
  - current = 1.00
  - last = 0.75
  - -2 = 0.60
  - -3 = 0.50
  - older: 0.50 * exp(-(diff-3)/2), floor 0.25
- Applies offseason regression toward mean (RETENTION = 0.80) before each new season.
- Effective K is K_BASE * seasonWeight for each game update.

Deploy then run:
curl -sS "https://YOURSITE/.netlify/functions/nfl-train?season=2025&rebuild=1"