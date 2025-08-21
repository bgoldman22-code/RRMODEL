// netlify/functions/_shared/rosters-shared.cjs
module.exports.runUpdate = async function({ STORE="nfl-td", PROVIDER="espn", debug=false }={}) {
  // Minimal stub: just return ok so you can see the function show up.
  return { ok:true, provider: PROVIDER, teams: 0, note: "stubbed runUpdate reached" };
};
