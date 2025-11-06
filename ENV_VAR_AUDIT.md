# Environment Variables Audit
**Generated**: November 6, 2025

## ✅ KEEP - Currently Used (Fantasy Football)

### Fantasy Sit/Start Tool (ACTIVE)
1. **YAHOO_CLIENT_ID** ✅ CRITICAL
   - Used in: `ff-auth-start.mjs`, `ff-auth-callback.mjs`, `ff-blobs.mjs`
   - Purpose: Yahoo OAuth authentication

2. **YAHOO_CLIENT_SECRET** ✅ CRITICAL
   - Used in: `ff-auth-callback.mjs`, `ff-blobs.mjs`
   - Purpose: Yahoo OAuth token exchange

3. **YAHOO_REDIRECT_URI** ✅ CRITICAL
   - Used in: `ff-auth-start.mjs`, `ff-auth-callback.mjs`, `ff-blobs.mjs`
   - Purpose: OAuth callback URL

4. **ODDS_API_KEY** ✅ CRITICAL
   - Used in: `ff-odds.mjs`, `nfl-model-v4.1/`, `nfl-model-v2/`
   - Purpose: TheOddsAPI for game lines and player props

5. **ANTHROPIC_API_KEY** ✅ CRITICAL
   - Used in: `ff-weekly-roast.mjs`
   - Purpose: Claude AI for weekly league roasts

6. **NETLIFY_TOKEN** ✅ CRITICAL
   - Used in: `ff-auth-callback.mjs`, `ff-blobs.mjs`
   - Purpose: Netlify Blobs access for token storage

7. **SITE_ID** ✅ CRITICAL
   - Used in: `ff-auth-callback.mjs`, `ff-blobs.mjs`, `blobs-nfl-v41.mjs`
   - Purpose: Netlify Blobs site identification
   - Note: Also used by NFL V4.1 model

## ✅ KEEP - Currently Used (NFL/NBA/MLB Models)

8. **BALLDONTLIE_API_KEY** ✅
   - Purpose: NBA data (if you use NBA features)
   - Used by: NBA components

9. **BLOBS_STORE_NFL** ✅
   - Used in: `netlify.toml`
   - Purpose: NFL TD props blob storage
   - Value: "nfl-td"

10. **NODE_VERSION** ✅
    - Used in: `netlify.toml`
    - Purpose: Specify Node.js version for builds
    - Value: "20"

11. **NFL_SCHEDULE_URL** ✅
    - Used in: `netlify.toml`
    - Purpose: NFL schedule data endpoint

12. **NFLVERSE_TEAM_FORM_URL** ✅
    - Used in: `netlify.toml`
    - Purpose: NFL team form data

## ⚠️ REVIEW - Possibly Redundant

13. **ODDS_API_KEY_NEGCORR** ⚠️ DUPLICATE
    - Same value as ODDS_API_KEY
    - **Action**: DELETE (use ODDS_API_KEY instead)

14. **ODDS_API_KEY_NFL** ⚠️ DUPLICATE
    - Same value as ODDS_API_KEY
    - **Action**: DELETE (use ODDS_API_KEY instead)

15. **THEODDS_API_KEY** ⚠️ DUPLICATE
    - Masked value, likely same as ODDS_API_KEY
    - **Action**: DELETE (use ODDS_API_KEY instead)

16. **FF_API_KEY** ⚠️ OPTIONAL
    - Used in: `ff-run.mjs` (for optional API key protection)
    - Purpose: Endpoint protection (optional feature)
    - **Action**: Keep if you want endpoint security, DELETE if not needed

17. **NETLIFY_API_TOKEN** ⚠️ DUPLICATE
    - Different from NETLIFY_TOKEN
    - **Action**: Check if used anywhere, likely DELETE

18. **NETLIFY_AUTH_TOKEN** ⚠️ DUPLICATE
    - Different from NETLIFY_TOKEN
    - **Action**: Check if used anywhere, likely DELETE

19. **NETLIFY_BLOBS_TOKEN** ⚠️ DUPLICATE
    - Same value as NETLIFY_TOKEN
    - **Action**: DELETE (use NETLIFY_TOKEN instead)

20. **NETLIFY_SITE_ID** ⚠️ DUPLICATE
    - Likely duplicate of SITE_ID
    - **Action**: DELETE (use SITE_ID instead)

## ❌ DELETE - Not Used in Code

21. **BACKOFF_MS** ❌
    - Value: "500,1000"
    - Not found in codebase
    - **Action**: DELETE

