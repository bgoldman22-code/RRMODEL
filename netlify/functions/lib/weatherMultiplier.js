// netlify/functions/lib/weatherMultiplier.js
// Build an HR multiplier from basic weather inputs (temp F, wind mph toward CF positive, precip boolean).
export function weatherHRMultiplier({ tempF=null, windOutMph=null, precip=false }={}){
  let mult = 1.00;
  // Temperature: +6% per 10°F above 70; −6% per 10°F below 70 (bounds applied later)
  if(typeof tempF === 'number'){
    mult *= Math.exp(0.06 * ((tempF - 70) / 10));
  }
  // Wind out to CF: +1.5% per 3 mph out; in from CF: −1.5% per 3 mph
  if(typeof windOutMph === 'number'){
    mult *= Math.exp(0.015 * (windOutMph / 3));
  }
  // Light precip reduces carry slightly
  if(precip === true){
    mult *= 0.97;
  }
  // Guardrails
  if(mult < 0.85) mult = 0.85;
  if(mult > 1.15) mult = 1.15;
  return mult;
}
