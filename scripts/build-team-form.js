#!/usr/bin/env node
'use strict';
/**
 * scripts/build-team-form.js
 *
 * Build a multi-season team form JSON from NFLVerse play-by-play CSV.gz files.
 * - Streams CSVs for seasons you request (default: last 3 full seasons + current season YTD)
 * - Computes per-team offense/defense EPA per play (overall, pass, rush), success rates (pass/rush),
 *   and recency-decayed EPA (by game chronology).
 *
 * Usage:
 *   node scripts/build-team-form.js
 *   node scripts/build-team-form.js --seasons=2022,2023,2024,2025
 *   node scripts/build-team-form.js --last=3   # last 3 full seasons + current YTD
 *   node scripts/build-team-form.js --decay=0.7 --recentGames=6
 *
 * Output:
 *   public/nflverse-team-form.json
 */

const { createGunzip } = require('zlib');
const { parse } = require('csv-parse');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ---------------- Config & CLI ----------------
const argv = Object.fromEntries(process.argv.slice(2).map(kv => {
  const [k, v] = kv.split('=');
  return [k.replace(/^--/, ''), v === undefined ? true : v];
}));

const DECAY = parseFloat(argv.decay || '0.7');         // exponential weight per game back
const RECENT_GAMES = parseInt(argv.recentGames || '6', 10);
const OUTFILE = path.resolve(process.cwd(), 'public/nflverse-team-form.json');

// Determine seasons: default = last 3 completed seasons + current season (best-effort YTD)
function computeSeasons() {
  if (argv.seasons) {
    return argv.seasons.split(',').map(s => s.trim()).filter(Boolean);
  }
  const now = new Date();
  const year = now.getUTCFullYear();
  // NFL seasons cross years, but pbp files use season label as the start year
  // Heuristic: by September–February, current season = current year; by Mar–Aug, still previous season in offseason but pbp will exist per file naming.
  const currentSeason = year;
  return [currentSeason - 3, currentSeason - 2, currentSeason - 1, currentSeason].map(String);
}

const SEASONS = computeSeasons();

// NFLVerse release URL pattern
function pbpUrlFor(season) {
  return `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
}

// ---------------- Helpers ----------------
function fetchStream(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.get(url, { headers: { 'User-Agent': 'team-form-builder/1.0' } }, res => {
      // follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchStream(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`));
      }
      resolve(res);
    });
    req.on('error', reject);
  });
}

function addPlay(acc, teamKey, weekKey, play) {
  if (!acc[teamKey]) {
    acc[teamKey] = { games: new Map(), offense: { all:{sum:0,cnt:0}, pass:{sum:0,cnt:0, succ:0}, rush:{sum:0,cnt:0, succ:0} },
                     defense: { all:{sum:0,cnt:0}, pass:{sum:0,cnt:0, succ:0}, rush:{sum:0,cnt:0, succ:0} } };
  }
  // Store by game id for chronology/decay later
  const gk = `${play.season}:${play.game_id}`;
  if (!acc[teamKey].games.has(gk)) acc[teamKey].games.set(gk, { season: play.season, game_id: play.game_id, plays: [] , start: play.game_date || null});
  acc[teamKey].games.get(gk).plays.push(play);

  // rolling sums
  const isPass = play.play_type === 'pass';
  const isRush = play.play_type === 'run';
  const epa = play.epa;

  if (play.role === 'off') {
    acc[teamKey].offense.all.sum += epa; acc[teamKey].offense.all.cnt++;
    if (isPass) { acc[teamKey].offense.pass.sum += epa; acc[teamKey].offense.pass.cnt++; if (epa > 0) acc[teamKey].offense.pass.succ++; }
    if (isRush) { acc[teamKey].offense.rush.sum += epa; acc[teamKey].offense.rush.cnt++; if (epa > 0) acc[teamKey].offense.rush.succ++; }
  } else if (play.role === 'def') {
    // defense "allowed": positive when offense gained EPA; negative is good defense
    acc[teamKey].defense.all.sum += epa; acc[teamKey].defense.all.cnt++;
    if (isPass) { acc[teamKey].defense.pass.sum += epa; acc[teamKey].defense.pass.cnt++; if (epa > 0) acc[teamKey].defense.pass.succ++; }
    if (isRush) { acc[teamKey].defense.rush.sum += epa; acc[teamKey].defense.rush.cnt++; if (epa > 0) acc[teamKey].defense.rush.succ++; }
  }
}

