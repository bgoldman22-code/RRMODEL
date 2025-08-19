// netlify/functions/lib/teamMaps.mjs
// Complete NFL team normalization with common alternates and historical abbreviations.

export const TEAM_ABBR = {
  // Current standard 32
  ARI:'ARI', ATL:'ATL', BAL:'BAL', BUF:'BUF', CAR:'CAR', CHI:'CHI', CIN:'CIN', CLE:'CLE',
  DAL:'DAL', DEN:'DEN', DET:'DET', GB:'GB', HOU:'HOU', IND:'IND', JAX:'JAX', KC:'KC',
  LAC:'LAC', LAR:'LAR', LV:'LV', MIA:'MIA', MIN:'MIN', NE:'NE', NO:'NO', NYG:'NYG',
  NYJ:'NYJ', PHI:'PHI', PIT:'PIT', SEA:'SEA', SF:'SF', TB:'TB', TEN:'TEN', WAS:'WAS',

  // Alternates / legacy seen on feeds
  ARZ:'ARI', AZ:'ARI',
  JAC:'JAX',
  LA:'LAR', STL:'LAR',
  SD:'LAC',
  OAK:'LV', LVR:'LV', LVD:'LV',
  WSH:'WAS', WDC:'WAS', 'WAS':'WAS', // tolerate both WAS/WSH
  NOO:'NO',
  GBY:'GB',
  NWE:'NE', NENG:'NE',
  NOL:'NO',
  TAM:'TB', TBB:'TB',
  SFO:'SF', SFF:'SF',
  SEAHAWKS:'SEA', EAGLES:'PHI', JETS:'NYJ', GIANTS:'NYG', PATRIOTS:'NE', COWBOYS:'DAL',
  STEELERS:'PIT', PANTHERS:'CAR', FALCONS:'ATL', CHIEFS:'KC', BEARS:'CHI', VIKINGS:'MIN',
  TITANS:'TEN', TEXANS:'HOU', SAINTS:'NO', DOLPHINS:'MIA', BILLS:'BUF', BRONCOS:'DEN',
  PACKERS:'GB', LIONS:'DET', COLTS:'IND', RAVENS:'BAL', BROWNS:'CLE', BENGALS:'CIN',
  JAGUARS:'JAX', RAIDERS:'LV', RAMS:'LAR', CHARGERS:'LAC', CARDINALS:'ARI', 49ERS:'SF',
  BUCCANEERS:'TB', SEAHAWK:'SEA', SAINT:'NO'
};

export function normalizeTeam(raw){
  if (!raw) return null;
  const t = String(raw).trim().toUpperCase().replace(/[.\s]/g, '');
  return TEAM_ABBR[t] || null;
}

export function gameKey(away, home){
  const A = String(away||'').toUpperCase();
  const H = String(home||'').toUpperCase();
  return `${A}@${H}`;
}
