# FanDuel HR Odds (Backend-only) – Patch (v3)

This patch adds a helper to pull **FanDuel "to hit a home run"** odds via The Odds API (server-side), and an optional status endpoint.

## Files
- `netlify/functions/_lib/fanduel-hr.mjs` – fetcher (no UI changes)
- `netlify/functions/_lib/blobs-helper.mjs` – shared Blobs helper (token fallback supported)
- `netlify/functions/odds-status.mjs` – OPTIONAL: reads a dump you write to Blobs and reports matched counts

## 1) Env var
Add in Netlify → Site settings → Environment variables:
- `ODDS_API_KEY` = your The Odds API key
(Alternatively, if you only have a client key, the helper will also look at `VITE_ODDS_API_KEY`, but **keep server keys server-side**.)

## 2) Wire into your slate function (no UI change)
Somewhere after you construct `games` (with `gameId` and `eventId` from your schedule feed) and before you finalize `candidates`:

```js
import { fetchFanDuelHrOdds, normName } from './_lib/fanduel-hr.mjs';

// Build the map of gameId -> eventId (from your schedule)
const eventMap = new Map();
for (const g of games) {
  if (g.gameId && g.eventId) eventMap.set(g.gameId, g.eventId);
}

// Pull FanDuel odds (won't throw on failure)
const fd = await fetchFanDuelHrOdds(eventMap);

// Map onto candidates (override american/implied/EV when we have a match)
function toProb(american){
  if (american > 0) return 100 / (american + 100);
  return (-american) / ((-american) + 100);
}

for (const c of candidates) {
  const byPlayer = fd.get(c.gameId);
  if (byPlayer) {
    const hit = byPlayer.get(normName(c.name));
    if (hit) {
      c.american = hit;
      c.implied = toProb(hit);
      const p = Number(c.modelProb ?? c.baseProb ?? c.prob ?? 0);
      c.ev = Number((p - c.implied).toFixed(3)); // keep your existing EV calc if different
      c.oddsSource = 'fanduel';
    }
  }
}
```

> Name-matching: If you have book participant IDs, prefer those. If not, `normName()` usually works; you can add an alias map for edge cases.

## 3) (Optional) Odds status
If you want `/odds-status` to report how many players were matched, have your slate function write a small dump after mapping:

```js
import { makeStore } from "./_lib/blobs-helper.mjs";

const store = makeStore('rrmodel');
const dateEt = /* YYYY-MM-DD for the slate */;
const total = candidates.length;
const matched = candidates.filter(x => x.oddsSource === 'fanduel').length;

// include a tiny sample for inspection (no PII)
await store.set(`mlb/odds/fanduel/${dateEt}.json`, JSON.stringify({
  ok: true, dateEt, total, matched,
  sample: candidates.slice(0, 20).map(x => ({
    name: x.name, gameId: x.gameId, american: x.american, oddsSource: x.oddsSource || 'est'
  }))
}), { contentType: 'application/json' });
```

Then hit:
```
/.netlify/functions/odds-status?date=YYYY-MM-DD
```
If no `date` is provided, it uses today (UTC).

## Notes
- This patch is **backend-only**. No React/UI changes.
- All network errors are swallowed; your site continues to work with estimated odds when FanDuel isn’t available yet.
- Requires Node 18+ (Netlify default is fine).
