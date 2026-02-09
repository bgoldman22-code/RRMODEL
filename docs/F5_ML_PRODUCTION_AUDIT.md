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
│  ┌──────────────┐     ┌──────────────────┐     ┌────────────────┐  │
│  │ decide_run   │────▶│ generate_f5_ml   │────▶│ upload_to_     │  │
│  │   .mjs       │     │   .py            │     │   blobs.mjs    │  │
│  │              │     │                  │     │                │  │
│  │ • MLB API    │     │ • Load artifacts │     │ • Validate     │  │
│  │ • Trigger    │     │ • Download data  │     │ • Write snap   │  │
│  │   windows    │     │   from Blobs     │     │   + metadata   │  │
│  │ • De-dupe    │     │ • Score model    │     │ • Write latest │  │
│  │   via Blobs  │     │ • Filter picks   │     │   (if >0)      │  │
│  └──────┬───────┘     │ • Validate JSON  │     └──────┬─────────┘  │
│         │             └──────────────────┘            │            │
│         │ SHOULD_RUN=false → skip                     │            │
└─────────┼─────────────────────────────────────────────┼────────────┘
          │                                             │
          │                                             ▼
          │                              ┌──────────────────────────┐
          │                              │    Netlify Blobs         │
          │                              │    (rrmodelblobs)        │
          │                              │                          │
          │     de-dupe read ◀───────────│ mlb/f5_ml/DATE_label.json│
          │                              │ mlb/f5_ml/latest.json    │
          │                              │ mlb/f5_ml/data/*.parquet │
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
| `mlb/f5_ml/data/consensus_{year}.parquet` | Odds by year | N/A (seed) | seed_data_to_blobs |

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
| Workflow YAML references correct scripts | ✅ | steps 3/5/6 |
| FORCE_DATE/FORCE_LABEL wired end-to-end | ✅ | YAML inputs → env → decide_run.mjs |

---

## 5. File-by-File Audit

| File | Lines | Status | Changes Applied |
|------|-------|--------|-----------------|
| `scripts/mlb_f5/decide_run.mjs` | 317 | ✅ | FORCE_DATE/FORCE_LABEL support, getWithMetadata de-dupe |
| `scripts/mlb_f5/generate_f5_ml.py` | 389 | ✅ | Retry logic (HTTPAdapter×3), `_validate_output()` schema check |
| `scripts/mlb_f5/upload_to_blobs.mjs` | 141 | ✅ | Metadata on snapshot upload (generated_at, pick_count, label, date, model_id) |
| `scripts/mlb_f5/seed_data_to_blobs.mjs` | 77 | ✅ | Clean — no changes needed |
| `.github/workflows/mlb-f5-ml-smart.yml` | 113 | ✅ | Clean — no changes needed |
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

1. Add new `consensus_{year}.parquet` to repo
2. Run `mlb-f5-ml-seed` workflow to upload to Blobs
3. Features file only changes between seasons

---

## 8. Failure Modes & Monitoring

| Failure | Log Signature | Impact | Recovery |
|---------|--------------|--------|----------|
| MLB API down | `NO-OP: MLB API error: HTTP 5xx` | No picks this tick | Auto-retry next 30-min tick |
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
✅  Output validation passed               ← schema verified
✅  F5 ML: 6 picks for 2026-04-10         ← generation success
F5 ML: ran morning for 2026-04-10…       ← upload success
❌  Output validation failed:              ← data/model issue
❌  Upload error:                          ← Blobs write issue
```

---

## 9. Local Testing Commands (Sanity Only — Production Never Depends on Local)

```bash
# 1. Test decision script (uses real MLB API for today)
node scripts/mlb_f5/decide_run.mjs

# 2. Test with force override
FORCE_DATE=2025-07-15 FORCE_LABEL=morning node scripts/mlb_f5/decide_run.mjs

# 3. Test Python generator (needs data in Blobs or local cache)
python scripts/mlb_f5/generate_f5_ml.py \
  --date 2025-07-15 --run-label morning \
  --outdir tmp/f5_ml_out \
  --first-pitch-et 13:10 --last-pitch-et 22:10 --games-count 15

# 4. Test upload (needs Netlify creds)
NETLIFY_SITE_ID=xxx NETLIFY_TOKEN=yyy \
  node scripts/mlb_f5/upload_to_blobs.mjs \
    --file tmp/f5_ml_out/2025-07-15_morning.json \
    --label morning --date 2025-07-15
```

---

## 10. Verdict

**🟢 GO** — All blockers resolved, all should-fixes applied. Cloud seeding available via workflow_dispatch. Output validated at two layers (Python + upload). Cache headers differentiated. De-dupe reliable with `getWithMetadata` + snapshot metadata. Secrets + seed + smoke test → ship.
