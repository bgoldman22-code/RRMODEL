# Safe Diversification Patch (non-breaking)

This patch **does not change your existing page layout** or buttons.
It adds two tiny components you can wire in with 3 lines, and nothing else.

## Files included
- `src/components/BetStructureNote.jsx` — text-only banner with the recommended 12/15-leg structure.
- `src/components/GameDiversification.jsx` — an extra table that fills out to at least N unique games.

## How to wire (3 copy-paste lines)

1) Open your `src/MLB.jsx` (or the page that renders Top 12/Bonus).
2) Add these imports near the top:
```js
import BetStructureNote from './components/BetStructureNote.jsx';
import GameDiversification from './components/GameDiversification.jsx';
```

3) In the JSX where your **Generate** button and tables already exist, add:
   - **Banner** (place right under the main page title):
```jsx
<BetStructureNote />
```

   - **Diversification table** (place UNDER your existing tables):
```jsx
<GameDiversification selected={picks} candidates={allCandidates} targetGames={8} />
```
Replace `picks` with whatever array holds your Top 12. Replace `allCandidates` with your full ranked list before slicing.
If you don’t have a single array for all candidates, pass the one you sort by EV.

## Notes
- If `selected` or `candidates` are missing/empty, the component silently renders nothing.
- This patch does **not** touch your WHY column, button handlers, or state shape.
- You can change `targetGames={8}` to `9` anytime.
