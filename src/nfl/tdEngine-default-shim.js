// src/nfl/tdEngine-default-shim.js
// Simple shim so NFL.jsx has a default export
export default async function tdEngineShim() {
  // return a placeholder model-only candidate if odds not available
  return [{
    player: "Placeholder RB1",
    team: "DAL",
    game: "DAL @ PHI",
    modelPct: "10.2%",
    odds: null,
    ev: null,
    why: "Fallback model-only output."
  }];
}
