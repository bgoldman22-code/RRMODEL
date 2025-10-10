# Line Movement Integration Plan
**Date:** October 10, 2025  
**Priority:** HIGH (Execution quality + CLV tracking)  
**Effort:** 3-4 hours

---

## 🎯 Goals

1. **Auto-filter picks** based on line movement signals (steam, volatility, key numbers)
2. **Auto-size units** based on CLV history and movement confidence
3. **Track CLV** (Closing Line Value) to prove long-term edge
4. **Add deep links** to sportsbooks for 1-click betting

---

## 📊 Data Requirements

### Odds Time-Series Storage
**Store:** Netlify Blobs `odds-timeseries`

**Schema per snapshot:**
```javascript
{
  game_id: "LAR@SEA-2025-10-13",
  timestamp: "2025-10-13T19:45:00Z",
  books: {
    "FanDuel": {
      moneyline: { home: -150, away: +130, home_implied: 0.600, away_implied: 0.435 },
      spread: { home_line: -3.0, home_price: -110, away_line: +3.0, away_price: -110 },
      total: { over_line: 47.5, over_price: -110, under_price: -110 }
    },
    "DraftKings": { /* ... */ },
    // ... other allowed books
  }
}
```

**Snapshot frequency:** Every 5 minutes during game windows (Thu 6PM-12AM, Sun 11AM-12AM, Mon 6PM-12AM ET)

### Movement Metrics (Computed)
```javascript
{
  game_id: "LAR@SEA-2025-10-13",
  market: "spread",
  side: "home",
  
  // Price history
  open_implied: 0.523,
  current_implied: 0.567,
  low_implied: 0.515,
  high_implied: 0.578,
  close_implied: null, // Filled at kickoff
  
  // Movement signals
  drift_bps: 44, // current - open (basis points of implied prob)
  velocity_30m: 1.47, // bps per minute over last 30min
  velocity_60m: 0.73,
  breadth: 6, // # books moving same direction in last 30min
  volatility_6h: 0.021, // std dev of implied % over 6h
  
  // Special events
  steam_detected: true,
  steam_timestamp: "2025-10-13T19:30:00Z",
  steam_direction: "home",
  key_number_crossed: [
    { number: 3.0, timestamp: "2025-10-13T18:15:00Z", direction: "down" }
  ],
  rlm_detected: false // Reverse Line Move (would need public betting % data)
}
```

### CLV Tracking (Per User Bet)
**Store:** Netlify Blobs `clv-tracking`

```javascript
{
  bet_id: "LAR@SEA-spread-20251013-1945",
  game_id: "LAR@SEA-2025-10-13",
  market: "spread",
  side: "home",
  pick: "LAR -3.0",
  
  // Entry
  entry_timestamp: "2025-10-13T19:45:00Z",
  entry_price: -110,
  entry_implied: 0.523,
  units_bet: 2.1,
  
  // Close
  closing_price: -115,
  closing_implied: 0.535,
  
  // CLV
  clv_bps: 12, // entry_implied - closing_implied (positive = beat close)
  clv_percent: 2.3, // (12 / 523) * 100
  
  // Context
  steam_at_entry: false,
  volatility_at_entry: 0.015,
  time_to_kickoff_min: 75
}
```

---

## 🚪 Pre-Bet Gates (Filter Picks)

These run BEFORE a pick appears on the slate:

### 1. Steam Filter
```javascript
function applySteamGate(game, market, modelSide) {
  const movement = getMovementMetrics(game.game_id, market);
  
  // Steam = broad (≥4 books), fast (≥25 bps in ≤30min)
  if (movement.breadth >= 4 && movement.velocity_30m >= 0.83) {
    if (movement.steam_direction === modelSide) {
      return { 
        allow: true, 
        boost: 0.10, // +10% sizing
        reason: "Steam confirmed our side" 
      };
    } else {
      // Steam against us - recheck news/injuries
      const hasNewInfo = await recheckInjuries(game);
      if (!hasNewInfo && game.edge < 0.035) {
        return { 
          allow: false, 
          reason: "Steam against us, no new info, edge <3.5%" 
        };
      }
    }
  }
  
  return { allow: true };
}
```

### 2. Volatility Throttle
```javascript
function applyVolatilityGate(game, market) {
  const movement = getMovementMetrics(game.game_id, market);
  const medianVol = getMedianVolatility(market); // Historical baseline
  
  if (movement.volatility_6h >= medianVol * 2.0) {
    if (game.edge < 0.025) {
      return { 
        allow: false, 
        reason: "High volatility (2x median), edge <2.5%" 
      };
    }
    return { 
      allow: true, 
      penalty: 0.35, // -35% sizing
      reason: "High volatility haircut" 
    };
  }
  
  return { allow: true };
}
```