function finalizeTeam(teamRec) {
  const out = {
    offense: {
      epa_per_play: teamRec.offense.all.cnt ? teamRec.offense.all.sum / teamRec.offense.all.cnt : 0,
      pass_epa: teamRec.offense.pass.cnt ? teamRec.offense.pass.sum / teamRec.offense.pass.cnt : 0,
      rush_epa: teamRec.offense.rush.cnt ? teamRec.offense.rush.sum / teamRec.offense.rush.cnt : 0,
      success_rate_pass: teamRec.offense.pass.cnt ? teamRec.offense.pass.succ / teamRec.offense.pass.cnt : 0,
      success_rate_rush: teamRec.offense.rush.cnt ? teamRec.offense.rush.succ / teamRec.offense.rush.cnt : 0,
    },
    defense: {
      epa_allowed_per_play: teamRec.defense.all.cnt ? teamRec.defense.all.sum / teamRec.defense.all.cnt : 0,
      pass_epa_allowed: teamRec.defense.pass.cnt ? teamRec.defense.pass.sum / teamRec.defense.pass.cnt : 0,
      rush_epa_allowed: teamRec.defense.rush.cnt ? teamRec.defense.rush.sum / teamRec.defense.rush.cnt : 0,
      success_rate_pass_allowed: teamRec.defense.pass.cnt ? teamRec.defense.pass.succ / teamRec.defense.pass.cnt : 0,
      success_rate_rush_allowed: teamRec.defense.rush.cnt ? teamRec.defense.rush.succ / teamRec.defense.rush.cnt : 0,
    },
    decayed_data: {
      off_epa_decayed: 0,
      def_epa_decayed: 0,
      off_pass_epa_decayed: 0,
      off_rush_epa_decayed: 0,
      def_pass_epa_decayed: 0,
      def_rush_epa_decayed: 0
    }
  };

  // Build game-level aggregates in chronological order for decay
  const games = Array.from(teamRec.games.values())
    .map(g => {
      const off = { sum:0,cnt:0, pass:{sum:0,cnt:0}, rush:{sum:0,cnt:0} };
      const def = { sum:0,cnt:0, pass:{sum:0,cnt:0}, rush:{sum:0,cnt:0} };
      for (const p of g.plays) {
        if (p.role === 'off') {
          off.sum += p.epa; off.cnt++;
          if (p.play_type === 'pass') { off.pass.sum += p.epa; off.pass.cnt++; }
          if (p.play_type === 'run')  { off.rush.sum += p.epa; off.rush.cnt++; }
        } else {
          def.sum += p.epa; def.cnt++;
          if (p.play_type === 'pass') { def.pass.sum += p.epa; def.pass.cnt++; }
          if (p.play_type === 'run')  { def.rush.sum += p.epa; def.rush.cnt++; }
        }
      }
      const offEpa = off.cnt ? off.sum/off.cnt : 0;
      const defEpa = def.cnt ? def.sum/def.cnt : 0;
      const offPass = off.pass.cnt ? off.pass.sum/off.pass.cnt : 0;
      const offRush = off.rush.cnt ? off.rush.sum/off.rush.cnt : 0;
      const defPass = def.pass.cnt ? def.pass.sum/def.pass.cnt : 0;
      const defRush = def.rush.cnt ? def.rush.sum/def.rush.cnt : 0;
      return { season: g.season, game_id: g.game_id, start: g.start, offEpa, defEpa, offPass, offRush, defPass, defRush };
    })
    .sort((a,b) => {
      // sort by season then by game id (fallback); missing dates go last
      if (a.start && b.start && a.start !== 'NA' && b.start !== 'NA') {
        return (new Date(a.start) - new Date(b.start));
      }
      if (a.season !== b.season) return a.season - b.season;
      return (''+a.game_id).localeCompare(''+b.game_id);
    });

  // Take last RECENT_GAMES and apply exponential decay (most recent weight=1.0, back *= DECAY)
  const recent = games.slice(-RECENT_GAMES).reverse();
  let wsum=0, off=0, def=0, offP=0, offR=0, defP=0, defR=0, w=1;
  for (const g of recent) {
    wsum += w;
    off += g.offEpa * w;
    def += g.defEpa * w;
    offP += g.offPass * w;
    offR += g.offRush * w;
    defP += g.defPass * w;
    defR += g.defRush * w;
    w *= DECAY;
  }
  if (wsum > 0) {
    out.decayed_data.off_epa_decayed = off / wsum;
    out.decayed_data.def_epa_decayed = def / wsum;
    out.decayed_data.off_pass_epa_decayed = offP / wsum;
    out.decayed_data.off_rush_epa_decayed = offR / wsum;
    out.decayed_data.def_pass_epa_decayed = defP / wsum;
    out.decayed_data.def_rush_epa_decayed = defR / wsum;
  }

  return out;
}

