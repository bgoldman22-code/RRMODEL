// Enhanced weather integration using WEATHER_BRIDGE_URL
export async function getWeatherImpact(game, fetchFn = fetch) {
  try {
    const weatherBridgeUrl = process.env.WEATHER_BRIDGE_URL;
    if (!weatherBridgeUrl) {
      console.warn('WEATHER_BRIDGE_URL not configured');
      return null;
    }

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

    // Skip dome teams (indoor stadiums)
    const domeTeams = new Set(["MIN","DET","NO","ATL","DAL","ARI","LAR","LAC","IND","LV"]);
    if (domeTeams.has(game.home)) return null;

    const cityQuery = teamToCity[game.home];
    if (!cityQuery) return null;

    // Use WEATHER_BRIDGE_URL with city parameter
    const url = `${weatherBridgeUrl}&q=${encodeURIComponent(cityQuery)}&units=imperial`;
    const res = await fetchFn(url);
    if (!res.ok) {
      console.warn('Weather API request failed:', res.status);
      return null;
    }
    
    const weatherData = await res.json();

    // Find the closest 3h forecast block to kickoff
    const kickoffTime = new Date(game.start || game.kickoff || Date.now());
    let bestForecast = null, bestTimeDiff = Infinity;
    
    for (const entry of weatherData.list || []) {
      const forecastTime = new Date(entry.dt * 1000);
      const timeDiff = Math.abs(forecastTime - kickoffTime);
      if (timeDiff < bestTimeDiff) { 
        bestForecast = entry; 
        bestTimeDiff = timeDiff; 
      }
    }
    
    if (!bestForecast) return null;

    const windSpeed = bestForecast.wind?.speed ?? 0;
    const precipitation = (bestForecast.weather && bestForecast.weather[0]?.main) || "Clear";

    const factors = [];
    if (windSpeed > 12) factors.push(`high_wind_${Math.round(windSpeed)}mph`);
    if (precipitation === "Rain") factors.push("rain_impact");
    if (precipitation === "Snow") factors.push("snow_impact");
    if (windSpeed > 20) factors.push("extreme_wind");

    // Research-backed EPA/confidence adjustments
    let confidenceAdjustment = 0;
    if (windSpeed > 15) confidenceAdjustment -= 0.02;  // High wind reduces confidence
    if (precipitation === "Rain") confidenceAdjustment -= 0.015;
    if (precipitation === "Snow") confidenceAdjustment -= 0.03;
    if (windSpeed > 20) confidenceAdjustment -= 0.04;  // Extreme conditions

    return {
      source: "openweathermap_bridge",
      timestamp: bestForecast.dt,
      windSpeed: Math.round(windSpeed),
      precipitation,
      factors,
      confidenceAdj: confidenceAdjustment,
      forecastHoursOut: Math.round(bestTimeDiff / (1000 * 60 * 60))
    };
  } catch (e) {
    console.warn('Weather integration failed:', e.message);
    return null;
  }
}
