# NBA Injury Data Freshness - Technical Analysis

## Your Question
> "If someone is scratched at 6pm for a 7pm game, if I refresh the model at 6:30pm, do we have that info?"

## Short Answer
**YES** - You will have that info, but with one important caveat about the frontend.

## How It Works

### Data Flow

1. **User refreshes page at 6:30 PM**
   - Frontend calls: `/.netlify/functions/nba-predictions-elite-v2?_t=1699999999`
   - Cache-busting timestamp forces fresh request

2. **Netlify function executes (every time)**
   - No server-side caching
   - Runs fresh for every request

3. **Injury data fetched live**
   ```javascript
   // From: netlify/functions/_lib/nba/injuries.mjs
   const ESPN_INJURIES = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
   
   export async function fetchInjuries() {
     const response = await fetch(ESPN_INJURIES);  // ← LIVE FETCH
     // Returns current injury data
   }
   ```

4. **Called for each team**
   ```javascript
   // From: nba-predictions-elite-v2/index.mjs, line 975
   injuryCache[nbaAbbr] = await getTeamInjuries(nbaAbbr);
   ```

### ESPN Injury Data Update Speed

ESPN's injury API updates are typically:
- **Official injury reports**: Within 5-10 minutes of NBA official report
- **Late scratches**: Usually 15-30 minutes before game time
- **Emergency scratches**: Can be 5-60 minutes before tip-off

**Your 6:30 PM refresh for 7:00 PM game:**
- ✅ Will catch official scratches (posted by 6:00 PM)
- ⚠️ Might miss last-minute scratches (6:25-6:55 PM)
- ✅ Will definitely have it by 6:45 PM in most cases

## Current Implementation

### ✅ What Works Well

1. **No server caching** - Every request fetches fresh data
2. **Cache-busting in frontend** - `?_t=timestamp` prevents browser cache
3. **Live ESPN API** - Gets data as soon as ESPN updates
4. **Per-team fetching** - Each team's injuries fetched individually

### ⚠️ Potential Issue: Frontend Caching

**File**: `src/pages/NBAPredictionsV2.jsx`, line 17
```javascript
const response = await fetch(`/.netlify/functions/nba-predictions-elite-v2?_t=${timestamp}`);
```

**This is GOOD** - Cache-busting parameter prevents stale data.

**However**, the frontend only fetches on:
1. Initial page load (`useEffect` runs once)
2. Manual refresh (if you add a button)

**If user loads page at 6:00 PM and doesn't refresh**, they won't see 6:15 PM scratch.

## Recommendations

### Option 1: Add Manual Refresh Button (Quick Fix)

Add to `NBAPredictionsV2.jsx`:

```jsx
const NBAPredictionsV2 = () => {
  // ... existing state ...

  return (
    <div>
      <button 
        onClick={() => loadPredictions()}
        disabled={loading}
        style={{ padding: '10px 20px', marginBottom: '20px' }}
      >
        {loading ? '⏳ Refreshing...' : '🔄 Refresh Predictions'}
      </button>
      
      {/* ...rest of component... */}
    </div>
  );
};
```

**User experience**: Click refresh button at 6:30 PM → Get latest scratches

### Option 2: Auto-Refresh Timer (Better UX)

```jsx
const NBAPredictionsV2 = () => {
  // ... existing state ...

  useEffect(() => {
    loadPredictions();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      console.log('Auto-refreshing predictions...');
      loadPredictions();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval); // Cleanup on unmount
  }, []);

  // ... rest of component ...
};
```

**User experience**: Predictions automatically update every 5 minutes

### Option 3: Smart Refresh (Best UX)

Only auto-refresh if games are starting soon:

```jsx
useEffect(() => {
  loadPredictions();
  
  // Check if any games start in next 2 hours
  const hasUpcomingGames = predictions.some(p => {
    const gameTime = new Date(p.gameTime);
    const now = new Date();
    const hoursUntil = (gameTime - now) / (1000 * 60 * 60);
    return hoursUntil > 0 && hoursUntil < 2;
  });
  
  if (hasUpcomingGames) {
    // Refresh every 3 minutes if games are imminent
    const interval = setInterval(loadPredictions, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }
}, [predictions]);
```

## Testing Injury Freshness

### Manual Test (Today)

```bash
# 1. Check current injuries
curl https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries | jq '.injuries[] | {team: .displayName, players: [.injuries[].athlete.displayName]}'

# 2. Call your function
curl "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite-v2?_t=$(date +%s)"

# 3. Check logs for injury data
# Look for: [Injuries] ✅ Found X active injuries
```

### Verify Late Scratch Handling

```bash
# At 6:25 PM (25 min before 6:50 PM game)
curl "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite-v2" > /tmp/predictions_625pm.json

# At 6:35 PM (after late scratch posted)
curl "https://bgroundrobin.com/.netlify/functions/nba-predictions-elite-v2" > /tmp/predictions_635pm.json

# Compare injury adjustments
diff /tmp/predictions_625pm.json /tmp/predictions_635pm.json
```

## Bottom Line

### Current State
✅ **Backend is LIVE** - No caching, fetches fresh ESPN data every request  
✅ **6:30 PM refresh will work** - Will get scratches posted by ESPN  
⚠️ **Frontend doesn't auto-refresh** - User must manually reload page

### Recommended Action
Add a "Refresh Predictions" button or 5-minute auto-refresh to frontend.

### ESPN Data Timeliness
- Official injury reports: Within 10 minutes
- Late scratches: Usually 15-30 min before game
- **Your window**: Refreshing at 6:30 PM for 7:00 PM game = ✅ Will catch most scratches

### Edge Cases
If a player is scratched at 6:50 PM for 7:00 PM game:
- ❌ Probably too late for ESPN API to update
- ❌ Even refreshing won't help (data not available yet)
- ✅ But this is rare (NBA requires 30-min notice typically)

## Implementation Priority

**HIGH**: Add manual refresh button  
**MEDIUM**: Add 5-minute auto-refresh  
**LOW**: Smart refresh based on game times

The manual refresh button is the quickest win - users can control when they want fresh data.
