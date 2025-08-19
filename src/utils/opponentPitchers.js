
/**
 * opponentPitchers.js
 * Build a mapping from game key "AWAY@HOME" to { homeProbable, awayProbable }
 * and provide a helper to resolve the opponent pitcher for a given team.
 */

export function keyForGame(game) {
  // Expect shape { away, home } where each has { teamAbbr || team || name }
  const away = (game?.away?.abbr || game?.away?.code || game?.away?.team || game?.away?.name || "").toUpperCase();
  const home = (game?.home?.abbr || game?.home?.code || game?.home?.team || game?.home?.name || "").toUpperCase();
  if (!away || !home) return null;
  return `${away}@${home}`;
}

export function buildProbablesMap(schedule) {
  const map = new Map();
  if (!Array.isArray(schedule)) return map;
  for (const g of schedule) {
    const k = keyForGame(g);
    if (!k) continue;
    const homeProbable = g?.home?.probable || g?.home?.pitcher || g?.home?.probablePitcher || null;
    const awayProbable = g?.away?.probable || g?.away?.pitcher || g?.away?.probablePitcher || null;
    map.set(k, { homeProbable, awayProbable });
  }
  return map;
}

export function resolveOpponentPitcher(teamAbbr, gameKey, probMap) {
  if (!teamAbbr || !gameKey || !probMap) return null;
  const entry = probMap.get(gameKey);
  if (!entry) return null;
  const [away, home] = gameKey.split("@");
  const team = String(teamAbbr || "").toUpperCase();
  if (team === away) return entry.homeProbable || null;
  if (team === home) return entry.awayProbable || null;
  return null;
}
