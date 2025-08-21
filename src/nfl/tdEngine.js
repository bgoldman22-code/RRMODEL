// src/nfl/tdEngine.js
// Safe default export + named export. Pure JS, no TS types.
// Accepts an array of games and optional options (offers etc.).
export function tdEngine(games = [], opts = {}) {
  // Minimal placeholder that returns an empty array if no games to avoid build-time crashes.
  // Your real logic can replace this; keeping the signature stable.
  const out = (Array.isArray(games) ? games : []).flatMap(g => {
    return (g.players || []).map(p => ({
      player: p.name || p.player || "Player",
      team: p.team || g.home || "",
      game: `${g.away}@${g.home}`,
      model_td_pct: p.model_td_pct ?? 0,
      rz_path_pct: p.rz_path_pct ?? 0,
      exp_path_pct: p.exp_path_pct ?? 0,
      why: p.why || ""
    }));
  });
  return out;
}
export default tdEngine;
