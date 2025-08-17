// src/utils/why.js
function pct(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return `${(Number(n) * 100).toFixed(1)}%`;
}
function pctAdjFromMult(mult) {
  const m = Number(mult);
  if (!isFinite(m) || m === 1) return "neutral";
  const adj = (m - 1) * 100;
  const sign = adj > 0 ? "+" : "";
  if (Math.abs(adj) < 0.5) return "neutral";
  return `${sign}${Math.round(adj)}%`;
}
function formatHot(mult){
  const m = Number(mult);
  if (!isFinite(m) || m === 1) return "hot/cold +0%";
  const d = ((m - 1) * 100);
  const sign = d > 0 ? "+" : "";
  return `hot/cold ${sign}${Math.round(d)}%`;
}

/**
 * explainRow can be called two ways:
 *   explainRow({ baseProb, hotBoost, calScale, oddsAmerican, pitcherName, parkHR, weatherHR })
 *   explainRow(baseProb, hotBoost, calScale, pitcherName, parkHR, weatherHR, oddsAmerican)  // legacy positional
 */
export function explainRow(a, b, c, d, e, f, g){
  let params;
  if (a && typeof a === "object" && !Array.isArray(a)) {
    params = a;
  } else {
    params = {
      baseProb: a,
      hotBoost: b,
      calScale: c,
      pitcherName: d,
      parkHR: e,
      weatherHR: f,
      oddsAmerican: g
    };
  }

  const {
    baseProb = 0,
    hotBoost = 1,
    calScale = 1,
    oddsAmerican = null,
    pitcherName = "",
    parkHR = 1,
    weatherHR = 1,
  } = params || {};

  const hotTxt = formatHot(hotBoost);
  const parkTxt = `park HR ${pctAdjFromMult(parkHR)}`;
  const wxTxt = (weatherHR && weatherHR !== 1) ? ` • weather ${pctAdjFromMult(weatherHR)}` : "";
  const vsTxt = pitcherName ? ` • vs ${String(pitcherName)}` : "";
  const calTxt = (calScale && calScale !== 1) ? ` • cal ${pctAdjFromMult(calScale)}` : "";
  const oddsTxt = (oddsAmerican !== null && oddsAmerican !== undefined) ? ` • odds ${oddsAmerican}` : "";

  return `model ${pct(baseProb)} • ${hotTxt}${vsTxt} • ${parkTxt}${wxTxt}${calTxt}${oddsTxt}`;
}
