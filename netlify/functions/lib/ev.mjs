
// netlify/functions/lib/ev.mjs
export function americanToDecimal(us){
  const n = Number(us);
  if (!Number.isFinite(n)) return null;
  if (n >= 100) return 1 + n/100;
  if (n <= -100) return 1 + 100/Math.abs(n);
  return null;
}
export function impliedFromAmerican(us){
  const dec = americanToDecimal(us);
  if (!dec) return null;
  return 1/dec;
}
export function probToAmerican(p){
  if (!(p>0 && p<1)) return null;
  const dec = 1/p;
  return dec >= 2 ? Math.round((dec-1)*100) : Math.round(-100/(dec-1));
}
export function evFromProbAndUS(p, us){
  const dec = americanToDecimal(us);
  if (!dec) return null;
  return p*(dec-1) - (1-p);
}
