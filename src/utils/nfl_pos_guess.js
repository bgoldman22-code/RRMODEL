// src/utils/nfl_pos_guess.js
// Tiny heuristic position map for well-known players. Safe to extend.
export const POS_GUESS = {
  // RBs
  "christian mccaffrey":"RB", "derrick henry":"RB", "bijan robinson":"RB", "saquon barkley":"RB", "jonathan taylor":"RB",
  "nick chubb":"RB", "josh jacobs":"RB", "breece hall":"RB", "jahmyr gibbs":"RB", "alvin kamara":"RB",
  // WR1
  "justin jefferson":"WR1", "ja'marr chase":"WR1", "tyreek hill":"WR1", "aj brown":"WR1", "amon-ra st. brown":"WR1", "cd lamb":"WR1",
  "garrett wilson":"WR1", "stephon diggs":"WR1", "davante adams":"WR1", "mike evans":"WR1",
  // WR2/3
  "tee higgins":"WR2", "jaylen waddle":"WR2", "devonta smith":"WR2", "brandin cooks":"WR2",
  // TE1
  "travis kelce":"TE1", "mark andrews":"TE1", "sam laporta":"TE1", "tj hockenson":"TE1", "george kittle":"TE1", "david njoku":"TE1",
};
export function guessPosition(name){
  if(!name) return null;
  const k = String(name).toLowerCase().trim();
  return POS_GUESS[k] || null;
}