22. **BLOBS_STORE** ❌
    - Value: "mlb-odds"
    - MLB-specific, not actively used
    - **Action**: DELETE (unless you use MLB features)

23. **BOOKMAKERS** ❌
    - Hardcoded in code files instead
    - **Action**: DELETE

24. **ESPN_ROSTERS_URL** ❌
    - Not found in active code
    - **Action**: DELETE

25. **FOOTBALL_DATA_API_KEY** ❌
    - Used by: `fd-proxy.js` (soccer)
    - **Action**: DELETE if not using soccer predictions

26. **FOOTBALL_DATA_KEY** ❌ DUPLICATE
    - Same as above
    - **Action**: DELETE

27. **VITE_FOOTBALL_DATA_KEY** ❌ DUPLICATE
    - Same as above
    - **Action**: DELETE

28. **MSF_API_KEY** ❌
    - MySportsFeeds API (incomplete value)
    - Not found in active code
    - **Action**: DELETE

29. **NETLIFY_DATABASE_URL** ❌
    - Neon PostgreSQL connection
    - Not used in current codebase
    - **Action**: DELETE (unless planning to use database)

30. **NETLIFY_DATABASE_URL_UNPOOLED** ❌ DUPLICATE
    - Same as above
    - **Action**: DELETE

31. **NFLVERSE_PBP_URL** ❌
    - Not found in active code
    - **Action**: DELETE

32. **NFL_ODDS_BRIDGE_URL** ❌
    - Used in netlify.toml but function doesn't exist
    - **Action**: DELETE

33. **NFL_PREDICTIONS_DIAG_URL** ❌
    - Not found in active code
    - **Action**: DELETE

34. **NFL_ROSTERS_SOURCE** ❌
    - Value: "espn"
    - Not found in active code
    - **Action**: DELETE

35. **NFL_SEASON** ❌
    - Hardcoded in functions instead
    - **Action**: DELETE

36. **NFL_TD_BLOBS** ❌ DUPLICATE
    - Same as BLOBS_STORE_NFL
    - **Action**: DELETE

37. **ODDSAPI_BASE** ❌
    - Hardcoded in ff-odds.mjs
    - **Action**: DELETE

38. **ODDSAPI_BOOKMAKER_NFL** ❌
    - Hardcoded in code
    - **Action**: DELETE

39. **ODDSAPI_MARKET_NFL** ❌
    - Hardcoded in code
    - **Action**: DELETE

40. **ODDSAPI_REGION** ❌
    - Hardcoded in code
    - **Action**: DELETE

41. **ODDSAPI_REGION_NFL** ❌
    - Hardcoded in code
    - **Action**: DELETE

42. **ODDSAPI_SPORT_KEY** ❌
    - Hardcoded in code
    - **Action**: DELETE

43. **ODDSAPI_SPORT_NFL** ❌
    - Hardcoded in code
    - **Action**: DELETE

44. **ODDSMARKET_HITS** ❌
    - MLB-specific
    - **Action**: DELETE

45. **ODDSMARKET_HRR_MULTI** ❌
    - MLB-specific
    - **Action**: DELETE

46. **ODDS_HR_MARKETS** ❌
    - MLB-specific
    - **Action**: DELETE

47. **ODDS_REGIONS** ❌
    - Hardcoded in code
    - **Action**: DELETE

48. **ODDS_SPORT** ❌
    - MLB-specific
    - **Action**: DELETE

49. **ODDS_SPORTS** ❌
    - MLB-specific
    - **Action**: DELETE

50. **PROP_OUTCOME_FIELD** ❌
    - Not found in codebase
    - **Action**: DELETE

51. **PROP_OUTCOME_PLAYER_FIELDS** ❌
    - Not found in codebase
    - **Action**: DELETE

52. **PROVIDER** ❌
    - Not an env var, used in code logic
    - **Action**: DELETE

53. **RAIN_SECRET** ❌
    - Not found in codebase
    - **Action**: DELETE

54. **RAPIDAPI_KEY** ❌
    - Only used in old documentation
    - **Action**: DELETE (unless actively using RapidAPI)

55. **RAPIDAPI_NFL_KEY** ❌
    - Masked value, old integration
    - **Action**: DELETE

56. **SPORTRADAR_ACCESS_LEVEL** ❌
    - Value: "trial"
    - Not found in active code
    - **Action**: DELETE

57. **SPORTRADAR_API_KEY** ❌
    - Not found in active code
    - **Action**: DELETE

