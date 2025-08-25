export const ABBR_FIXES = {
  'WSH':'WAS', // ESPN uses WSH, SportsDataIO uses WAS
  'LAR':'LA',  // SportsDataIO uses LA for Rams
  'LAC':'LAC', // same
  'LV':'LV',
  'NE':'NE',
  'NO':'NO',
  'SF':'SF',
  'TB':'TB'
};

export function normalizeAbbr(abbr){
  return ABBR_FIXES[abbr] || abbr;
}