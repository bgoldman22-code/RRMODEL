# OddsAPI "YES" Hotfix (without touching your layout)

This hotfix ensures the header shows **Using OddsAPI: yes** whenever the live odds snapshot is loaded.

## Files
- `src/oddsFlagHelper.js`

## How to use (2 small edits in `src/MLB.jsx`)
1) Import the helper near the top:
```js
import { setUsedOddsFlag } from "./oddsFlagHelper.js";
```

2) Right AFTER you build your `oddsMap` (Map or plain object) in `MLB.jsx`, set the flag:
```js
// oddsMap = await getOddsMap();  // your existing call
meta = setUsedOddsFlag(meta, oddsMap);
```

> If your code stores meta in React state, be sure to update it via setMeta (or however you're managing it). Example:
> ```js
> setMeta(prev => setUsedOddsFlag({ ...prev }, oddsMap));
> ```

## Quick sanity checklist
- Call the refresh function once today:
  `/.-netlify/functions/odds-refresh-rapid?quick=1`
- Confirm the snapshot exists:
  `/.-netlify/functions/odds-get`
- Hard refresh your page (Ctrl/Cmd+Shift+R).
- The header should now read **Using OddsAPI: yes**.