// ---------------- Main ----------------
(async () => {
  console.log(`[team-form] Seasons: ${SEASONS.join(', ')}`);
  const teams = {}; // team abbr -> accumulators

  for (const season of SEASONS) {
    const url = pbpUrlFor(season);
    console.log(`[team-form] Fetching ${url}`);
    try {
      const stream = await fetchStream(url);
      await new Promise((resolve, reject) => {
        const gunzip = createGunzip();
        const parser = parse({ columns: true, relax_column_count: true });
        stream
          .pipe(gunzip)
          .pipe(parser)
          .on('data', (row) => {
            try {
              const play_type = (row.play_type || '').toLowerCase();
              if (!play_type || (play_type !== 'pass' && play_type !== 'run' && play_type !== 'no_play')) return;
              // We restrict EPA to pass/run tags; ignore "no_play" for EPA sums (keeps alignment).
              const epaStr = row.epa;
              if (epaStr === undefined || epaStr === null || epaStr === '' || epaStr === 'NA') return;
              const epa = parseFloat(epaStr);
              if (!isFinite(epa)) return;

              const posteam = row.posteam || row.pos_team || row.offense || '';
              const defteam = row.defteam || row.defense || '';
              if (!posteam || !defteam) return;

              // Sometimes week is blank in preseason; we don't actually need it.
              const game_id = row.game_id || row.gameid || row.gameId || `${row.season || season}_${row.old_game_id || ''}`;
              const game_date = row.game_date || row.game_date_fixed || row.game_date_y || row.game_date_x || null;

              // Offense perspective
              addPlay(teams, posteam, row.week, { season: Number(row.season || season), game_id, game_date, play_type, epa, role: 'off' });
              // Defense perspective (allowed)
              addPlay(teams, defteam, row.week, { season: Number(row.season || season), game_id, game_date, play_type, epa, role: 'def' });
            } catch {}
          })
          .on('end', resolve)
          .on('error', reject);
      });
    } catch (e) {
      console.error(`[team-form] Failed to fetch/parse ${season}: ${e.message}`);
    }
  }

  // Finalize
  const team_data = {};
  for (const [abbr, rec] of Object.entries(teams)) {
    team_data[abbr] = finalizeTeam(rec);
    // Keep a simple "form" field for legacy (scaled offensive minus defensive EPA)
    team_data[abbr].form = (team_data[abbr].decayed_data.off_epa_decayed - team_data[abbr].decayed_data.def_epa_decayed);
  }

  const output = {
    updated: new Date().toISOString(),
    seasons: SEASONS.map(Number),
    recent_games_used: RECENT_GAMES,
    decay: DECAY,
    team_data
  };

  fs.mkdirSync(path.dirname(OUTFILE), { recursive: true });
  fs.writeFileSync(OUTFILE, JSON.stringify(output, null, 2));
  console.log(`[team-form] Wrote ${OUTFILE}`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
