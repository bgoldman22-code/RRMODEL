#!/usr/bin/env node
/**
 * F5 ML — Fetch Live Odds from TheOddsAPI
 *
 * Calls TheOddsAPI for today's MLB F5 (h2h_1st_5_innings) moneyline odds,
 * builds a consensus (median) across all available sportsbooks per game/side,
 * resolves TheOddsAPI team names → MLB game_pk via the MLB Stats API schedule,
 * and uploads the result to Netlify Blobs.
 *
 * Usage (from RRMODEL root):
 *   node scripts/mlb_f5/fetch_odds_today.mjs --date 2026-04-10
 *
 * Requires env:
 *   ODDS_API_KEY      – TheOddsAPI key
 *   NETLIFY_SITE_ID   – for Blobs upload
 *   NETLIFY_TOKEN      – for Blobs upload
 *
 * Writes to Blobs:
 *   mlb/f5_ml/odds/live/{YYYY-MM-DD}.json
 *
 * Output JSON schema (array of records):
 *   [
 *     {
 *       "game_pk": 778551,
 *       "game_date": "2026-04-10",
 *       "bet_side": "home",
 *       "team_home": "New York Yankees",
 *       "team_away": "Boston Red Sox",
 *       "odds_decimal": 1.6452,
 *       "odds_american": -155,
 *       "implied_prob_raw": 0.6079,
 *       "implied_prob_novig": 0.5800,
 *       "books_available": 7,
 *       "median_american": -155,
 *       "snapshot_utc": "2026-04-10T14:30:00.000Z"
 *     },
 *     ...
 *   ]
 */

import { getStore } from "@netlify/blobs";

// ──────────────────────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────────────────────
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const SPORT         = "baseball_mlb";
const MARKET        = "h2h_1st_5_innings";
const REGION        = "us";
const MLB_API       = "https://statsapi.mlb.com/api/v1";
const BLOBS_STORE   = process.env.BLOBS_STORE || "rrmodelblobs";

// TheOddsAPI team names → standard names used by MLB Stats API
// (TheOddsAPI usually matches MLB's full names, but a few edge cases exist)
const ODDS_TEAM_ALIASES = {
  "Arizona Diamondbacks":    "Arizona Diamondbacks",
  "Atlanta Braves":          "Atlanta Braves",
  "Baltimore Orioles":       "Baltimore Orioles",
  "Boston Red Sox":          "Boston Red Sox",
  "Chicago Cubs":            "Chicago Cubs",
  "Chicago White Sox":       "Chicago White Sox",
  "Cincinnati Reds":         "Cincinnati Reds",
  "Cleveland Guardians":     "Cleveland Guardians",
  "Colorado Rockies":        "Colorado Rockies",
  "Detroit Tigers":          "Detroit Tigers",
  "Houston Astros":          "Houston Astros",
  "Kansas City Royals":      "Kansas City Royals",
  "Los Angeles Angels":      "Los Angeles Angels",
  "Los Angeles Dodgers":     "Los Angeles Dodgers",
  "Miami Marlins":           "Miami Marlins",
  "Milwaukee Brewers":       "Milwaukee Brewers",
  "Minnesota Twins":         "Minnesota Twins",
  "New York Mets":           "New York Mets",
  "New York Yankees":        "New York Yankees",
  "Oakland Athletics":       "Oakland Athletics",
  "Philadelphia Phillies":   "Philadelphia Phillies",
  "Pittsburgh Pirates":      "Pittsburgh Pirates",
  "San Diego Padres":        "San Diego Padres",
  "San Francisco Giants":    "San Francisco Giants",
  "Seattle Mariners":        "Seattle Mariners",
  "St. Louis Cardinals":     "St. Louis Cardinals",
  "Tampa Bay Rays":          "Tampa Bay Rays",
  "Texas Rangers":           "Texas Rangers",
  "Toronto Blue Jays":       "Toronto Blue Jays",
  "Washington Nationals":    "Washington Nationals",
  // Historic / alternate names
  "Cleveland Indians":       "Cleveland Guardians",
  "LA Angels":               "Los Angeles Angels",
  "LA Dodgers":              "Los Angeles Dodgers",
  "Athletics":               "Oakland Athletics",
  "Sacramento Athletics":    "Oakland Athletics",
};

/** Normalize a team name for matching. */
function normalizeTeam(name) {
  return (ODDS_TEAM_ALIASES[name] || name).toLowerCase().trim();
}

// ──────────────────────────────────────────────────────────────
// ODDS MATH
// ──────────────────────────────────────────────────────────────

