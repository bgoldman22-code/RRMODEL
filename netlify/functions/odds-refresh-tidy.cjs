// netlify/functions/odds-refresh-tidy.cjs
function normalizeAllOffers(list) {
  const bad = new Set(["over","under","yes","no","o","u"]);
  return list.map(o => ({
    ...o,
    team: o.team && bad.has(String(o.team).toLowerCase()) ? null : o.team,
    player: o.player ? String(o.player).trim() : o.player
  }));
}
module.exports = { normalizeAllOffers };
