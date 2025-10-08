# How to Test the Injury System

## Step 1: Check if Deployment is Live

```bash
curl -s "https://goldmananalytics.netlify.app/.netlify/functions/nfl-injuries-comprehensive" 2>&1 | head -20
```

**What to look for**:
- ❌ "Not Found" = Still deploying (wait 1-2 minutes)
- ✅ JSON response = Deployment is live!

---

## Step 2: Test Injury Endpoint (Quick Check)

```bash
curl -s "https://goldmananalytics.netlify.app/.netlify/functions/nfl-injuries-comprehensive" | jq '{
  teams: (.teams | length),
  total: .summary.totalInjuriesFound,
  significant: .summary.significantInjuries,
  parseErrors: (.summary.parseErrors // 0)
}'
```

**Expected Result**:
```json
{
  "teams": 32,
  "total": 150,        // or some number > 0
  "significant": 45,   // or some number > 0
  "parseErrors": 0     // or very low
}
```

**Bad Results** (means something's wrong):
```json
{
  "teams": 32,
  "total": 0,          // ❌ No injuries found
  "significant": 0,
  "parseErrors": 320   // ❌ Many errors
}
```

---

## Step 3: See Sample Injuries by Team

```bash
curl -s "https://goldmananalytics.netlify.app/.netlify/functions/nfl-injuries-comprehensive" | jq '
  .teams | to_entries | map({
    team: .key,
    injuries: (.value.injuries | length),
    sample: (.value.injuries[0].playerName // "none")
  }) | sort_by(-.injuries) | .[0:10]
'
```

**Expected**: List of teams with injury counts and sample player names

---

## Step 4: Check Specific Team Details

```bash
# Check Cincinnati Bengals
curl -s "https://goldmananalytics.netlify.app/.netlify/functions/nfl-injuries-comprehensive" | jq '.teams.CIN | {
  team: .teamName,
  injuries: (.injuries | length),
  significant: .significantInjuries,
  players: [.injuries[] | {name: .playerName, pos: .position, status: .status, impact: .impact.spreadImpact}]
}'
```

**Replace `CIN` with any team code**: ARI, ATL, BAL, BUF, CAR, CHI, CIN, CLE, DAL, DEN, DET, GB, HOU, IND, JAX, KC, LV, LAC, LAR, MIA, MIN, NE, NO, NYG, NYJ, PHI, PIT, SF, SEA, TB, TEN, WAS

---

## Step 5: Test Predictions Integration

```bash
curl -s "https://goldmananalytics.netlify.app/.netlify/functions/nfl-predictions-generate" | jq '
  .predictions[] | select(.injuryAnalysis.hasInjuryImpact == true) | {
    game: (.awayTeam + " @ " + .homeTeam),
    homeImpact: .injuryAnalysis.home.totalImpact,
    awayImpact: .injuryAnalysis.away.totalImpact,
    netAdvantage: (.injuryAnalysis.home.totalImpact - .injuryAnalysis.away.totalImpact)
  }
' | head -30
```

**Expected**: Games with non-zero injury impacts showing which team is more affected

---

## Step 6: Check Critical Alerts

```bash
curl -s "https://goldmananalytics.netlify.app/.netlify/functions/nfl-injuries-comprehensive" | jq '.summary.criticalAlerts[]'
```

**Expected**: List of high-impact injuries (>3 points):
```
"CIN: Joe Burrow (QB, questionable) ~4.2 pts"
"SF: Christian McCaffrey (RB, out) ~3.5 pts"
```

---

## Step 7: Verify Frontend

1. Visit: https://goldmananalytics.netlify.app
2. Look for games in the predictions table
3. Check for **🏥 emoji** next to teams with significant injuries
4. Hover/click for injury tooltips (if implemented)

---

## Step 8: Check Parse Errors (Troubleshooting)

If you see `parseErrors > 0`, check the Netlify function logs:

1. Go to: https://app.netlify.com/sites/goldmananalytics/functions
2. Click on `nfl-injuries-comprehensive`
3. View recent invocations
4. Look for `⚠️` warnings in logs

Common warnings:
- `⚠️ Impact calculation failed for PlayerName` = expected for some edge cases
- `⚠️ No ESPN ID for team` = team mapping issue
- `⚠️ ESPN API error: 429` = rate limited (unlikely with 150ms delays)

---

## Quick One-Liner Tests

### Test if ANY injuries exist:
```bash
curl -s "https://goldmananalytics.netlify.app/.netlify/functions/nfl-injuries-comprehensive" | jq '.summary.totalInjuriesFound'
```
**Expected**: A number > 0

### Test if predictions use injuries:
```bash
curl -s "https://goldmananalytics.netlify.app/.netlify/functions/nfl-predictions-generate" | jq '[.predictions[] | select(.injuryAnalysis.hasInjuryImpact == true)] | length'
```
**Expected**: A number > 0 (how many games have injury impacts)

### Test ESPN API directly (bypassing our code):
```bash
curl -s "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/4/injuries" | jq '{count: (.count // 0), items: (.items | length)}'
```
**Expected**: `{"count": 25, "items": 25}` or similar

---

## What Success Looks Like

### ✅ Successful Deployment:
```bash
$ curl -s "https://goldmananalytics.netlify.app/.netlify/functions/nfl-injuries-comprehensive" | jq .summary
{
  "totalInjuriesFound": 187,
  "significantInjuries": 52,
  "replacementAdjustedCount": 89,
  "criticalAlerts": [
    "CIN: Joe Burrow (QB, questionable) ~4.2 pts",
    "SF: Christian McCaffrey (RB, out) ~3.5 pts"
  ],
  "systemEffectiveness": 0.94,
  "parseErrors": 0
}
```

### ❌ Failed Deployment (Old Bug):
```bash
$ curl -s "https://goldmananalytics.netlify.app/.netlify/functions/nfl-injuries-comprehensive" | jq .summary
{
  "totalInjuriesFound": 0,
  "significantInjuries": 0,
  "replacementAdjustedCount": 0,
  "criticalAlerts": [],
  "systemEffectiveness": 0,
  "parseErrors": 320
}
```

---

## Troubleshooting

### Issue: "Not Found"
**Solution**: Wait for Netlify deployment (2-5 minutes)

### Issue: `totalInjuries: 0`
**Check**:
1. Parse errors count (should be low)
2. ESPN API status (test directly)
3. Netlify logs for error messages

### Issue: `parseErrors: 100+`
**Check**:
1. `finalPoints` initialization is working
2. ESPN API response format hasn't changed
3. Player depth chart data is loading

### Issue: Predictions don't show injury impacts
**Check**:
1. Injury endpoint returns data
2. `injuryAnalysis.hasInjuryImpact` is present in predictions
3. Blob storage cache is being used/updated

---

## Expected Timeline

- **Now**: Deployment in progress
- **+2 minutes**: Endpoint should be live
- **+5 minutes**: Predictions should integrate injury data
- **+10 minutes**: Frontend should show 🏥 indicators

---

## Quick Status Check Script

Save this as `check-injuries.sh`:

```bash
#!/bin/bash

echo "🔍 Testing Injury System..."
echo ""

# Test 1: Endpoint availability
echo "1️⃣ Checking endpoint..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://goldmananalytics.netlify.app/.netlify/functions/nfl-injuries-comprehensive")
if [ "$STATUS" -eq 200 ]; then
  echo "   ✅ Endpoint is live (HTTP $STATUS)"
else
  echo "   ❌ Endpoint not available (HTTP $STATUS)"
  exit 1
fi

# Test 2: Injury count
echo ""
echo "2️⃣ Checking injury data..."
INJURIES=$(curl -s "https://goldmananalytics.netlify.app/.netlify/functions/nfl-injuries-comprehensive" | jq -r '.summary.totalInjuriesFound // 0')
if [ "$INJURIES" -gt 0 ]; then
  echo "   ✅ Found $INJURIES total injuries"
else
  echo "   ❌ No injuries found"
fi

# Test 3: Parse errors
echo ""
echo "3️⃣ Checking parse errors..."
ERRORS=$(curl -s "https://goldmananalytics.netlify.app/.netlify/functions/nfl-injuries-comprehensive" | jq -r '.summary.parseErrors // 0')
if [ "$ERRORS" -lt 10 ]; then
  echo "   ✅ Parse errors: $ERRORS (acceptable)"
else
  echo "   ⚠️ Parse errors: $ERRORS (high)"
fi

# Test 4: Predictions integration
echo ""
echo "4️⃣ Checking predictions integration..."
GAMES_WITH_INJURIES=$(curl -s "https://goldmananalytics.netlify.app/.netlify/functions/nfl-predictions-generate" | jq '[.predictions[] | select(.injuryAnalysis.hasInjuryImpact == true)] | length')
if [ "$GAMES_WITH_INJURIES" -gt 0 ]; then
  echo "   ✅ $GAMES_WITH_INJURIES games have injury impacts"
else
  echo "   ❌ No games showing injury impacts"
fi

echo ""
echo "✨ Status check complete!"
```

Run with: `chmod +x check-injuries.sh && ./check-injuries.sh`
