# NBA Player Props - UI Architecture Plan

## Recommended Structure: **Unified Page with Tabs** ✅

### Why One Page?
1. **User Experience**: All props in one place (like your NFL Receiving Props page)
2. **Data Efficiency**: One API call fetches all player projections
3. **Cross-prop Analysis**: Users can compare PTS vs REB props for same player
4. **Consistent Design**: Matches your existing NFL/NHL prop pages
5. **Easy Navigation**: No jumping between pages

### Page Structure

```
NBA Player Props
├── Tab 1: Points Props (Default)
├── Tab 2: Rebounds Props  
├── Tab 3: Assists Props
├── Tab 4: 3PM Props (Future)
├── Tab 5: Multi-Prop (PTS+REB, DD/TD) (Future)
└── Tab 6: Best Edges (Cross-prop rankings)
```

---

## Page Layout Design

### Header Section
```
┌─────────────────────────────────────────────────────────────┐
│  NBA Player Props 🏀                          [Refresh]     │
│  Model: XGBoost Ensemble | Season: 2025-26                  │
│  Last Updated: Oct 30, 2025 2:45 PM ET                      │
│                                                               │
│  Today's Slate: 4 games | 97 props analyzed                 │
│  High-Edge Opportunities: 12 bets (4+ point edge)           │
└─────────────────────────────────────────────────────────────┘
```

### Tab Navigation
```
┌─────────────────────────────────────────────────────────────┐
│ [Points 🔥]  [Rebounds]  [Assists]  [Best Edges] [All Props] │
└─────────────────────────────────────────────────────────────┘
```

### Props Display (Tab Content)

**Option A: Compact Card View** (Recommended for mobile)
```
┌─────────────────────────────────────────────────────┐
│ Jayson Tatum (BOS vs CLE)                          │
│ ─────────────────────────────────────────────────── │
│ Model: 28.3 pts | Vegas: 25.5 | Edge: +2.8         │
│                                                      │
│ 🔥 PICK: OVER 25.5 (-110)                           │
│ Confidence: 68% | Kelly: 2.1% ($42)                 │
│                                                      │
│ L10 PPG: 27.8 | L5 PPG: 29.4 | Minutes: 36.2       │
│ Team Total: 118.5 (pace: 102.3)                    │
│ Matchup: CLE 23rd vs SF (111.2 DefRtg)             │
└─────────────────────────────────────────────────────┘
```

**Option B: Table View** (Desktop, more data dense)
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Player          │ Team │ Opp │ Model │ Vegas │ Edge │ Pick     │ Conf │ Kelly   │
├─────────────────────────────────────────────────────────────────────────────────┤
│ J. Tatum        │ BOS  │ CLE │ 28.3  │ 25.5  │ +2.8 │ OVER ✅  │ 68%  │ 2.1%    │
│ L. Doncic       │ DAL  │ MIN │ 31.5  │ 29.5  │ +2.0 │ OVER     │ 61%  │ 1.3%    │
│ G. Antetokounmpo│ MIL  │ GSW │ 26.8  │ 28.5  │ -1.7 │ UNDER    │ 55%  │ 0.8%    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Filters & Sorting
```
┌─────────────────────────────────────────────────────────────┐
│ Filters:                                                     │
│ [ Edge > 3.0 pts ▼ ]  [ All Teams ▼ ]  [ Starters Only ☑ ] │
│                                                               │
│ Sort By: [ Edge (High to Low) ▼ ]                           │
│ Show: [ High Confidence Only ]  [ All Props ]               │
└─────────────────────────────────────────────────────────────┘
```

---

## App.jsx Integration

### Update NBA Menu Structure
```javascript
nba: {
  label: 'NBA',
  items: [
    { label: 'Elite Predictions V2 🔥', path: '/nba-predictions-v2' },
    { label: 'Player Props 🎯', path: '/nba-player-props' },  // NEW
    { label: 'Market Scanner V2', path: '/nba-predictions-v2?tab=inefficiencies' },
    { label: 'Kelly Portfolio V2', path: '/nba-predictions-v2?tab=kelly' }
  ]
}
```

### Route Addition
```javascript
<Route path="/nba-player-props" element={<NBAPlayerProps />} />
```

---

## Component Structure

### Main Component
```
src/pages/NBAPlayerProps.jsx
├── Imports (React, hooks, styling)
├── API fetch hook
├── State management (active tab, filters, sort)
├── Tab navigation component
├── Filter/sort controls
├── Props list (conditional rendering by tab)
└── Individual prop card/row component
```

### API Endpoint
```
netlify/functions/nba-player-props/index.mjs
├── Fetch today's games from ESPN
├── Load player rolling stats (L5/L10)
├── Load trained XGBoost model
├── Calculate projections for all players
├── Fetch Vegas lines from Odds API
├── Calculate edges & Kelly sizes
└── Return sorted props by edge
```

