// src/utils/why_nfl.js
export function buildWhyNFL(p){
  p = p||{}; const parts = [];
  parts.push(`${p.player||'Player'} ${p.gameCode?('• '+p.gameCode):''}`.trim());
  if(p.position) parts.push(p.position);
  if(p.teamImpliedPts) parts.push(`${Math.round(p.teamImpliedPts)} team pts`);
  if(p.usage?.goalLineRushShare) parts.push(`GL ${Math.round(p.usage.goalLineRushShare*100)}%`);
  if(p.usage?.redZoneTargetShare) parts.push(`RZ tgt ${Math.round(p.usage.redZoneTargetShare*100)}%`);
  if(p.usage?.rushShare && (p.position||'').startsWith('RB')) parts.push(`rush ${Math.round(p.usage.rushShare*100)}%`);
  if(p.usage?.targetShare && /WR|TE/.test(p.position||'')) parts.push(`tgt ${Math.round(p.usage.targetShare*100)}%`);
  if(p.defense?.redZoneTdPctAllowed) parts.push(`opp RZ TD ${Math.round(p.defense.redZoneTdPctAllowed*100)}%`);
  return parts.join(' • ');
}
