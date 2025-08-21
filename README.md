# nfl-preseason-usage-bundle

Adds a *starter-rep weighted* preseason adjuster so depth charts reflect **when** players played, not just how many snaps.

## Files
- `src/nfl/usageAdjuster.js` — computes weights from preseason snap events and blends into depth charts.
- `data/nfl-td/preseason-snaps.sample.json` — example schema for snaps input.

## How to use in your engine
```js
import { computeStarterRepWeights, applyPreseasonWeights } from './nfl/usageAdjuster.js';
import depthCharts from '../data/nfl-td/depth-charts.json';
import preseasonSnaps from '../data/nfl-td/preseason-snaps.json'; // add this file with your data

const weights = computeStarterRepWeights(preseasonSnaps);
const adjustedDepth = applyPreseasonWeights(depthCharts, weights, 0.6);
// then feed 'adjustedDepth' into your TD engine instead of the raw depthCharts
```

You can keep using the same engine; just replace its depth chart reference with the adjusted one.
