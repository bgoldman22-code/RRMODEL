# F5 ML Smart Scheduler — Production Audit & Hardening

**Date:** 2026-02-09  
**Auditor:** GitHub Copilot (Principal Engineer Review)  
**Scope:** Full audit of 11 architecture files + all fixes implemented  
**Verdict:** 🟢 **GO** — all blockers fixed, all should-fixes applied

---

## 1. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     GitHub Actions (cron */30)                       │
│                                                                     │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────┐  ┌─────────┐ │
│  │ decide_run   │─▶│ fetch_odds_   │─▶│ generate_  │─▶│ upload_ │ │
│  │   .mjs       │  │  today.mjs    │  │  f5_ml.py  │  │ to_     │ │
│  │              │  │               │  │            │  │ blobs   │ │
│  │ • MLB API    │  │ • TheOddsAPI  │  │ • Artifacts│  │  .mjs   │ │
│  │ • Trigger    │  │   F5 ML odds  │  │ • Features │  │         │ │
│  │   windows    │  │ • Consensus   │  │ • Live or  │  │ • Valid │ │
│  │ • De-dupe    │  │   (median)    │  │   static   │  │ • Snap  │ │
│  │   via Blobs  │  │ • game_pk     │  │   odds     │  │ • Meta  │ │
│  │              │  │   resolution  │  │ • Score    │  │ • Latest│ │
│  └──────┬───────┘  │ • → Blobs     │  │ • Filter  │  └────┬────┘ │
│         │          └───────────────┘  └────────────┘       │     │
│         │ SHOULD_RUN=false → skip                          │     │
└─────────┼──────────────────────────────────────────────────┼─────┘
          │                                                  │
          │                                                  ▼
          │                              ┌──────────────────────────┐
          │                              │    Netlify Blobs         │
          │                              │    (rrmodelblobs)        │
          │                              │                          │
          │     de-dupe read ◀───────────│ mlb/f5_ml/DATE_label.json│
          │                              │ mlb/f5_ml/latest.json    │
          │                              │ mlb/f5_ml/data/*.parquet │
          │                              │ mlb/f5_ml/odds/live/*.json│
          │                              └────────────┬─────────────┘
          │                                           │
          │                              ┌────────────▼─────────────┐
          │                              │  Netlify Function        │
          │                              │  f5-ml-latest.mjs        │
          │                              │                          │
          │                              │  GET /.netlify/functions/ │
          │                              │      f5-ml-latest        │
          │                              │  ?date=…&label=…         │
          │                              └────────────┬─────────────┘
          │                                           │
          │                              ┌────────────▼─────────────┐
          │                              │  Frontend (React)        │
          │                              │  MLBF5ML.jsx             │
          │                              │  Route: /mlb-f5-ml       │
          │                              │                          │
          │                              │  • Dark theme            │
          │                              │  • Pick cards + grades   │
          │                              │  • PNG export (iOS)      │
          │                              └──────────────────────────┘
```

---

## 2. Data Contracts

### Pick JSON Schema (output of generator, stored in Blobs)

```json
{
  "schema_version": 1,
  "model_id": "f5_ml_v2_0_0",
  "generated_at": "ISO-8601 UTC",
  "game_date": "YYYY-MM-DD",
  "pricing_mode": "consensus",
  "run_label": "morning|pre_afternoon|pre_night|manual",
  "thresholds": {
    "ev_min": 0.10,
    "edge_min": 0.07,
    "min_odds_american": -200,
    "max_odds_american": 300
  },
  "schedule_context": {
    "first_pitch_et": "HH:MM",
    "last_pitch_et": "HH:MM",
    "games_on_slate": 15
  },
  "picks": [
    {
      "pick_id": "game_pk:side:consensus:model_id",
      "game_pk": 12345,
      "game_date": "YYYY-MM-DD",
      "bet_side": "home|away",
      "bet_label": "Team Name F5 ML",
      "home_team": "Team A",
      "away_team": "Team B",
      "pricing_mode": "consensus",
      "odds_decimal": 1.9091,
      "odds_american": -110,
      "implied_prob": 0.5238,
      "p_model": 0.6200,
      "ev": 0.1234,
      "edge": 0.0962,
      "stake": 100,
      "potential_profit": 90.91
    }
  ],
  "meta": {
    "games_on_slate": 15,
    "games_scored": 15,
    "total_picks": 4,
    "generation_time_ms": 1200
  }
}
```

### Validation Gates (enforced at TWO layers)

**Python generator (`_validate_output()`):**
- Required top-level fields: `schema_version`, `model_id`, `generated_at`, `thresholds`, `picks`, `meta`
- Threshold locks: `ev_min == 0.10`, `edge_min == 0.07`
- `meta.total_picks` must exist
- Every pick: `odds_decimal`, `p_model`, `ev`, `edge` must be finite numbers

**Upload script (`upload_to_blobs.mjs`):**
- Same required fields + threshold locks
- Every pick value finite check
- Fails with exit code 1 on any validation error → workflow step fails visibly

### Blobs Key Scheme

| Key Pattern | Purpose | Cache | Written By |
|-------------|---------|-------|------------|
| `mlb/f5_ml/latest.json` | Most recent picks (only overwritten when picks > 0) | 60s | upload_to_blobs |
| `mlb/f5_ml/{date}_{label}.json` | Immutable daily snapshot | 3600s | upload_to_blobs |
| `mlb/f5_ml/data/features_v2.parquet` | Feature matrix | N/A (seed) | seed_data_to_blobs |
| `mlb/f5_ml/data/consensus_{year}.parquet` | Static odds by year (historical) | N/A (seed) | seed_data_to_blobs |
| `mlb/f5_ml/odds/live/{date}.json` | Live consensus odds (in-season) | N/A (daily) | fetch_odds_today |

### Snapshot Metadata (attached to each snapshot blob)

```json
{
  "generated_at": "2026-04-10T15:30:00.000Z",
  "pick_count": "4",
  "label": "morning",
  "date": "2026-04-10",
  "model_id": "f5_ml_v2_0_0"
}
```

### Decision Script Output Contract (GITHUB_OUTPUT)

| Key | On Run | On Skip |
|-----|--------|---------|
| `SHOULD_RUN` | `true` | `false` |
| `RUN_LABEL` | `morning\|pre_afternoon\|pre_night\|{forced}` | `none` |
| `TARGET_DATE` | `YYYY-MM-DD` | `` (empty) |
| `FIRST_PITCH_ET` | `HH:MM` or `forced` | — |
| `LAST_PITCH_ET` | `HH:MM` or `forced` | — |
| `GAMES_COUNT` | `N` | — |
| `SKIP_REASON` | — | Human-readable reason |

---

## 3. Scheduler Behavior

### Three-Run Logic

| # | Label | Trigger | Purpose |
|---|-------|---------|---------|
| 1 | `morning` | Fixed 09:00–09:15 ET | Daily preview before any pitch |
| 2 | `pre_afternoon` | `firstPitch - 90min ± 10min` | Refresh with latest odds before first game |
| 3 | `pre_night` | `lastPitch - 90min ± 10min` | Catch updated night game odds |

**Overlap guard:** `pre_night` only fires if its window is > 20 minutes away from `pre_afternoon`. Single-start-time slates get `pre_afternoon` only.

**Cron:** `*/30 12-23,0-3 * * * UTC` → 8:00 AM – midnight ET. Every 30-min tick guarantees hitting any 20-min window.

### De-dupe (Belt + Suspenders)

1. `decide_run.mjs` calls `store.getWithMetadata(key, { type: "text" })` for `mlb/f5_ml/{date}_{label}.json`
2. Returns non-null if blob exists → skip with reason "All candidate snapshots already exist"
3. `upload_to_blobs.mjs` writes snapshot with structured `metadata` object → future `getMetadata()` calls also work

### Force Override (workflow_dispatch)

- Set `force_date` + `force_label` → bypasses all schedule/window/de-dupe logic
- Emits `SHOULD_RUN=true`, `TARGET_DATE=force_date`, `RUN_LABEL=force_label`
- Use cases: backfill, recovery from missed window, end-to-end testing

### Guard Chain (evaluation order)

1. **FORCE mode** — `FORCE_DATE` + `FORCE_LABEL` env vars set → bypass everything
2. **Off-season** — month < 3 or > 10 → skip
3. **Operating hours** — before 8am or after 11:30pm ET → skip
4. **MLB API** — fetch schedule; HTTP error → skip
5. **No games** — 0 scheduled games → skip
6. **No trigger window** — current time not in any window → skip (logs next window)
7. **De-dupe** — all candidate snapshots exist in Blobs → skip

---

## 4. Architecture Wiring Verification

| Check | Status | Location |
|-------|--------|----------|
| Frontend route `/mlb-f5-ml` | ✅ | `App.jsx` line 154 |
| MLB dropdown "F5 Moneyline ⚾" | ✅ | `App.jsx` line 87 |
| `MLBF5ML` component imported | ✅ | `App.jsx` line 18 |
| Netlify function `f5-ml-latest.mjs` | ✅ | `netlify/functions/` |
| Function reads `mlb/f5_ml/latest.json` | ✅ | blob key in handler |
| Function supports `?date=&label=` | ✅ | URL param parsing |
| `html2canvas@^1.4.1` in `package.json` | ✅ | line 25 |
| `@netlify/blobs@^7.4.0` in `package.json` | ✅ | dependency |
| Workflow YAML references correct scripts | ✅ | steps 3/4/6/7 |
| FORCE_DATE/FORCE_LABEL wired end-to-end | ✅ | YAML inputs → env → decide_run.mjs |

---

## 5. File-by-File Audit

| File | Lines | Status | Changes Applied |
|------|-------|--------|-----------------|
| `scripts/mlb_f5/decide_run.mjs` | 317 | ✅ | FORCE_DATE/FORCE_LABEL support, getWithMetadata de-dupe |
| `scripts/mlb_f5/fetch_odds_today.mjs` | ~310 | ✅ | **NEW** — live F5 odds via TheOddsAPI → consensus → Blobs |
| `scripts/mlb_f5/generate_f5_ml.py` | ~460 | ✅ | Retry, validation, **live odds JSON fallback** (live → static parquet) |
| `scripts/mlb_f5/upload_to_blobs.mjs` | 141 | ✅ | Metadata on snapshot upload (generated_at, pick_count, label, date, model_id) |
| `scripts/mlb_f5/seed_data_to_blobs.mjs` | 77 | ✅ | Clean — no changes needed |
| `.github/workflows/mlb-f5-ml-smart.yml` | ~130 | ✅ | Added step 4 (fetch_odds_today) with ODDS_API_KEY secret |
| `.github/workflows/mlb-f5-ml-seed.yml` | 60 | ✅ | **NEW** — cloud seed workflow (workflow_dispatch) |
| `netlify/functions/f5-ml-latest.mjs` | 92 | ✅ | Cache headers (60s latest / 3600s snapshots), 404 for missing snapshots |
| `netlify/functions/_blobs-helper.mjs` | 40 | ✅ | Clean — no changes needed |
| `ml/f5_ml/prod_config.json` | 65 | ✅ | Documentary paths corrected |
| `src/pages/MLBF5ML.jsx` | 302 | ✅ | Clean — no changes needed |
| `src/App.jsx` | 177 | ✅ | Clean — no changes needed |

---

## 6. Issues Found & Resolved

### 🔴 Blockers (Fixed)

| # | Issue | Fix | File |
|---|-------|-----|------|
| B1 | `workflow_dispatch` inputs `force_date`/`force_label` ignored by decide_run | Added 12-line FORCE early-return block | `decide_run.mjs` |
| B2 | De-dupe used `getMetadata()` → returns null when no metadata set | Changed to `getWithMetadata(key, { type: "text" })` | `decide_run.mjs` |

### 🟡 Should-Fixes (Fixed)

| # | Issue | Fix | File |
|---|-------|-----|------|
| S1 | Python Blobs download had no retry | `HTTPAdapter(max_retries=Retry(3, backoff=1, [502,503,504]))` | `generate_f5_ml.py` |
| S2 | No output schema validation before write | `_validate_output()` — fields, thresholds, finite picks | `generate_f5_ml.py` |
| S3 | Upload didn't write snapshot metadata | Added `metadata: { generated_at, pick_count, label, date, model_id }` | `upload_to_blobs.mjs` |
| S4 | Same cache duration for latest & snapshots | Latest → 60s, snapshots → 3600s (immutable) | `f5-ml-latest.mjs` |
| S5 | Missing specific snapshot returned 200 | Returns 404 with `{ ok: false, error: "..." }` | `f5-ml-latest.mjs` |
| S6 | Seeding requires local machine | Created `mlb-f5-ml-seed.yml` workflow_dispatch | `.github/workflows/` |
| S7 | Documentary artifact paths wrong | Updated to `ml/f5_ml/artifacts` + correct filenames | `prod_config.json` |

---

## 7. Operational Checklist

### Pre-Launch (One-Time)

- [ ] **Set GitHub Actions secrets:**
  - `NETLIFY_SITE_ID` — your Netlify site ID
  - `NETLIFY_TOKEN` — Netlify personal access token with Blobs scope
  - `ODDS_API_KEY` — TheOddsAPI key (for live F5 odds ingestion)
- [ ] **Seed data to Blobs** (choose one):
  - **Cloud:** Commit parquet files to repo, trigger `mlb-f5-ml-seed` workflow
  - **Local:** `NETLIFY_SITE_ID=xxx NETLIFY_TOKEN=yyy node scripts/mlb_f5/seed_data_to_blobs.mjs --features <path> --odds-dir <path>`
- [ ] **Smoke test:** Trigger `mlb-f5-ml-smart` workflow with `force_date` (a date with data) + `force_label=manual`
- [ ] **Verify frontend:** Visit `/mlb-f5-ml` and confirm picks render with grades, export button works

### Daily Operations (Fully Automated)

- Workflow runs every 30 minutes via cron during season
- Decision script handles all scheduling, de-dupe, off-season guards
- **Zero human intervention needed April–October**

### Mid-Season Data Refresh

1. Features parquet only changes between seasons
2. **Live odds are fetched automatically** via `fetch_odds_today.mjs` — no manual refresh needed
3. For historical replay, add `consensus_{year}.parquet` to repo and run `mlb-f5-ml-seed` workflow

---

## 8. Live Odds Pipeline (TheOddsAPI)

### Architecture

```
TheOddsAPI                    MLB Stats API
     │                             │
     │ GET /v4/sports/             │ GET /api/v1/schedule
     │   baseball_mlb/odds         │   ?sportId=1&date=YYYY-MM-DD
     │   ?markets=h2h_1st_5_innings│
     │   &regions=us               │
     │   &oddsFormat=american      │
     └──────────┬──────────────────┘
                │
                ▼
    ┌──────────────────────┐
    │  fetch_odds_today    │
    │       .mjs           │
    │                      │
    │  1. Match events by  │
    │     team names →     │
    │     game_pk          │
    │                      │
    │  2. Collect American  │
    │     odds per side    │
    │     per sportsbook   │
    │                      │
    │  3. Compute median   │
    │     (consensus)      │
    │                      │
    │  4. Compute no-vig   │
    │     implied probs    │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │   Netlify Blobs      │
    │                      │
    │   mlb/f5_ml/odds/    │
    │     live/YYYY-MM-DD  │
    │     .json            │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │  generate_f5_ml.py   │
    │                      │
    │  _load_odds():       │
    │  1. Try live JSON    │
    │  2. Fall back to     │
    │     static parquet   │
    └──────────────────────┘
