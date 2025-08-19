This patch adds robust opponent‑pitcher mapping and a tiny diagnostics table.

Add these files to your repo keeping the same paths:
- src/utils/opponentPitchers.js
- src/components/MissingOddsTable.jsx

Your `src/MLB.jsx` should import:
  import { resolveOpponentPitcher, makeProbablesMap } from "./utils/opponentPitchers.js";

No other changes required.