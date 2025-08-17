// src/utils/why.js
function pct(n){ if(n==null||isNaN(n)) return "—"; return `${(Number(n)*100).toFixed(1)}%`; }
function pctAdjFromMult(m){
  m = Number(m);
  if(!isFinite(m) || m===1) return "neutral";
  const d = (m-1)*100;
  const s = d>0? "+": "";
  if(Math.abs(d)<0.5) return "neutral";
  return `${s}${Math.round(d)}%`;
}
function formatHot(m){
  m = Number(m);
  if(!isFinite(m) || m===1) return "hot/cold +0%";
  const d = (m-1)*100;
  const s = d>0? "+": "";
  return `hot/cold ${s}${Math.round(d)}%`;
}

// Accepts either object or legacy positional args
export function explainRow(a,b,c,d,e,f,g){
  let p;
  if (a && typeof a === "object" && !Array.isArray(a)) p=a;
  else p={ baseProb:a, hotBoost:b, calScale:c, pitcherName:d, parkHR:e, weatherHR:f, oddsAmerican:g };

  const baseProb=Number(p.baseProb||0);
  const hotBoost=Number(p.hotBoost||1);
  const calScale=Number(p.calScale||1);
  const oddsAmerican=(p.oddsAmerican??null);
  const pitcherName=(p.pitcherName||"");
  const parkHR=Number(p.parkHR==null?1:p.parkHR);
  const weatherHR=Number(p.weatherHR==null?1:p.weatherHR);

  const hotTxt = formatHot(hotBoost);
  const parkTxt = `park HR ${pctAdjFromMult(parkHR)}`;
  const wxTxt = weatherHR!==1 ? ` • weather ${pctAdjFromMult(weatherHR)}` : "";
  const vsTxt = pitcherName ? ` • vs ${String(pitcherName)}` : "";
  const calTxt = calScale!==1 ? ` • cal ${pctAdjFromMult(calScale)}` : "";
  const oddsTxt = (oddsAmerican!=null) ? ` • odds ${oddsAmerican}` : "";

  return `model ${pct(baseProb)} • ${hotTxt}${vsTxt} • ${parkTxt}${wxTxt}${calTxt}${oddsTxt}`;
}
