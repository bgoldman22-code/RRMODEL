// Simple OpenWeatherMap integration (3-hour forecast)
export async function getWeatherImpact(game, fetchFn = fetch) {
  try {
    const apiKey = process.env.WEATHER_API_KEY;
    if (!apiKey) return null;

    const teamToCity = {
      BUF: "Buffalo,US", MIA: "Miami,US", NE: "Foxborough,US", NYJ: "East Rutherford,US",
      KC: "Kansas City,US", DEN: "Denver,US", PIT: "Pittsburgh,US", CLE: "Cleveland,US",
      GB: "Green Bay,US", CHI: "Chicago,US", DET: "Detroit,US", MIN: "Minneapolis,US",
      PHI: "Philadelphia,US", DAL: "Arlington,US", WAS: "Landover,US", NYG: "East Rutherford,US",
      TB: "Tampa,US", NO: "New Orleans,US", CAR: "Charlotte,US", ATL: "Atlanta,US",
      SF: "Santa Clara,US", SEA: "Seattle,US", LAR: "Inglewood,US", LAC: "Inglewood,US",
      JAX: "Jacksonville,US", TEN: "Nashville,US", IND: "Indianapolis,US", HOU: "Houston,US",
      ARI: "Glendale,US", LV: "Las Vegas,US", BAL: "Baltimore,US", CIN: "Cincinnati,US"
    };

    // Skip domes by default (teams usually playing in domes):
    const domeTeams = new Set(["MIN","DET","NO","ATL","DAL","ARI","LAR","LAC","IND","LV"]);
    if (domeTeams.has(game.home)) return null;

    const q = teamToCity[game.home];
    if (!q) return null;

    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(q)}&appid=${apiKey}&units=imperial`;
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const w = await res.json();

    // Find the closest 3h block to kickoff
    const k = new Date(game.start || game.kickoff || Date.now());
    let best = null, bestDiff = 1e15;
    for (const entry of w.list || []) {
      const t = new Date(entry.dt * 1000);
      const diff = Math.abs(t - k);
      if (diff < bestDiff) { best = entry; bestDiff = diff; }
    }
    if (!best) return null;

    const wind = best.wind?.speed ?? 0;
    const precip = (best.weather && best.weather[0]?.main) || "None";

    const factors = [];
    if (wind > 12) factors.push(`high_wind_${Math.round(wind)}mph`);
    if (precip === "Rain") factors.push("rain_impact");
    if (precip === "Snow") factors.push("snow_impact");

    // Simple EPA/confidence adjustment heuristic
    let confAdj = 0;
    if (wind > 15) confAdj -= 0.02;
    if (precip === "Rain") confAdj -= 0.015;
    if (precip === "Snow") confAdj -= 0.03;

    return {
      source: "openweathermap",
      at: best.dt,
      windSpeed: wind,
      precipitation: precip,
      factors,
      confidenceAdj: confAdj
    };
  } catch (e) {
    return null;
  }
}
