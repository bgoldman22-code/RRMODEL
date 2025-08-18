// src/utils/nfl_td_model.js
export function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
function invlogit(x){ return 1/(1+Math.exp(-x)); }
const PRIORS = { RB:0.42, WR1:0.35, WR2:0.28, WR3:0.18, TE1:0.23, QB:0.10, FLEX:0.20 };
export function impliedTeamTotal(total, spread, isHome){
  const t = Number(total)||0, s = Number(spread)||0;
  const favPts = t/2 + s/2; const dogPts = t - favPts;
  return isHome ? (favPts>=dogPts?favPts:dogPts) : (favPts>=dogPts?dogPts:favPts);
}
export function nflTDProbability(feat){
  const pos = String(feat.position||'FLEX').toUpperCase();
  const priorShare = PRIORS[pos] || PRIORS.FLEX;
  const teamPts = Math.max(10, Math.min(37, Number(feat.teamImpliedPts||21)));
  const teamTDs = teamPts / 7.0;
  const U = feat.usage||{}; const D = feat.defense||{}; const C = feat.context||{};
  const oppRush = clamp( 0.50*(U.goalLineRushShare||0) + 0.40*(U.rushShare||0) + 0.10*(U.snapShare||0), 0, 1);
  const oppPass = clamp( 0.40*(U.redZoneTargetShare||0) + 0.35*(U.targetShare||0) + 0.25*(U.routeParticipation||0), 0, 1);
  let roleShare = priorShare;
  if(pos.startsWith('RB')) roleShare = clamp(0.60*oppRush + 0.40*(priorShare), 0.08, 0.70);
  else if(pos.startsWith('WR1')) roleShare = clamp(0.65*oppPass + 0.35*priorShare, 0.07, 0.55);
  else if(pos.startsWith('WR2') || pos.startsWith('WR3')) roleShare = clamp(0.55*oppPass + 0.45*priorShare, 0.05, 0.45);
  else if(pos.startsWith('TE')) roleShare = clamp(0.60*oppPass + 0.40*priorShare, 0.05, 0.45);
  else if(pos==='QB') roleShare = clamp(0.50*(U.rushShare||0) + 0.50*priorShare, 0.02, 0.25);
  const defBase = 1.0
    * (D.tdPerGameAllowed ? clamp(D.tdPerGameAllowed / 2.5, 0.80, 1.20) : 1.0)
    * (pos.startsWith('RB') && D.rushTdRate!=null ? clamp(1 + 0.75*(D.rushTdRate - 0.03)/0.03, 0.85, 1.20) : 1.0)
    * (!(pos.startsWith('RB')) && D.passTdRate!=null ? clamp(1 + 0.60*(D.passTdRate - 0.045)/0.045, 0.85, 1.18) : 1.0)
    * (D.redZoneTdPctAllowed!=null ? clamp(1 + 0.40*(D.redZoneTdPctAllowed - 0.54)/0.54, 0.88, 1.15) : 1.0);
  const paceMult    = clamp(Number((C.pace||1.0)), 0.90, 1.10);
  const weatherMult = clamp(Number((C.weatherMult||1.0)), 0.90, 1.08);
  const qbStyleMult = clamp(Number((C.qbStyleMult||1.0)), 0.90, 1.10);
  const injuryMult  = clamp(Number((C.injuryMult||1.0)), 0.60, 1.00);
  let lambda = teamTDs * roleShare * defBase * paceMult * weatherMult * qbStyleMult * injuryMult;
  lambda = clamp(lambda, 0.04, 1.10);
  const p = 1 - Math.exp(-lambda);
  return clamp(p, 0.02, 0.65);
}