---

## Feature Roadmap

### Phase 1: MVP (Week 1-2)
- ✅ Points props only
- ✅ Single tab interface
- ✅ Card view for mobile
- ✅ Edge calculation & Kelly sizing
- ✅ Filter by edge threshold

### Phase 2: Expansion (Week 3)
- ✅ Rebounds tab
- ✅ Assists tab
- ✅ Table view toggle (desktop)
- ✅ Team/opponent filters
- ✅ Sort by multiple columns

### Phase 3: Advanced (Week 4+)
- ✅ "Best Edges" tab (cross-prop ranking)
- ✅ Player detail modal (click for deep stats)
- ✅ 3PM props tab
- ✅ Multi-prop combos (PTS+REB, DD/TD)
- ✅ Historical accuracy tracker per player

### Phase 4: Elite Features (Future)
- ✅ Live injury news integration
- ✅ Lineup change alerts
- ✅ Correlation warnings (same team props)
- ✅ Bankroll tracker & bet logger
- ✅ Export picks to CSV/PDF

---

## Mobile Optimization

### Responsive Breakpoints
```css
/* Mobile: Compact cards, 1 column */
@media (max-width: 768px) {
  .props-container { grid-template-columns: 1fr; }
  .prop-card { padding: 16px; font-size: 14px; }
}

/* Tablet: 2 columns */
@media (min-width: 769px) and (max-width: 1024px) {
  .props-container { grid-template-columns: repeat(2, 1fr); }
}

/* Desktop: Table view or 3 columns */
@media (min-width: 1025px) {
  .props-container { grid-template-columns: repeat(3, 1fr); }
  .table-view { display: table; }
}
```

---

## Color Coding System

### Edge Indicators
```
🔥 Edge > 4.0 pts    → Red/Hot (STRONG BET)
⚡ Edge 3.0-4.0 pts  → Orange (BET)
💡 Edge 2.0-3.0 pts  → Yellow (CONSIDER)
📊 Edge 1.0-2.0 pts  → Gray (WATCH)
❌ Edge < 1.0 pts    → Hidden (LOW VALUE)
```

### Confidence Badges
```
🟢 Confidence > 65% → Green
🟡 Confidence 55-65% → Yellow
🟠 Confidence 50-55% → Orange
⚪ Confidence < 50% → Gray
```

---

## Sample Data Flow

### 1. User visits `/nba-player-props`
↓
### 2. Component fetches from `/nba-player-props` API
↓
### 3. API returns:
```json
{
  "ok": true,
  "generated": "2025-10-30T19:45:00Z",
  "games": 4,
  "props": [
    {
      "propType": "points",
      "playerId": 1628369,
      "playerName": "Jayson Tatum",
      "team": "BOS",
      "opponent": "CLE",
      "position": "SF",
      "gameTime": "2025-10-30T23:00Z",
      
      "projection": 28.3,
      "vegasLine": 25.5,
      "vegasOverOdds": -110,
      "vegasUnderOdds": -110,
      "edge": 2.8,
      "pick": "OVER",
      "confidence": 68,
      "kelly": 2.1,
      
      "context": {
        "l5_avg": 29.4,
        "l10_avg": 27.8,
        "l10_minutes": 36.2,
        "team_projected_total": 118.5,
        "opponent_defRtg": 111.2,
        "matchup_rank": 23
      }
    }
  ]
}
```
↓
### 4. UI renders props grouped by tab, sorted by edge

---

## Implementation Priority

### Must-Have (Launch Blockers):
1. ✅ Points props tab working
2. ✅ Edge calculation accurate
3. ✅ Mobile responsive
4. ✅ Loading states & error handling
5. ✅ Filter by edge threshold

### Nice-to-Have (Post-Launch):
1. ⏳ Rebounds/Assists tabs
2. ⏳ Table view toggle
3. ⏳ Historical accuracy display
4. ⏳ Player detail modal

### Future Enhancements:
1. 🔮 Live odds updates (websocket)
2. 🔮 Bet tracking & portfolio
3. 🔮 Correlation matrix
4. 🔮 Discord/Telegram alerts

---

## Recommended Approach

**Start Simple, Iterate Fast:**

1. **Week 1**: Build Points props only, card view, basic filtering
2. **Week 2**: Add Rebounds/Assists after validating Points model
3. **Week 3**: Add table view, advanced filters, "Best Edges" tab
4. **Week 4+**: Multi-props, exotic bets, historical tracking

This mirrors your existing NFL/NHL pages but with sport-specific optimizations.

**Ready to build the MVP Points Props page?** 🚀
