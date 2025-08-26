# main5 add-ons (no layout/buttons changed)

This patch **does not** touch your existing Generate button or tables.
It adds two components you can place anywhere:

- `BetStructureNote.jsx` — a small banner that describes the recommended RR structure.
- `GameDiversification.jsx` — a table that fills to at least N unique games using your existing data.

## Wire-up in `src/MLB.jsx` (or your page component)

1) Import the components near the top:
```js
import BetStructureNote from './components/BetStructureNote.jsx';
import GameDiversification from './components/GameDiversification.jsx';
```

2) Place the **banner** right under your page title (above the Generate button):
```jsx
<BetStructureNote />
```

3) Leave your Generate button and existing **Top 12 + Bonus** tables as-is.

4) Place the **diversification table** UNDER your Bonus table:
```jsx
<GameDiversification selected={picks} candidates={allCandidates} targetGames={8} />
```
- Replace `picks` with your array used for **Top 12**.
- Replace `allCandidates` with your **full ranked list before slicing** (the same array you sort by EV).

> If you aren’t sure of your variable names:
> - `selected`: often named `picks` / `topPicks` / `finalPicks`.
> - `candidates`: often `rows` / `baseCandidates` / `rankedCandidates`.
> This component is read-only; if you pass nothing, it just renders nothing.

## Safety
- No state or handlers added.
- If props are missing, the component silently returns `null`.
- WHY column untouched.
