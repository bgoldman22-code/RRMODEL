
// netlify/functions/lib/teamMaps.mjs
export const TEAM_ABBR = {
  ARI:'ARI', ATL:'ATL', BAL:'BAL', BUF:'BUF', CAR:'CAR', CHI:'CHI', CIN:'CIN', CLE:'CLE',
  DAL:'DAL', DEN:'DEN', DET:'DET', GB:'GB', HOU:'HOU', IND:'IND', JAX:'JAX', JAC:'JAX',
  KC:'KC', LAC:'LAC', LAR:'LAR', LV:'LV', MIA:'MIA', MIN:'MIN', NE:'NE', NO:'NO',
  NYG:'NYG', NYJ:'NYJ', PHI:'PHI', PIT:'PIT', SEA:'SEA', SF:'SF', TB:'TB', TEN:'TEN', WAS:'WAS', WSH:'WAS'
};

export function normalizeTeam(raw){
  if (!raw) return null;
  const t = String(raw).trim().toUpperCase();
  return TEAM_ABBR[t] || null;
}

export function gameKey(away, home){ return `${away}@${home}`.toUpperCase(); }
