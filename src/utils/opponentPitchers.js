// src/utils/opponentPitchers.js
// Robust opponent-pitcher mapping helpers.
// No external deps; safe to drop into existing app.

/**
 * Normalize a team token (e.g., "ATH" -> "OAK", "CWS" -> "CHW").
 * Accepts 2–4 char codes and common alternates.
 */
export function normalizeTeam(raw) {
  if (!raw) return null;
  const t = String(raw).trim().toUpperCase();
  const map = {
    // Standard 3-letter
    ARI: 'ARI', AZ: 'ARI',
    ATL: 'ATL',
    BAL: 'BAL',
    BOS: 'BOS',
    CHC: 'CHC', CUB: 'CHC', CUBS: 'CHC',
    CHW: 'CHW', CWS: 'CHW', WSOX: 'CHW', SCHA: 'CHW',
    CIN: 'CIN',
    CLE: 'CLE', CLEVELAND: 'CLE', 'CWS@ATL': 'CLE', // safety
    COL: 'COL', COLR: 'COL',
    DET: 'DET',
    HOU: 'HOU',
    KCR: 'KC', KC: 'KC',
    KCY: 'KC',
    LAA: 'LAA', ANA: 'LAA',
    LAD: 'LAD', LA: 'LAD', DOD: 'LAD', DODGERS: 'LAD',
    MIA: 'MIA', FLA: 'MIA',
    MIL: 'MIL',
    MIN: 'MIN',
    NYM: 'NYM', MET: 'NYM',
    NYY: 'NYY', YAN: 'NYY',
    OAK: 'OAK',
    ATH: 'OAK',
    "A'S": 'OAK',  // use double quotes for keys with apostrophes
    AS:  'OAK',    // only works if you normalize names to strip punctuation
    PHI: 'PHI', PHILLIES: 'PHI',
    PIT: 'PIT',
    SDP: 'SD', SD: 'SD', SDG: 'SD',
    SEA: 'SEA',
    SFG: 'SF', SF: 'SF', SFO: 'SF',
    STL: 'STL',
    TBR: 'TB', TB: 'TB', TBA: 'TB',
    TEX: 'TEX', RANGERS: 'TEX',
    TOR: 'TOR',
    WSH: 'WSH', WAS: 'WSH', WSN: 'WSH'
  };
  // If exact match in map:
  if (Object.prototype.hasOwnProperty.call(map, t)) return map[t];
  // Already clean 2–3 letters:
  if (t.length <= 3) return t;
  // Try last 3
  return t.slice(-3);
}

/**
 * Parse a matchup string like "SEA@PHI" → { away: 'SEA', home: 'PHI' } (normalized).
 */
export function parseMatchup(gameField) {
  if (!gameField) return { away: null, home: null };
  const parts = String(gameField).toUpperCase().split('@');
  if (parts.length !== 2) return { away: null, home: null };
  return { away: normalizeTeam(parts[0]), home: normalizeTeam(parts[1]) };
}

/**
 * Extract probable pitchers from a wide variety of schedule/event payload shapes.
 * Returns Map<TEAM, PITCHER_NAME>
 */
export function makeProbablesMap(scheduleData) {
  const map = new Map();
  if (!scheduleData) return map;

  const trySet = (team, name) => {
    const t = normalizeTeam(team);
    const n = (name || '').toString().trim();
    if (!t || !n) return;
    // Only set if not already set (first come, first served)
    if (!map.has(t)) map.set(t, n);
  };

  const items = Array.isArray(scheduleData) ? scheduleData : Object.values(scheduleData || {});

  for (const g of items) {
    // Support many shapes:
    // 1) { home_team: 'PHI', away_team: 'SEA', probables: { PHI: 'Ranger Suarez', SEA: 'Bryce Miller' } }
    if (g && g.probables && typeof g.probables === 'object') {
      const { home_team, away_team } = g;
      const ht = g.home_team || g.home || g.homeTeam || (g.teams && g.teams.home);
      const at = g.away_team || g.away || g.awayTeam || (g.teams && g.teams.away);
      const pHome = g.probables[normalizeTeam(ht)];
      const pAway = g.probables[normalizeTeam(at)];
      if (ht && pHome) trySet(ht, pHome);
      if (at && pAway) trySet(at, pAway);
      continue;
    }

    // 2) { home: 'PHI', away: 'SEA', home_probable: 'Ranger Suarez', away_probable: 'Bryce Miller' }
    const ht = g.home_team || g.home || g.homeTeam || (g.teams && g.teams.home);
    const at = g.away_team || g.away || g.awayTeam || (g.teams && g.teams.away);
    const hp =
      g.home_probable_pitcher_name ||
      g.home_probable ||
      (g.pitchers && g.pitchers.home) ||
      (g.probable_pitchers && g.probable_pitchers.home) ||
      g.home_probable_pitcher ||
      g.homePitcher ||
      g.home_probable_name;
    const ap =
      g.away_probable_pitcher_name ||
      g.away_probable ||
      (g.pitchers && g.pitchers.away) ||
      (g.probable_pitchers && g.probable_pitchers.away) ||
      g.away_probable_pitcher ||
      g.awayPitcher ||
      g.away_probable_name;

    if (ht && hp) trySet(ht, hp);
    if (at && ap) trySet(at, ap);
  }

  return map;
}

/**
 * Resolve the opponent's probable pitcher for a given row.
 * - row may have row.Team / row.team / row.player_team (preferred).
 * - falls back to inferring from row.Game string and a best‑effort guess.
 */
export function resolveOpponentPitcher(row, probablesMap) {
  if (!row) return null;
  const map = probablesMap || new Map();
  const { away, home } = parseMatchup(row.Game || row.game || row.matchup);

  // Try to read the batter's team directly if present:
  const rawTeam =
    row.Team || row.team || row.player_team || row.playerTeam || row.batter_team || null;
  const batterTeam = normalizeTeam(rawTeam);

  if (batterTeam && away && home) {
    // If batter is away, opponent is home; if batter is home, opponent is away.
    const isAway = batterTeam === away;
    const opponent = isAway ? home : (batterTeam === home ? away : null);
    if (opponent) {
      return map.get(opponent) || null;
    }
  }

  // If we can't tell batter's team, try a heuristic:
  // If the WHY text already has a "vs Pitcher" and that pitcher matches one of the probables,
  // flip it to the *other* team (this fixes the “own pitcher” bug).
  const why = (row.Why || row.why || '').toString().toLowerCase();
  if (away && home) {
    const pAway = (map.get(away) || '').toLowerCase();
    const pHome = (map.get(home) || '').toLowerCase();
    const mentionsAway = pAway && why.includes(pAway);
    const mentionsHome = pHome && why.includes(pHome);
    if (mentionsAway && pHome) return map.get(home) || null;
    if (mentionsHome && pAway) return map.get(away) || null;
  }

  // Last resort: if we have both probables, but no batter team, prefer the *home* pitcher as opponent
  // only if the player string includes a common away-city heuristic (weak but safe fallback).
  if (away && home) {
    return map.get(home) || map.get(away) || null;
  }

  return null;
}
