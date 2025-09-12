#!/usr/bin/env node
/**
 * scripts/build-team-form.js
 *
 * Generates /public/nflverse-team-form.json with recency-weighted team EPA metrics.
 * - Uses global fetch (Node 18+) and zlib to stream-decompress the NFLVerse pbp CSV (.csv.gz).
 * - Computes offense/defense EPA per play (overall + pass + rush) and success rates.
 * - Applies exponential decay over the N most-recent weeks the TEAM actually played.
 *
 * Usage:
 *   node scripts/build-team-form.js [--season=2024] [--weeks=6] [--pbpUrl=<override>]
 */
const fs = require("fs");
const path = require("path");
const { createGunzip } = require("zlib");
const { parse } = require("csv-parse");
const { pipeline } = require("stream");
const { argv } = require("process");

const OUT_FILE = path.join(process.cwd(), "public", "nflverse-team-form.json");

const opts = Object.fromEntries(
  argv.slice(2).map((a) => {
    const [k, v=""] = a.replace(/^--/, "").split("=");
    return [k, v === "" ? true : v];
  })
);

const season = Number(opts.season || process.env.NFL_SEASON || 2024);
const lookbackWeeks = Number(opts.weeks || 6);
const defaultPbpUrl = `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
const PBP_URL = opts.pbpUrl || process.env.NFLVERSE_PBP_CSV_GZ || defaultPbpUrl;

function asNum(x) {
  if (x === null || x === undefined) return NaN;
  if (x === "NA") return NaN;
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

// Trackers
const teamWeeks = new Map(); // team -> Set(weeks played)
const agg = {}; // team -> metrics accumulator

function ensureTeam(team) {
  if (!team) return;
  if (!agg[team]) {
    agg[team] = {
      // Totals for overall/pass/rush, offense & defense
      off: { epa: 0, plays: 0, succ: 0, pass: { epa: 0, plays: 0, succ: 0 }, rush: { epa: 0, plays: 0, succ: 0 } },
      def: { epaAllowed: 0, plays: 0, succ: 0, pass: { epaAllowed: 0, plays: 0, succ: 0 }, rush: { epaAllowed: 0, plays: 0, succ: 0 } },
      // Per-week buckets for decay
      weeks: {} // week -> { off: {...}, def: {...} } (same shape as above but totals only)
    };
  }
  if (!teamWeeks.has(team)) teamWeeks.set(team, new Set());
}

function addOffense(team, week, playType, epa, success) {
  ensureTeam(team);
  teamWeeks.get(team).add(week);
  const t = agg[team];
  t.off.epa += epa;
  t.off.plays += 1;
  if (success) t.off.succ += 1;

  const bucket = playType === "pass" ? t.off.pass : playType === "run" ? t.off.rush : null;
  if (bucket) {
    bucket.epa += epa;
    bucket.plays += 1;
    if (success) bucket.succ += 1;
  }

  // weekly
  if (!t.weeks[week]) {
    t.weeks[week] = {
      off: { epa: 0, plays: 0, succ: 0, pass: { epa: 0, plays: 0, succ: 0 }, rush: { epa: 0, plays: 0, succ: 0 } },
      def: { epaAllowed: 0, plays: 0, succ: 0, pass: { epaAllowed: 0, plays: 0, succ: 0 }, rush: { epaAllowed: 0, plays: 0, succ: 0 } }
    };
  }
  const w = t.weeks[week];
  w.off.epa += epa;
  w.off.plays += 1;
  if (success) w.off.succ += 1;
  const wb = playType === "pass" ? w.off.pass : playType === "run" ? w.off.rush : null;
  if (wb) {
    wb.epa += epa;
    wb.plays += 1;
    if (success) wb.succ += 1;
  }
}

function addDefense(team, week, playType, epa, success) {
  ensureTeam(team);
  teamWeeks.get(team).add(week);
  const t = agg[team];
  // For defense, positive opponent EPA is bad; we'll store as "allowed"
  t.def.epaAllowed += epa;
  t.def.plays += 1;
  if (success) t.def.succ += 1;

  const bucket = playType === "pass" ? t.def.pass : playType === "run" ? t.def.rush : null;
  if (bucket) {
    bucket.epaAllowed += epa;
    bucket.plays += 1;
    if (success) bucket.succ += 1;
  }

  if (!t.weeks[week]) {
    t.weeks[week] = {
      off: { epa: 0, plays: 0, succ: 0, pass: { epa: 0, plays: 0, succ: 0 }, rush: { epa: 0, plays: 0, succ: 0 } },
      def: { epaAllowed: 0, plays: 0, succ: 0, pass: { epaAllowed: 0, plays: 0, succ: 0 }, rush: { epaAllowed: 0, plays: 0, succ: 0 } }
    };
  }
  const w = t.weeks[week];
  w.def.epaAllowed += epa;
  w.def.plays += 1;
  if (success) w.def.succ += 1;
  const wb = playType === "pass" ? w.def.pass : playType === "run" ? w.def.rush : null;
  if (wb) {
    wb.epaAllowed += epa;
    wb.plays += 1;
    if (success) wb.succ += 1;
  }
}

(async () => {
  console.log(`[team-form] Fetching: ${PBP_URL}`);
  const res = await fetch(PBP_URL, { redirect: "follow" });
  if (!res.ok) {
    console.error(`[team-form] Failed to fetch PBP ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  await new Promise((resolve, reject) => {
    pipeline(
      res.body,
      createGunzip(),
      parse({ columns: true }),
      async function* (source) {
        for await (const row of source) {
          const week = Number(row.week);
          const playType = (row.play_type || "").toLowerCase();
          if (!(playType === "pass" || playType === "run")) continue;

          const epa = asNum(row.epa);
          if (!Number.isFinite(epa)) continue;

          const posteam = row.posteam || row.pos_team || row.posteam_type === "posteam" ? row.posteam : null;
          const defteam = row.defteam || row.def_team || null;
          if (!posteam || !defteam) continue;

          // success defined as epa > 0 by default
          const success = epa > 0;

          addOffense(posteam, week, playType, epa, success);
          addDefense(defteam, week, playType, epa, success);
        }
        // empty
      },
      (err) => (err ? reject(err) : resolve())
    );
  });

  // Build decayed metrics per team over the last N weeks they actually played
  const DECAY = 0.7; // weight^index (most recent index=0)
  const team_data = {};
  for (const [team, weeksSet] of teamWeeks.entries()) {
    const t = agg[team];
    const weeks = Array.from(weeksSet).map(Number).sort((a,b) => b - a);
    const recent = weeks.slice(0, lookbackWeeks);

    let wsum = 0;
    const initDec = () => ({
      off: { epa: 0, plays: 0, succ: 0, pass: { epa: 0, plays: 0, succ: 0 }, rush: { epa: 0, plays: 0, succ: 0 } },
      def: { epaAllowed: 0, plays: 0, succ: 0, pass: { epaAllowed: 0, plays: 0, succ: 0 }, rush: { epaAllowed: 0, plays: 0, succ: 0 } }
    });
    const dec = initDec();

    recent.forEach((wk, idx) => {
      const w = t.weeks[wk];
      if (!w) return;
      const weight = Math.pow(DECAY, idx);
      wsum += weight;
      // Offense
      dec.off.epa += w.off.epa * weight;
      dec.off.plays += w.off.plays * weight;
      dec.off.succ += w.off.succ * weight;
      dec.off.pass.epa += w.off.pass.epa * weight;
      dec.off.pass.plays += w.off.pass.plays * weight;
      dec.off.pass.succ += w.off.pass.succ * weight;
      dec.off.rush.epa += w.off.rush.epa * weight;
      dec.off.rush.plays += w.off.rush.plays * weight;
      dec.off.rush.succ += w.off.rush.succ * weight;
      // Defense
      dec.def.epaAllowed += w.def.epaAllowed * weight;
      dec.def.plays += w.def.plays * weight;
      dec.def.succ += w.def.succ * weight;
      dec.def.pass.epaAllowed += w.def.pass.epaAllowed * weight;
      dec.def.pass.plays += w.def.pass.plays * weight;
      dec.def.pass.succ += w.def.pass.succ * weight;
      dec.def.rush.epaAllowed += w.def.rush.epaAllowed * weight;
      dec.def.rush.plays += w.def.rush.plays * weight;
      dec.def.rush.succ += w.def.rush.succ * weight;
    });

    const safeDiv = (a,b) => (b > 0 ? a/b : 0);
    team_data[team] = {
      form: 0, // keep placeholder/back-compat
      offense: {
        epa_per_play: safeDiv(t.off.epa, t.off.plays),
        pass_epa: safeDiv(t.off.pass.epa, t.off.pass.plays),
        rush_epa: safeDiv(t.off.rush.epa, t.off.rush.plays),
        success_rate_pass: safeDiv(t.off.pass.succ, t.off.pass.plays),
        success_rate_rush: safeDiv(t.off.rush.succ, t.off.rush.plays),
      },
      defense: {
        epa_allowed_per_play: safeDiv(t.def.epaAllowed, t.def.plays),
        pass_epa_allowed: safeDiv(t.def.pass.epaAllowed, t.def.pass.plays),
        rush_epa_allowed: safeDiv(t.def.rush.epaAllowed, t.def.rush.plays),
        success_rate_pass_allowed: safeDiv(t.def.pass.succ, t.def.pass.plays),
        success_rate_rush_allowed: safeDiv(t.def.rush.succ, t.def.rush.plays),
      },
      decayed_data: {
        off_epa_decayed: wsum ? dec.off.epa / wsum / safeDiv(dec.off.plays, wsum) : 0,
        def_epa_decayed: wsum ? dec.def.epaAllowed / wsum / safeDiv(dec.def.plays, wsum) : 0,
        off_pass_epa_decayed: wsum ? dec.off.pass.epa / wsum / safeDiv(dec.off.pass.plays, wsum) : 0,
        off_rush_epa_decayed: wsum ? dec.off.rush.epa / wsum / safeDiv(dec.off.rush.plays, wsum) : 0,
        def_pass_epa_decayed: wsum ? dec.def.pass.epaAllowed / wsum / safeDiv(dec.def.pass.plays, wsum) : 0,
        def_rush_epa_decayed: wsum ? dec.def.rush.epaAllowed / wsum / safeDiv(dec.def.rush.plays, wsum) : 0,
      }
    };
  }

  const out = { updated: new Date().toISOString(), season, lookbackWeeks, team_data };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`[team-form] Wrote ${OUT_FILE}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
