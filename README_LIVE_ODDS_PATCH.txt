# Live Odds Frontend Patch

Files:
- src/lib/oddsClient.js
- src/lib/nameNormalize.js
- src/utils/ev.js

Integrate:
```js
import { fetchLiveHROdds } from '@/lib/oddsClient.js';
import { normName } from '@/lib/nameNormalize.js';
import { expectedValue1U } from '@/utils/ev.js';

const oddsMap = (await fetchLiveHROdds()) || {};

const rowsWithOdds = rows.map(row => {
  const key = normName(row.Player || row.player || row.name);
  const hit = oddsMap[key];
  const liveAmerican = hit?.median_american ?? null;
  const p = Number(row['Model HR%'] ?? row.modelHrPct ?? 0) / 100;
  const ev = liveAmerican != null ? expectedValue1U(p, liveAmerican) : (row.EV ?? null);
  return { ...row, American: liveAmerican ?? row.American ?? null, EV: ev, _oddsBooks: hit?.count_books ?? 0, _oddsByBook: hit?.by_book ?? null };
});
```