/** American → Decimal */
function americanToDecimal(a) {
  if (a > 0) return 1.0 + a / 100.0;
  return 1.0 + 100.0 / Math.abs(a);
}

/** Decimal → American */
function decimalToAmerican(d) {
  if (d >= 2.0) return Math.round((d - 1.0) * 100.0);
  return Math.round(-100.0 / (d - 1.0));
}

/** Decimal → Implied probability (raw, with vig) */
function impliedProb(d) {
  return d > 1.0 ? 1.0 / d : 0.0;
}

/** Median of an array of numbers. */
function median(arr) {
  if (arr.length === 0) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ──────────────────────────────────────────────────────────────
// FETCH MLB SCHEDULE (for game_pk resolution)
// ──────────────────────────────────────────────────────────────

async function fetchMLBSchedule(dateStr) {
  const url = `${MLB_API}/schedule?sportId=1&date=${dateStr}&gameType=R,D,L,W,F`;
  console.log(`📅  Fetching MLB schedule for ${dateStr}…`);

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`MLB schedule API failed: HTTP ${resp.status}`);
  }
  const data = await resp.json();

  const games = [];
  for (const dateEntry of data.dates || []) {
    for (const game of dateEntry.games || []) {
      games.push({
        gamePk: game.gamePk,
        homeTeam: game.teams?.home?.team?.name || "",
        awayTeam: game.teams?.away?.team?.name || "",
        gameDate: dateStr,
        startTime: game.gameDate, // ISO 8601 UTC
      });
    }
  }
  console.log(`  Found ${games.length} MLB game(s)`);
  return games;
}

// ──────────────────────────────────────────────────────────────
// FETCH THEODDSAPI F5 ML ODDS
// ──────────────────────────────────────────────────────────────

/**
 * h2h_1st_5_innings is a "Game Period Market" (additional market).
 * TheOddsAPI requires these to be fetched per-event via
 *   /v4/sports/{sport}/events/{eventId}/odds
 * NOT the bulk /v4/sports/{sport}/odds endpoint.
 *
 * Strategy:
 *   1) Fetch all live/upcoming event IDs from /v4/sports/{sport}/events
 *   2) For each event, fetch F5 odds via /v4/sports/{sport}/events/{id}/odds
 */

async function fetchEventList(apiKey) {
  const url =
    `${ODDS_API_BASE}/sports/${SPORT}/events` +
    `?apiKey=${apiKey}`;

  console.log(`📋  Fetching MLB event list from TheOddsAPI…`);
  const resp = await fetch(url);

  const remaining = resp.headers.get("x-requests-remaining");
  const used      = resp.headers.get("x-requests-used");
  const last      = resp.headers.get("x-requests-last");
  console.log(`  Quota: used=${used}, remaining=${remaining}, cost=${last}`);

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`TheOddsAPI events error: HTTP ${resp.status} — ${body}`);
  }

  const events = await resp.json();
  if (!Array.isArray(events)) {
    throw new Error(`TheOddsAPI events returned non-array: ${typeof events}`);
  }
  console.log(`  Found ${events.length} MLB event(s)`);
  return events;
}

async function fetchF5OddsPerEvent(apiKey, eventId) {
  const url =
    `${ODDS_API_BASE}/sports/${SPORT}/events/${eventId}/odds` +
    `?apiKey=${apiKey}` +
    `&regions=${REGION}` +
    `&markets=${MARKET}` +
    `&oddsFormat=american`;

  const resp = await fetch(url);

  if (resp.status === 404) {
    // Event may have already started / no odds available
    return null;
  }
  if (resp.status === 429) {
    throw new Error("TheOddsAPI rate limited (429). Try again later.");
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.warn(`  ⚠️  Event ${eventId}: HTTP ${resp.status} — ${body}`);
    return null;
  }

  return resp.json();
}

async function fetchF5Odds(apiKey) {
  // 1) Get all events
  const eventList = await fetchEventList(apiKey);
  if (eventList.length === 0) return [];

  // 2) Fetch F5 odds per event (sequentially to be kind to rate limits)
  console.log(`🎰  Fetching F5 ML odds per event (${eventList.length} events)…`);
  const eventsWithOdds = [];
  let oddsFound = 0;
  let oddsEmpty = 0;

  for (const evt of eventList) {
    const eventOdds = await fetchF5OddsPerEvent(apiKey, evt.id);
    if (eventOdds && eventOdds.bookmakers && eventOdds.bookmakers.length > 0) {
      // Check if any bookmaker actually has the F5 market
      const hasF5 = eventOdds.bookmakers.some(bk =>
        bk.markets?.some(m => m.key === MARKET)
      );
      if (hasF5) {
        eventsWithOdds.push(eventOdds);
        oddsFound++;
      } else {
        oddsEmpty++;
      }
    } else {
      oddsEmpty++;
    }
  }

  console.log(`  F5 odds: ${oddsFound} events with odds, ${oddsEmpty} without`);
  return eventsWithOdds;
}

