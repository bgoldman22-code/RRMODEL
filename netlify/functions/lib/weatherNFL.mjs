
// netlify/functions/lib/weatherNFL.mjs
// Minimal weather hook: returns neutral multipliers if weather source is unavailable.
export async function gameWeather(lat, lon, kickoffISO){
  // Placeholder: add Open-Meteo or NWS here. Always return neutral for now.
  return { precip:false, windMph:0, tempF:null, note:'neutral' };
}

export function tdWeatherMultiplier(w){
  // If heavy rain/snow/wind, nudge toward rush TDs slightly
  if (!w) return { rush:1.00, pass:1.00 };
  const windy = Math.abs(w.windMph||0) >= 18;
  return windy ? { rush:1.06, pass:0.96 } : { rush:1.00, pass:1.00 };
}