### 3. Key Number Protection (Spreads/Totals)
```javascript
function applyKeyNumberGate(game, market, modelSide) {
  if (market !== 'spread' && market !== 'total') return { allow: true };
  
  const movement = getMovementMetrics(game.game_id, market);
  const keyNumbers = market === 'spread' ? [3, 7, 10, 14] : [37, 41, 44, 47, 51];
  
  const currentLine = movement.current_line;
  const isNearKey = keyNumbers.some(k => Math.abs(currentLine - k) <= 0.5);
  
  if (isNearKey) {
    const driftingTowardUs = (
      (modelSide === 'home' && movement.drift_bps > 0) ||
      (modelSide === 'away' && movement.drift_bps < 0)
    );
    
    if (driftingTowardUs) {
      return { 
        allow: true, 
        urgency: "high",
        reason: "Near key number, drifting toward us - BET NOW" 
      };
    } else {
      return { 
        allow: true, 
        defer: true,
        reason: "Near key number, wait for reversion" 
      };
    }
  }
  
  return { allow: true };
}
```

---

## 📏 Sizing Modifiers (Adjust Units)

Applied AFTER Kelly calculation:

```javascript
function applyLineMovementSizingModifiers(baseUnits, game, market, modelSide) {
  let multiplier = 1.0;
  const reasons = [];
  
  // 1. CLV History (4-8 week rolling)
  const clvStats = getRollingCLV(market, weeks = 6);
  if (clvStats.avg_clv_bps >= 5) {
    multiplier *= 1.10;
    reasons.push(`+10% CLV boost (${clvStats.avg_clv_bps}bps avg)`);
  } else if (clvStats.avg_clv_bps <= -3) {
    multiplier *= 0.85;
    reasons.push(`-15% CLV penalty (${clvStats.avg_clv_bps}bps avg)`);
  }
  
  // 2. Steam Confirmation
  const movement = getMovementMetrics(game.game_id, market);
  if (movement.steam_detected && movement.steam_direction === modelSide) {
    multiplier *= 1.10;
    reasons.push("+10% Steam confirmed");
  }
  
  // 3. Sanity Haircut (model-market delta)
  const modelMarketDelta = Math.abs(game.model_spread - game.market_spread);
  if (modelMarketDelta > 8.0) {
    multiplier *= 0.65;
    reasons.push(`-35% Large delta (${modelMarketDelta.toFixed(1)}pts)`);
  }
  
  // 4. Injury Uncertainty Haircut
  const Q = game.uncertainty?.qb_injuries || 0;
  const D = game.uncertainty?.depth_chart_unknown || 0;
  const uncertaintyFactor = Math.max(0.5, 1 - 0.08*Q - 0.12*D);
  multiplier *= uncertaintyFactor;
  if (uncertaintyFactor < 1.0) {
    reasons.push(`-${((1-uncertaintyFactor)*100).toFixed(0)}% Injury uncertainty`);
  }
  
  // 5. Volatility Haircut
  if (movement.volatility_6h >= getMedianVolatility(market) * 2.0) {
    multiplier *= 0.65;
    reasons.push("-35% High volatility");
  }
  
  const finalUnits = baseUnits * multiplier;
  
  return {
    units: quantizeUnits(finalUnits),
    multiplier,
    reasons,
    base_units: baseUnits
  };
}
```

---

## 🔗 Deep Linking (The Odds API)

### Enable in Odds Fetch
```javascript
// netlify/functions/nfl-odds-fetch/index.mjs
const oddsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?` +
  `apiKey=${ODDS_API_KEY}&` +
  `regions=us&` +
  `markets=h2h,spreads,totals&` +
  `oddsFormat=american&` +
  `includeLinks=true`; // ← ADD THIS
```

### Response Structure (with links)
```javascript
{
  "bookmakers": [
    {
      "key": "fanduel",
      "title": "FanDuel",
      "markets": [
        {
          "key": "h2h",
          "outcomes": [
            {
              "name": "Los Angeles Rams",
              "price": -150,
              "link": "https://sportsbook.fanduel.com/..."  // ← Deep link
            }
          ]
        }
      ]
    }
  ]
}
```

### Store Links in Odds Structure
```javascript
{
  display: {
    h2h: { home: -150, away: +130 },
    spread: { home_line: -3.0, home_price: -110 },
    total: { over_line: 47.5, over_price: -110 }
  },
  links: {
    "FanDuel": {
      moneyline_home: "https://sportsbook.fanduel.com/...",
      moneyline_away: "https://sportsbook.fanduel.com/...",
      spread_home: "https://sportsbook.fanduel.com/...",
      spread_away: "https://sportsbook.fanduel.com/...",
      total_over: "https://sportsbook.fanduel.com/...",
      total_under: "https://sportsbook.fanduel.com/..."
    },
    "DraftKings": { /* ... */ }
  }
}
```

### UI Integration
```jsx
// In PickBadge component
{bestBook && !hasGameStarted && (
  <a 
    href={getBetLink(game, market, pick, bestBook)}
    target="_blank"
    rel="noopener noreferrer"
    className="text-xs text-blue-600 hover:underline"
  >
    🎯 Bet {units}U @ {bestBook} →
  </a>
)}
```

---

## 📱 UI Display

### Game Card Badges
```jsx
<div className="flex gap-2 text-xs">
  {movement.steam_detected && (
    <span className="px-2 py-1 bg-red-100 text-red-800 rounded">
      🔥 Steam +{movement.drift_bps}bps / {movement.velocity_30m.toFixed(1)}bps/min ({movement.breadth} books)
    </span>
  )}
  
  {movement.volatility_6h > medianVol * 2 && (
    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
      ⚠️ High Vol {(movement.volatility_6h / medianVol).toFixed(1)}×
    </span>
  )}
  
  {movement.key_number_crossed.length > 0 && (
    <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded">
      K# {movement.key_number_crossed[0].number}→{currentLine} @ {fmtTime(movement.key_number_crossed[0].timestamp)}
    </span>
  )}