// ──────────────────────────────────────────────────────────────
// RESOLVE ODDS EVENTS → MLB game_pk
// ──────────────────────────────────────────────────────────────

/**
 * Match TheOddsAPI events to MLB schedule by team names.
 * Returns a Map<oddsEventId, gamePk>.
 */
function resolveGamePks(oddsEvents, mlbGames) {
  // Build lookup: normalizedHome + normalizedAway → gamePk
  const lookup = new Map();
  for (const game of mlbGames) {
    const key = normalizeTeam(game.homeTeam) + "|" + normalizeTeam(game.awayTeam);
    lookup.set(key, game);
  }

  const resolved = new Map();
  let matched = 0;
  let unmatched = 0;

  for (const event of oddsEvents) {
    const homeNorm = normalizeTeam(event.home_team || "");
    const awayNorm = normalizeTeam(event.away_team || "");
    const key = homeNorm + "|" + awayNorm;

    const mlbGame = lookup.get(key);
    if (mlbGame) {
      resolved.set(event.id, mlbGame);
      matched++;
    } else {
      console.warn(
        `  ⚠️  Unmatched odds event: ${event.home_team} vs ${event.away_team} ` +
        `(normalized: ${homeNorm} | ${awayNorm})`
      );
      unmatched++;
    }
  }

  console.log(`  Resolved: ${matched} matched, ${unmatched} unmatched`);
  return resolved;
}

// ──────────────────────────────────────────────────────────────
// BUILD CONSENSUS ODDS
// ──────────────────────────────────────────────────────────────

/**
 * For each game/side, collect American odds from all books,
 * compute median (consensus), and produce 2 rows per game
 * (home + away) matching the schema expected by generate_f5_ml.py.
 */
function buildConsensus(oddsEvents, gameMap, dateStr, snapshotUtc) {
  const records = [];

  for (const event of oddsEvents) {
    const mlbGame = gameMap.get(event.id);
    if (!mlbGame) continue; // skip unmatched

    const gamePk   = mlbGame.gamePk;
    const homeTeam = mlbGame.homeTeam;
    const awayTeam = mlbGame.awayTeam;

    // Collect all American odds per side across all sportsbooks
    const sideOdds = { home: [], away: [] };

    for (const bk of event.bookmakers || []) {
      for (const mkt of bk.markets || []) {
        if (mkt.key !== MARKET) continue;
        for (const outcome of mkt.outcomes || []) {
          const price = outcome.price; // American odds
          if (typeof price !== "number" || !isFinite(price)) continue;

          // Determine side by matching outcome name to home/away team
          const outcomeName = normalizeTeam(outcome.name || "");
          const homeNorm    = normalizeTeam(event.home_team || "");
          const awayNorm    = normalizeTeam(event.away_team || "");

          if (outcomeName === homeNorm) {
            sideOdds.home.push(price);
          } else if (outcomeName === awayNorm) {
            sideOdds.away.push(price);
          }
        }
      }
    }

    // Build a record for each side that has at least 1 book
    for (const side of ["home", "away"]) {
      const prices = sideOdds[side];
      if (prices.length === 0) continue;

      const medAmerican = median(prices);
      const medDecimal  = americanToDecimal(medAmerican);
      const impRaw      = impliedProb(medDecimal);

      // No-vig implied prob: normalize home + away raw probs to sum to 1
      // (calculated after both sides are built — patched below)

      records.push({
        game_pk:            gamePk,
        game_date:          dateStr,
        bet_side:           side,
        team_home:          homeTeam,
        team_away:          awayTeam,
        odds_decimal:       Math.round(medDecimal * 10000) / 10000,
        odds_american:      Math.round(medAmerican),
        implied_prob_raw:   Math.round(impRaw * 10000) / 10000,
        implied_prob_novig: 0, // patched below
        books_available:    prices.length,
        median_american:    Math.round(medAmerican),
        snapshot_utc:       snapshotUtc,
      });
    }
  }

  // Patch no-vig implied probs
  // Group records by game_pk, then normalize home+away raw probs to sum 1.0
  const byGame = {};
  for (const r of records) {
    (byGame[r.game_pk] = byGame[r.game_pk] || []).push(r);
  }
  for (const pk of Object.keys(byGame)) {
    const rows = byGame[pk];
    const homeRow = rows.find((r) => r.bet_side === "home");
    const awayRow = rows.find((r) => r.bet_side === "away");
    if (homeRow && awayRow) {
      const totalRaw = homeRow.implied_prob_raw + awayRow.implied_prob_raw;
      if (totalRaw > 0) {
        homeRow.implied_prob_novig = Math.round((homeRow.implied_prob_raw / totalRaw) * 10000) / 10000;
        awayRow.implied_prob_novig = Math.round((awayRow.implied_prob_raw / totalRaw) * 10000) / 10000;
      }
    }
  }

  return records;
}

