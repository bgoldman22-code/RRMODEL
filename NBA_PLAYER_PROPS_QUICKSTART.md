# NBA Player Props - Quick Start Guide

## Recommendation: **One Unified Page with Tabs** ✅

### Why This Approach?
- ✅ Matches your existing NFL Receiving Props style
- ✅ All props in one place (better UX)
- ✅ One API call = faster load times
- ✅ Easy to add new prop types as tabs
- ✅ Mobile-friendly design

## Menu Structure Update

### Add to App.jsx:
```javascript
nba: {
  label: 'NBA',
  items: [
    { label: 'Elite Predictions V2 🔥', path: '/nba-predictions-v2' },
    { label: 'Player Props 🎯', path: '/nba-player-props' },  // ← NEW
    { label: 'Market Scanner V2', path: '/nba-predictions-v2?tab=inefficiencies' },
    { label: 'Kelly Portfolio V2', path: '/nba-predictions-v2?tab=kelly' }
  ]
}
```

## Page Layout Preview

```
┌─────────────────────────────────────────────────────────────┐
│  NBA Player Props 🏀                          [Refresh]     │
│  Today's Slate: 4 games | 12 High-Edge Props               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ [Points 🔥]  [Rebounds]  [Assists]  [Best Edges]           │
└─────────────────────────────────────────────────────────────┘

Filters: [ Edge > 3.0 pts ▼ ]  [ All Teams ▼ ]  [ Starters ☑ ]

┌─────────────────────────────────────────────────────┐
│ Jayson Tatum (BOS vs CLE)                    🔥     │
│ ─────────────────────────────────────────────────── │
│ Model: 28.3 pts | Vegas: 25.5 | Edge: +2.8         │
│                                                      │
│ 🎯 PICK: OVER 25.5 (-110)                           │
│ Confidence: 68% | Kelly: 2.1% ($42)                 │
│                                                      │
│ L10 PPG: 27.8 | Minutes: 36.2 | Usage: 31.5%       │
│ Matchup: CLE 23rd vs SF (weak defense)             │
└─────────────────────────────────────────────────────┘
```

## Development Phases

### Phase 1: MVP (Points Only) - Week 1
- Single page: `/nba-player-props`
- One tab: Points props
- Card view (mobile-first)
- Basic filters (edge threshold, team, starter)
- Kelly sizing + confidence

### Phase 2: Multi-Props - Week 2
- Add tabs: Rebounds, Assists
- Tab state management
- Cross-prop filtering

### Phase 3: Advanced - Week 3+
- "Best Edges" tab (all props ranked)
- Table view toggle (desktop)
- Player detail modals
- Historical accuracy tracking

## File Structure

```
src/pages/NBAPlayerProps.jsx          ← Main component
netlify/functions/nba-player-props/
  ├── index.mjs                        ← API endpoint
  └── README.md                        ← API docs

data/nba/
  ├── player-boxscores-2024.json       ← Training data
  └── player-props-model.json          ← Trained model

scripts/nba/
  ├── collect-player-boxscores.js      ← Data collector (DONE ✅)
  ├── build-player-rolling-stats.js    ← Feature engineering (NEXT)
  └── train-player-props-model.js      ← Model training
```

## Next Steps

1. ✅ **Data collection** - Running now (10-15 min ETA)
2. ⏳ **Feature engineering** - Build L5/L10 rolling stats
3. ⏳ **Get Odds API key** - For historical prop lines
4. ⏳ **Train model** - XGBoost on points props
5. ⏳ **Build frontend** - React component with tabs
6. ⏳ **Deploy API** - Netlify function
7. ⏳ **Backtest** - Validate on 2024-25 season

**Timeline: 3-4 days to MVP** 🚀

## Questions to Answer:

1. **Odds API Key** - Do you have access to historical player props?
2. **Bankroll Size** - For Kelly sizing ($1,000? $10,000?)
3. **Prop Types** - Start with Points only, or build all 3 at once?
4. **Design Match** - Should I copy your NFL Receiving Props styling?

Let me know and I'll continue building! 🏀