58. **SPORTRADAR_LANG** ❌
    - Not found in active code
    - **Action**: DELETE

59. **SPORTSDATAIO_API_KEY** ❌
    - Masked value, not used
    - **Action**: DELETE

60. **SPORTSDATAIO_KEY** ❌
    - Not found in active code
    - **Action**: DELETE

61. **SPORTSGAMEODDS_KEY** ❌
    - Not found in active code
    - **Action**: DELETE

62. **SPORTS_BLAZE_KEY** ❌
    - Not found in active code
    - **Action**: DELETE

63. **SSOT_DIR** ❌
    - Used in old NFL model system
    - **Action**: DELETE (unless using SSOT)

64. **TEAM_FORM_URL** ❌
    - Duplicate of NFLVERSE_TEAM_FORM_URL
    - **Action**: DELETE

65. **TRAIN_YEARS** ❌
    - Used in old model training
    - **Action**: DELETE

66. **USE_SSOT** ❌
    - Feature flag for old system
    - **Action**: DELETE

67. **VITE_ODDS_API_KEY** ❌
    - Same as ODDS_API_KEY, not needed
    - **Action**: DELETE

68. **WEATHER_BRIDGE_URL** ❌
    - OpenWeatherMap API (embedded key - security issue!)
    - Not found in active code
    - **Action**: DELETE

69. **batter_home_runs** ❌
    - MLB-specific config
    - **Action**: DELETE

70. **rrmodelblobs** ❌
    - Old blob token
    - **Action**: DELETE

## 📊 Summary

**Total Variables**: 70
**Keep (Active)**: 12
**Review (Duplicates)**: 8
**Delete (Unused)**: 50

## 🎯 Recommended Action Plan

### Phase 1: Delete Obvious Duplicates (Safe)
```
ODDS_API_KEY_NEGCORR
ODDS_API_KEY_NFL
THEODDS_API_KEY
NETLIFY_BLOBS_TOKEN
NETLIFY_SITE_ID
FOOTBALL_DATA_KEY
VITE_FOOTBALL_DATA_KEY
VITE_ODDS_API_KEY
NFL_TD_BLOBS
TEAM_FORM_URL
```

### Phase 2: Delete MLB/Soccer Specific (if not using)
```
BLOBS_STORE
ODDSMARKET_HITS
ODDSMARKET_HRR_MULTI
ODDS_HR_MARKETS
ODDS_SPORT
ODDS_SPORTS
batter_home_runs
FOOTBALL_DATA_API_KEY
```

### Phase 3: Delete Old API Keys (not in use)
```
MSF_API_KEY
RAPIDAPI_KEY
RAPIDAPI_NFL_KEY
SPORTRADAR_API_KEY
SPORTRADAR_ACCESS_LEVEL
SPORTRADAR_LANG
SPORTSDATAIO_API_KEY
SPORTSDATAIO_KEY
SPORTSGAMEODDS_KEY
SPORTS_BLAZE_KEY
RAIN_SECRET
```

### Phase 4: Delete Unused Config
```
BACKOFF_MS
ESPN_ROSTERS_URL
NETLIFY_DATABASE_URL
NETLIFY_DATABASE_URL_UNPOOLED
NFLVERSE_PBP_URL
NFL_ODDS_BRIDGE_URL
NFL_PREDICTIONS_DIAG_URL
NFL_ROSTERS_SOURCE
NFL_SEASON
ODDSAPI_BASE
ODDSAPI_BOOKMAKER_NFL
ODDSAPI_MARKET_NFL
ODDSAPI_REGION
ODDSAPI_REGION_NFL
ODDSAPI_SPORT_KEY
ODDSAPI_SPORT_NFL
ODDS_REGIONS
PROP_OUTCOME_FIELD
PROP_OUTCOME_PLAYER_FIELDS
PROVIDER
SSOT_DIR
TRAIN_YEARS
USE_SSOT
WEATHER_BRIDGE_URL
rrmodelblobs
BOOKMAKERS
```

### Phase 5: Review Optional
```
FF_API_KEY (keep if you want endpoint protection)
NETLIFY_API_TOKEN (check if used)
NETLIFY_AUTH_TOKEN (check if used)
BALLDONTLIE_API_KEY (keep if using NBA)
```

## 🚨 Estimated Size Reduction

**Current**: ~4KB+ (exceeding limit)
**After Cleanup**: ~1.5KB (well under limit)

**Safe to delete**: 50+ variables = ~2.5KB reduction