```

### Live Odds JSON Schema

```json
[
  {
    "game_pk": 778551,
    "game_date": "2026-04-10",
    "bet_side": "home",
    "team_home": "New York Yankees",
    "team_away": "Boston Red Sox",
    "odds_decimal": 1.6452,
    "odds_american": -155,
    "implied_prob_raw": 0.6079,
    "implied_prob_novig": 0.5800,
    "books_available": 7,
    "median_american": -155,
    "snapshot_utc": "2026-04-10T14:30:00.000Z"
  }
]
```

### Team Name Resolution

TheOddsAPI returns full team names (e.g., "New York Yankees"). These are matched
to MLB Stats API `gamePk` values by normalizing and comparing home/away team name
pairs. A comprehensive alias map handles edge cases (e.g., "LA Angels" → "Los Angeles Angels").

### Consensus (Median) Pricing

- All available US-region sportsbooks' American odds are collected per game/side
- **Median** is used (not mean) — robust to outliers from one book
- No-vig implied probability is calculated by normalizing home + away raw probs to sum to 1.0
- `books_available` tracks how many sportsbooks contributed to the consensus

### Fallback Logic in `generate_f5_ml.py`

Priority order via `_load_odds()`:
1. **Live JSON** (`mlb/f5_ml/odds/live/{date}.json`) — used for in-season dates
2. **Static Parquet** (`mlb/f5_ml/data/consensus_{year}.parquet`) — used for historical dates

This means:
- 2023–2025 seasons: static parquets (already seeded)
- 2026+ seasons: live JSON fetched daily from TheOddsAPI
- Zero manual intervention for future seasons

### API Quota

- Cost per call: **1 credit** (1 market × 1 region)
- Called once per workflow trigger window (max 3 per day)
- Typical season usage: ~3/day × 180 days = ~540 credits/season

---

## 9. Failure Modes & Monitoring

| Failure | Log Signature | Impact | Recovery |
|---------|--------------|--------|----------|
| MLB API down | `NO-OP: MLB API error: HTTP 5xx` | No picks this tick | Auto-retry next 30-min tick |
| TheOddsAPI down | `TheOddsAPI error: HTTP 5xx` | Workflow step fails | Generator falls back to static parquet if available |
| TheOddsAPI rate limited | `TheOddsAPI rate limited (429)` | No live odds | Falls back to static parquet; check quota |
| Missing ODDS_API_KEY | `Missing ODDS_API_KEY environment variable` | Odds step fails | Set secret in repo Settings → Secrets |
| No F5 odds available | `No F5 odds available from TheOddsAPI` | Empty odds file | Normal before bookmakers open lines |
| Team name mismatch | `Unmatched odds event: ...` | Some games miss odds | Add alias to ODDS_TEAM_ALIASES map |
| Blobs download fail (Python) | `Blobs download failed: HTTP 502` | Retries 3× automatically | If all fail: 0 picks; next tick retries |
| No games on date | `NO-OP: No games scheduled today` | None (expected) | N/A |
| De-duped | `NO-OP: All candidate snapshots already exist` | None (expected) | N/A |
| Missing secrets | `Missing NETLIFY_SITE_ID / NETLIFY_TOKEN` | Workflow fails | Set secrets in repo settings |
| Invalid output JSON | `Output validation failed` | No file written | Check features/odds data |
| Upload validation fail | `Validation failed: pick[N].ev = NaN` | No upload | Check consensus odds for that date |
| Frontend "No Picks" | `offseason: true` in response | None (expected off-season) | During season: check GH Actions logs |

### Key Log Lines

```
🟢  TRIGGER: morning for 2026-04-10       ← trigger fired
⏭️  NO-OP: Off-season (month 2)           ← expected off-season skip
⏭️  NO-OP: All candidate snapshots…       ← de-dupe working correctly
🎰  Fetching F5 ML odds from TheOddsAPI…  ← odds fetch started
  Quota: used=5, remaining=495, cost=1    ← API usage tracking
  Resolved: 15 matched, 0 unmatched       ← team name resolution
