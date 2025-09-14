// PARTIAL FILE: only the corrected mapping block is included for clarity.
// Merge this snippet if you have local changes nearby.

// --- BEGIN FIX: duplicate key "NYG" ---
const TEAM_ABBR = {
  "ARI":"ARI","ATL":"ATL","BAL":"BAL","BUF":"BUF","CAR":"CAR","CHI":"CHI",
  "CIN":"CIN","CLE":"CLE","DAL":"DAL","DEN":"DEN","DET":"DET","GB":"GB",
  "HOU":"HOU","IND":"IND","JAX":"JAX","KC":"KC","LAC":"LAC","LAR":"LAR",
  "LV":"LV","MIA":"MIA","MIN":"MIN","NE":"NE","NO":"NO","NYG":"NYG",
  "NYJ":"NYJ","PHI":"PHI","PIT":"PIT","SEA":"SEA","SF":"SF","TB":"TB",
  "TEN":"TEN","WAS":"WAS"
};
// --- END FIX ---

// export so the rest of the file continues to work
module.exports = { TEAM_ABBR };