</div>
```

### Sparkline Chart
```jsx
import { Line } from 'react-chartjs-2';

<Line
  data={{
    labels: movement.timestamps,
    datasets: [{
      data: movement.implied_probabilities,
      borderColor: '#3b82f6',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.4
    }]
  }}
  options={{
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { 
      x: { display: false },
      y: { display: false }
    }
  }}
  height={30}
  width={100}
/>
```

### Portfolio CLV Widget (Top of Page)
```jsx
<div className="bg-gradient-to-r from-blue-50 to-green-50 p-4 rounded-lg">
  <h3 className="text-sm font-semibold mb-2">Edge Validation (6 Weeks)</h3>
  <div className="grid grid-cols-3 gap-4 text-sm">
    <div>
      <div className="text-gray-600">Avg CLV</div>
      <div className="text-2xl font-bold text-green-600">+0.7%</div>
    </div>
    <div>
      <div className="text-gray-600">Positive CLV Rate</div>
      <div className="text-2xl font-bold">58%</div>
    </div>
    <div>
      <div className="text-gray-600">Avg Post-Bet Move</div>
      <div className="text-2xl font-bold text-blue-600">+12 bps</div>
    </div>
  </div>
</div>
```

---

## 🏗️ Implementation Phases

### Phase 1: Data Collection (1-2 hours)
- [ ] Create `nfl-odds-snapshot.mjs` scheduled function (runs every 5min)
- [ ] Store snapshots in `odds-timeseries` Blob store
- [ ] Compute movement metrics (drift, velocity, breadth, volatility)
- [ ] Add `includeLinks=true` to Odds API calls

### Phase 2: Gates & Modifiers (1-2 hours)
- [ ] Implement `applyLineMovementGates()` function
- [ ] Implement `applyLineMovementSizingModifiers()` function
- [ ] Integrate into prediction generator (before Kelly sizing)
- [ ] Feature flags: `LINE_MOVEMENT_GATING`, `LINE_MOVEMENT_SIZING`

### Phase 3: CLV Tracking (1 hour)
- [ ] Create CLV tracking store
- [ ] Log user bets (or model recommendations) with entry prices
- [ ] Compute CLV at game close
- [ ] Create rolling CLV stats endpoint

### Phase 4: UI Integration (1 hour)
- [ ] Add movement badges to game cards
- [ ] Add sparkline charts (react-chartjs-2)
- [ ] Add deep link buttons
- [ ] Add portfolio CLV widget

---

## 🎯 Expected Impact

**Execution Quality:**
- Avoid chasing steam against us
- Capture better entry prices near key numbers
- Reduce stakes during high volatility

**Edge Validation:**
- Prove +EV with >55% positive CLV rate
- Identify markets where model is strongest (ML likely best)
- Detect model drift (if CLV drops, recalibrate)

**User Trust:**
- Transparent sizing (users see why units adjusted)
- Measurable performance (CLV > results for judging model)
- Professional presentation (looks like a sharp operation)

---

## 📊 Success Metrics

After 4-6 weeks:
- [ ] **CLV > +0.5%** average across all bets
- [ ] **>55% positive CLV rate** (more bets beat close than not)
- [ ] **Steam confirmation** detects 3-5 games/week, boosts sizing correctly
- [ ] **Volatility filter** prevents 2-4 bad bets/week
- [ ] **Deep links** increase bet execution rate by 30%+

---

## 🚀 Next Steps

1. Start Phase 1 (data collection) - Run for 1 week to build baseline
2. Implement gates/modifiers (Phase 2) - Test on Week 7-8 games
3. Add CLV tracking (Phase 3) - Validate edge over Weeks 8-12
4. Polish UI (Phase 4) - Make it look elite

**Total Effort:** 4-6 hours of focused development  
**Timeline:** Can be done in 2 sessions (Phase 1+2 today, Phase 3+4 tomorrow)