📊  Consensus: 30 records (15 games…)     ← consensus built
  ☁️  Uploaded 30 records → Blobs          ← odds saved to Blobs
✅  Loaded 30 live odds records for…       ← Python loaded live odds
✅  Output validation passed               ← schema verified
✅  F5 ML: 6 picks for 2026-04-10         ← generation success
F5 ML: ran morning for 2026-04-10…       ← upload success
❌  Output validation failed:              ← data/model issue
❌  Upload error:                          ← Blobs write issue
❌  fetch_odds_today error:                ← odds API issue
```

---

## 10. Local Testing Commands (Sanity Only — Production Never Depends on Local)

```bash
# 1. Test decision script (uses real MLB API for today)
node scripts/mlb_f5/decide_run.mjs

# 2. Test with force override
FORCE_DATE=2025-07-15 FORCE_LABEL=morning node scripts/mlb_f5/decide_run.mjs

# 3. Test live odds fetch (requires ODDS_API_KEY)
ODDS_API_KEY=xxx node scripts/mlb_f5/fetch_odds_today.mjs --date 2025-07-15

# 4. Test Python generator (needs data in Blobs or local cache)
python scripts/mlb_f5/generate_f5_ml.py \
  --date 2025-07-15 --run-label morning \
  --outdir tmp/f5_ml_out \
  --first-pitch-et 13:10 --last-pitch-et 22:10 --games-count 15

# 5. Test upload (needs Netlify creds)
NETLIFY_SITE_ID=xxx NETLIFY_TOKEN=yyy \
  node scripts/mlb_f5/upload_to_blobs.mjs \
    --file tmp/f5_ml_out/2025-07-15_morning.json \
    --label morning --date 2025-07-15
```

---

## 11. Verdict

**🟢 GO** — All blockers resolved, all should-fixes applied. Live odds ingestion via TheOddsAPI fully integrated (fetch → consensus → Blobs → Python fallback). Cloud seeding available via workflow_dispatch. Output validated at two layers (Python + upload). Cache headers differentiated. De-dupe reliable with `getWithMetadata` + snapshot metadata. Zero manual intervention needed for 2026+ seasons. Secrets (3 total: NETLIFY_SITE_ID, NETLIFY_TOKEN, ODDS_API_KEY) + seed + smoke test → ship.
