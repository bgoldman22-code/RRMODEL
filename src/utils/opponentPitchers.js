// src/utils/opponentPitchers.js
// Build a map of gameKey -> { away:'SEA', home:'PHI', awayProbable:{name,hand}, homeProbable:{name,hand} }
export function makeProbablesMap(scheduleJson) {
  const map = {};
  try {
    const events = scheduleJson?.events || scheduleJson?.games || [];
    for (const ev of events) {
      const comp = ev?.competitions?.[0] || ev;
      const comps = comp?.competitors || ev?.competitors || [];
      const home = comps.find((c) => (c.homeAway === "home" || c.isHome));
      const away = comps.find((c) => (c.homeAway === "away" || c.isAway));
      const homeAbbr = (home?.team?.abbreviation || home?.abbr || "").toUpperCase();
      const awayAbbr = (away?.team?.abbreviation || away?.abbr || "").toUpperCase();

      // Try a bunch of likely paths for probables
      const grabName = (obj) =>
        obj?.displayName || obj?.fullName || obj?.shortName || obj?.name || null;
      const grabHand = (obj) =>
        (obj?.hand?.abbreviation || obj?.hand || null);

      const homeProbable =
        comp?.homeProbablePitcher ||
        home?.probables?.pitcher ||
        home?.probables?.[0]?.athlete ||
        null;
      const awayProbable =
        comp?.awayProbablePitcher ||
        away?.probables?.pitcher ||
        away?.probables?.[0]?.athlete ||
        null;

      if (homeAbbr && awayAbbr) {
        const key = `${awayAbbr}@${homeAbbr}`;
        map[key] = {
          away: awayAbbr,
          home: homeAbbr,
          awayProbable: homeProbable || awayProbable ? { name: grabName(awayProbable), hand: grabHand(awayProbable) } : null,
          homeProbable: homeProbable || awayProbable ? { name: grabName(homeProbable), hand: grabHand(homeProbable) } : null,
        };
      }
    }
  } catch (e) {
    console.warn("makeProbablesMap error", e);
  }
  return map;
}

// Resolve the opponent pitcher for a candidate row using the game key and batter team
export function resolveOpponentPitcher(row, probablesMap) {
  try {
    const game = (row.game || row.Game || "").toUpperCase();
    if (!game.includes("@")) return null;
    const [away, home] = game.split("@").map((s) => s.trim());
    const p = probablesMap[game];
    if (!p) return null;
    const team = (row.team || row.team_abbr || row.TEAM || "").toUpperCase();
    if (!team) return null;
    // If batter is away, opponent is home probable; vice-versa
    if (team === away) {
      return p.homeProbable;
    } else if (team === home) {
      return p.awayProbable;
    }
    // If we can't tell, return null
    return null;
  } catch (e) {
    console.warn("resolveOpponentPitcher error", e);
    return null;
  }
}
