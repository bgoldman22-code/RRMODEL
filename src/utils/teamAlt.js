// src/utils/teamAlt.js
// Utility for finding a team alternate HR candidate based on pitcher weaknesses

export function getTeamAlt(hitterPool, pitcherWeakness) {
  if (!pitcherWeakness || !pitcherWeakness.pitch) return null;

  const candidates = hitterPool.filter(h => h.pitchProfile && h.pitchProfile[pitcherWeakness.pitch]);

  // Rank by combined pull%, barrel%, and HR rate
  candidates.sort((a, b) =>
    (b.pullPct * b.barrelPct * b.hrRate) -
    (a.pullPct * a.barrelPct * a.hrRate)
  );

  return candidates.length > 0 ? candidates[0] : null;
}
