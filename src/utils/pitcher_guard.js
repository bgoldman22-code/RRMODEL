// src/utils/pitcher_guard.js
// Centralized sanity check to ensure `input.pitcher` is the OPPONENT pitcher.
export function ensureOpponentPitcher(input){
  if(!input) return input;
  const myTeam = input.team || input.team_abbr || input.batter_team || input.team_id;
  const pTeam = input.pitcher?.team || input.pitcher?.team_abbr || input.pitcher?.team_id;
  if (myTeam && pTeam && String(myTeam).toLowerCase() === String(pTeam).toLowerCase()){
    // Wrong mapping — this is the batter's own pitcher.
    if (input.opponent_pitcher){
      return {...input, pitcher: input.opponent_pitcher, _pitcherFix: "swapped_to_opponent"};
    } else {
      // Keep pitcher null to avoid misleading copy; model/user can still see other edges.
      const cleaned = {...input, _pitcherFix: "cleared_bad_self_pitcher"};
      delete cleaned.pitcher;
      return cleaned;
    }
  }
  return input;
}
