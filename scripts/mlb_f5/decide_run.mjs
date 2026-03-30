#!/usr/bin/env node
/**
 * F5 ML Smart Scheduler — Decision Script
 *
 * Runs every 30 min via GitHub Actions cron.  Checks the real MLB schedule,
 * determines if we're inside a trigger window, and writes GITHUB_OUTPUT vars:
 *
 *   SHOULD_RUN=true|false
 *   RUN_LABEL=morning|pre_afternoon|pre_night
 *   TARGET_DATE=YYYY-MM-DD
 *   FIRST_PITCH_ET=HH:MM
 *   LAST_PITCH_ET=HH:MM
 *   GAMES_COUNT=N
 *
 * Trigger windows (all America/New_York):
 *   morning:        09:00–09:15 ET  (fixed daily preview)
 *   pre_afternoon:  firstPitch − 90 min  ± 10 min
 *   pre_night:      lastPitch  − 90 min  ± 10 min
 *
 * De-dupe: checks Netlify Blobs for existing snapshot key.
 */

import fs from "fs";

// ──────────────────────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────────────────────
const LEAD_MINUTES   = parseInt(process.env.LEAD_MINUTES   || "90", 10);
// GitHub Actions cron routinely delays 5-40+ minutes, so keep window wide
const WINDOW_MINUTES = parseInt(process.env.WINDOW_MINUTES || "30", 10);
const MLB_API        = "https://statsapi.mlb.com/api/v1";
const BLOBS_STORE    = process.env.BLOBS_STORE || "rrmodelblobs";
const SEASON_START_MONTH = 3;   // March
const SEASON_END_MONTH   = 10;  // October

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

/** Convert a Date to YYYY-MM-DD in ET. */
function toETDateStr(d) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Convert a Date to HH:MM in ET. */
function toETTimeStr(d) {
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Get the current hour in ET (0-23). */
function etHour(d) {
  return parseInt(
    d.toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      hour: "2-digit",
    }),
    10
  );
}

/** Get the current minute in ET (0-59). */
function etMinute(d) {
  return parseInt(
    d.toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      minute: "2-digit",
    }),
    10
  );
}

