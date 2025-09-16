'use strict';
function americanToProb(odds){ if(odds==null||Number.isNaN(Number(odds)))return null; const o=Number(odds); if(o===0)return null; if(o<0)return (-o)/((-o)+100); return 100/(o+100); }
function clamp(x,lo,hi){ if(x==null||Number.isNaN(Number(x)))return null; return Math.max(lo, Math.min(hi, x)); }
function pickOddsForMarket(odds, market, side, homeTeam, awayTeam){
  if(!odds) return {};
  const out = { market, side, price: null, line: null, label: null };
  if(market==='moneyline'){
    if(side==='home'){ out.price=odds.ml_home??null; out.label=homeTeam; }
    else if(side==='away'){ out.price=odds.ml_away??null; out.label=awayTeam; }
  } else if(market==='spread'){
    if(typeof odds.spread_point === 'number'){
      if(side==='home'){ out.line=odds.spread_point; out.price=odds.spread_home_line??null; out.label=`${out.line>0?'+':''}${out.line} ${homeTeam}`; }
      else { const ap = (typeof odds.spread_point==='number') ? (-odds.spread_point) : null; out.line=ap; out.price=odds.spread_away_line??null; out.label=`${ap>0?'+':''}${ap} ${awayTeam}`; }
    }
  } else if (market==='total'){
    if(typeof odds.total_points === 'number'){
      out.line = odds.total_points;
      if(side==='over'){ out.price=odds.over_price??null; out.label=`Over ${odds.total_points}`; }
      else if(side==='under'){ out.price=odds.under_price??null; out.label=`Under ${odds.total_points}`; }
    }
  }
  return out;
}
function modelProbFromChoice(model_probs, market, side){
  if(!model_probs) return null;
  if(market==='moneyline'){
    if(side==='home' && typeof model_probs.pHomeML==='number') return model_probs.pHomeML;
    if(side==='away' && typeof model_probs.pAwayML==='number') return model_probs.pAwayML;
  }
  if(typeof model_probs.pSelectedSide === 'number') return model_probs.pSelectedSide;
  return null;
}
function computeConfidenceAndDisplay(row, opts = {}){
  const { blendWeight=0.6, defaultClamp=[0.52,0.68], odds=null, model=null } = opts;
  if (!row || !row.model_choice) return row;
  const { market, side } = row.model_choice;
  const home = row.homeTeam || row.home || '';
  const away = row.awayTeam || row.away || '';
  const choiceOdds = pickOddsForMarket(odds || row.odds, market, side, home, away) || {};
  const implied = americanToProb(choiceOdds.price);
  const pModel = modelProbFromChoice(model || row.model_probs, market, side);
  let conf = null;
  if (typeof pModel==='number' && typeof implied==='number'){ conf = blendWeight*pModel + (1-blendWeight)*implied; }
  else if (typeof pModel==='number'){ conf = pModel; }
  else if (typeof implied==='number'){ conf = implied; }
  else { conf = (defaultClamp[0]+defaultClamp[1])/2; }
  const clamped = clamp(conf, defaultClamp[0], defaultClamp[1]) ?? ((defaultClamp[0]+defaultClamp[1])/2);
  row.displayMarket = market;
  row.displayPick = choiceOdds.label || (market==='moneyline' ? (side==='home'?home:away) : '');
  row.displayPrice = (choiceOdds.price!=null) ? String(choiceOdds.price) : null;
  row.displayLine = (choiceOdds.line!=null) ? String(choiceOdds.line) : null;
  row.confidence = clamped;
  return row;
}
module.exports = { computeConfidenceAndDisplay, americanToProb };