// ──────────────────────────────────────────────────────────────
// UPLOAD TO BLOBS
// ──────────────────────────────────────────────────────────────

async function uploadToBlobs(dateStr, records) {
  const fs   = await import("fs");
  const path = await import("path");

  // ALWAYS write a local file so the generate step can read it directly
  // (same GitHub Actions job → shared filesystem, no Blobs round-trip)
  const localDir = "tmp/f5_ml_cache";
  fs.mkdirSync(localDir, { recursive: true });
  const localPath = path.join(localDir, `live_odds_${dateStr}.json`);
  fs.writeFileSync(localPath, JSON.stringify(records, null, 2));
  console.log(`  📄  Wrote ${records.length} records → ${localPath}`);

  // Also upload to Blobs (for future reference / direct API access)
  const siteID =
    process.env.NETLIFY_SITE_ID ||
    process.env.NETLIFY_BLOBS_SITE_ID ||
    process.env.SITE_ID;
  const token =
    process.env.NETLIFY_AUTH_TOKEN ||
    process.env.NETLIFY_TOKEN ||
    process.env.NETLIFY_BLOBS_TOKEN;

  if (!siteID || !token) {
    console.warn("⚠️  No Netlify Blobs credentials — skipping Blobs upload");
    return;
  }

  try {
    const store = getStore({ name: BLOBS_STORE, siteID, token });
    const key   = `mlb/f5_ml/odds/live/${dateStr}.json`;
    const body  = JSON.stringify(records);

    await store.set(key, body, {
      contentType: "application/json",
      metadata: {
        date:       dateStr,
        records:    String(records.length),
        games:      String(new Set(records.map((r) => r.game_pk)).size),
        fetched_at: new Date().toISOString(),
      },
    });
    console.log(`  ☁️  Uploaded ${records.length} records → Blobs: ${key}`);
  } catch (e) {
    console.warn(`  ⚠️  Blobs upload failed (non-fatal): ${e.message || e}`);
  }
}

// ──────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dateIdx = args.indexOf("--date");
  const dateStr = dateIdx >= 0 ? args[dateIdx + 1] : null;

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    console.error("Usage: fetch_odds_today.mjs --date YYYY-MM-DD");
    process.exit(1);
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.error("❌  Missing ODDS_API_KEY environment variable");
    process.exit(1);
  }

  const snapshotUtc = new Date().toISOString();

  // 1. Fetch both data sources in parallel
  const [mlbGames, oddsEvents] = await Promise.all([
    fetchMLBSchedule(dateStr),
    fetchF5Odds(apiKey),
  ]);

  if (oddsEvents.length === 0) {
    console.log("⚠️  No F5 odds available from TheOddsAPI — writing empty file");
    await uploadToBlobs(dateStr, []);
    return;
  }

  if (mlbGames.length === 0) {
    console.log("⚠️  No MLB games on schedule — writing empty file");
    await uploadToBlobs(dateStr, []);
    return;
  }

  // 2. Resolve TheOddsAPI events → MLB game_pk
  const gameMap = resolveGamePks(oddsEvents, mlbGames);

  // 3. Build consensus odds
  const records = buildConsensus(oddsEvents, gameMap, dateStr, snapshotUtc);

  console.log(
    `\n📊  Consensus: ${records.length} records ` +
    `(${new Set(records.map((r) => r.game_pk)).size} games, ` +
    `books range: ${Math.min(...records.map((r) => r.books_available))}–` +
    `${Math.max(...records.map((r) => r.books_available))})`
  );

  // 4. Upload
  await uploadToBlobs(dateStr, records);

  console.log(`\n✅  fetch_odds_today complete for ${dateStr}`);
}

main().catch((e) => {
  console.error("❌  fetch_odds_today error:", e);
  process.exit(1);
});