/** Convert a Date to total minutes since midnight ET. */
function toMinutesET(d) {
  const parts = d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/** Is `now` within ±window of `target` (both in minutes-since-midnight-ET)? */
function inWindow(nowMin, targetMin, halfWindow) {
  return Math.abs(nowMin - targetMin) <= halfWindow;
}

/** Write to GITHUB_OUTPUT file (or stdout if local). */
function setOutput(key, value) {
  const line = `${key}=${value}`;
  const file = process.env.GITHUB_OUTPUT;
  if (file) {
    fs.appendFileSync(file, line + "\n");
  }
  console.log(`  >> ${line}`);
}

function noOp(reason) {
  console.log(`⏭️  NO-OP: ${reason}`);
  setOutput("SHOULD_RUN", "false");
  setOutput("RUN_LABEL", "none");
  setOutput("TARGET_DATE", "");
  setOutput("SKIP_REASON", reason);
  process.exit(0);
}

// ──────────────────────────────────────────────────────────────
// CHECK BLOBS FOR EXISTING SNAPSHOT
// ──────────────────────────────────────────────────────────────
async function snapshotExists(dateStr, label) {
  const key = `mlb/f5_ml/${dateStr}_${label}.json`;

  // If running in GitHub Actions, use Blobs API directly
  const siteID =
    process.env.NETLIFY_SITE_ID ||
    process.env.NETLIFY_BLOBS_SITE_ID ||
    process.env.SITE_ID;
  const token =
    process.env.NETLIFY_AUTH_TOKEN ||
    process.env.NETLIFY_TOKEN ||
    process.env.NETLIFY_BLOBS_TOKEN;

  if (!siteID || !token) {
    // Can't check — assume not exists (will be caught by upload logic)
    console.log(`  ⚠️  No Blobs creds — skipping de-dupe check for ${key}`);
    return false;
  }

  try {
    // Dynamic import so the script doesn't crash without @netlify/blobs
    const { getStore } = await import("@netlify/blobs");
    const store = getStore({ name: BLOBS_STORE, siteID, token });
    const entry = await store.getWithMetadata(key, { type: "text" });
    if (entry !== null) {
      console.log(`  ✅  Snapshot already exists: ${key}`);
      return true;
    }
    return false;
  } catch (e) {
    // 404 or other — treat as not existing
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────
async function main() {
  const now = new Date();
  const targetDate = toETDateStr(now);
  const nowMin = toMinutesET(now);

  console.log(`🧠  F5 ML Decision — ${targetDate} ${toETTimeStr(now)} ET`);

  // ── Force overrides (workflow_dispatch) ──
  const forceDate  = process.env.FORCE_DATE;
  const forceLabel = process.env.FORCE_LABEL;
  if (forceDate && forceLabel) {
    console.log(`🔧  FORCE mode: date=${forceDate} label=${forceLabel}`);
    setOutput("SHOULD_RUN", "true");
    setOutput("RUN_LABEL", forceLabel);
    setOutput("TARGET_DATE", forceDate);
    setOutput("FIRST_PITCH_ET", "forced");
    setOutput("LAST_PITCH_ET", "forced");
    setOutput("GAMES_COUNT", "0");
    return;
  }

  // ── Off-season check ──
  const month = parseInt(targetDate.split("-")[1], 10);
  if (month < SEASON_START_MONTH || month > SEASON_END_MONTH) {
    noOp(`Off-season (month ${month})`);
  }

  // ── Too early / too late ──
  if (nowMin < 8 * 60 || nowMin > 23 * 60 + 30) {
    noOp(`Outside operating hours (${toETTimeStr(now)} ET)`);
  }

  // ── Fetch MLB schedule ──
  console.log(`📅  Fetching MLB schedule for ${targetDate}…`);
  const url = `${MLB_API}/schedule?sportId=1&date=${targetDate}&gameType=R,D,L,W,F&hydrate=linescore`;
  const resp = await fetch(url);
  if (!resp.ok) {
    noOp(`MLB API error: HTTP ${resp.status}`);
    return;
  }
  const data = await resp.json();

  // Extract scheduled game start times
  const games = [];
  for (const dateEntry of data.dates || []) {
    for (const game of dateEntry.games || []) {
      const code = game.status?.statusCode;
      // Include scheduled, pre-game, warmup, in-progress
      if (["S", "P", "PW", "I"].includes(code) || code === undefined) {
        const start = new Date(game.gameDate);
        games.push({
          gamePk: game.gamePk,
          start,
          startET: toETTimeStr(start),
          home: game.teams?.home?.team?.name || "?",
          away: game.teams?.away?.team?.name || "?",
          status: code || "S",
        });
      }
    }
  }

  console.log(`  Found ${games.length} game(s) on schedule`);

  if (games.length === 0) {
    noOp("No games scheduled today");
    return;
  }

  // ── Compute first/last pitch ──
  const starts = games.map((g) => g.start);
  const firstStart = new Date(Math.min(...starts));
  const lastStart  = new Date(Math.max(...starts));
  const firstMin = toMinutesET(firstStart);
  const lastMin  = toMinutesET(lastStart);

  const firstPitchET = toETTimeStr(firstStart);
  const lastPitchET  = toETTimeStr(lastStart);

  console.log(`  First pitch: ${firstPitchET} ET`);
  console.log(`  Last pitch:  ${lastPitchET} ET`);

  // ── Compute trigger windows ──
  const morningStart = 8 * 60 + 30;  // 08:30 ET — wide to survive cron drift
  const morningEnd   = 10 * 60;      // 10:00 ET
  const preAfternoonTarget = firstMin - LEAD_MINUTES;
  const preNightTarget     = lastMin  - LEAD_MINUTES;

  const candidates = [];

  // 1) Morning window
  if (nowMin >= morningStart && nowMin <= morningEnd) {
    candidates.push("morning");
  }

  // 2) Pre-afternoon window
  if (inWindow(nowMin, preAfternoonTarget, WINDOW_MINUTES)) {
    candidates.push("pre_afternoon");
  }

  // 3) Pre-night window (only if meaningfully different from pre_afternoon)
  if (inWindow(nowMin, preNightTarget, WINDOW_MINUTES)) {
    // Avoid duplicate if pre_night overlaps pre_afternoon
    if (Math.abs(preNightTarget - preAfternoonTarget) > WINDOW_MINUTES * 2) {
      candidates.push("pre_night");
    } else if (!candidates.includes("pre_afternoon")) {
      // If they overlap and pre_afternoon wasn't matched, use pre_night
      candidates.push("pre_night");
    }
  }

  if (candidates.length === 0) {
    const nextWindows = [];
    if (nowMin < morningStart) nextWindows.push(`morning @ 09:00`);
    if (nowMin < preAfternoonTarget - WINDOW_MINUTES) {
      const h = Math.floor(preAfternoonTarget / 60);
      const m = preAfternoonTarget % 60;
      nextWindows.push(`pre_afternoon @ ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
    if (nowMin < preNightTarget - WINDOW_MINUTES) {
      const h = Math.floor(preNightTarget / 60);
      const m = preNightTarget % 60;
      nextWindows.push(`pre_night @ ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
    const hint = nextWindows.length > 0 ? ` (next: ${nextWindows[0]})` : "";
    noOp(`Not in any trigger window${hint}`);
    return;
  }

  // ── De-dupe: pick the first candidate that hasn't run yet ──
  let runLabel = null;
  for (const label of candidates) {
    const exists = await snapshotExists(targetDate, label);
    if (!exists) {
      runLabel = label;
      break;
    }
  }

  if (!runLabel) {
    noOp("All candidate snapshots already exist — de-duped");
    return;
  }

  // ── Emit outputs ──
  console.log(`\n🟢  TRIGGER: ${runLabel} for ${targetDate}`);
  setOutput("SHOULD_RUN", "true");
  setOutput("RUN_LABEL", runLabel);
  setOutput("TARGET_DATE", targetDate);
  setOutput("FIRST_PITCH_ET", firstPitchET);
  setOutput("LAST_PITCH_ET", lastPitchET);
  setOutput("GAMES_COUNT", String(games.length));
}

main().catch((e) => {
  console.error("❌  Decision script error:", e);
  // Fail gracefully — no-op rather than crash the workflow
  setOutput("SHOULD_RUN", "false");
  setOutput("RUN_LABEL", "error");
  setOutput("TARGET_DATE", "");
  setOutput("SKIP_REASON", `Error: ${e.message || e}`);
  process.exit(0);
});
