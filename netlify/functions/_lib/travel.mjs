// Haversine + simple travel factor
export function travelImpact(away, home) {
  const loc = {
    BUF:[42.7738,-78.7870], MIA:[25.9580,-80.2389], NE:[42.0909,-71.2643], NYJ:[40.8135,-74.0741],
    KC:[39.0490,-94.4803], DEN:[39.7439,-105.0201], PIT:[40.4468,-80.0158], CLE:[41.5061,-81.6996],
    GB:[44.5013,-88.0622], CHI:[41.8623,-87.6167], DET:[42.3390,-83.0456], MIN:[44.9733,-93.2570],
    PHI:[39.9008,-75.1675], DAL:[32.7473,-97.0945], WAS:[38.9077,-76.8645], NYG:[40.8135,-74.0741],
    TB:[27.9759,-82.5033], NO:[29.9511,-90.0812], CAR:[35.2258,-80.8528], ATL:[33.7554,-84.4008],
    SF:[37.4030,-121.9700], SEA:[47.5952,-122.3316], LAR:[33.9535,-118.3392], LAC:[33.9535,-118.3392],
    JAX:[30.3239,-81.6374], TEN:[36.1664,-86.7713], IND:[39.7601,-86.1639], HOU:[29.6847,-95.4107],
    ARI:[33.5276,-112.2626], LV:[36.0909,-115.1830], BAL:[39.2779,-76.6227], CIN:[39.0955,-84.5161]
  };
  if (!loc[away] || !loc[home]) return null;
  const [lat1, lon1] = loc[away];
  const [lat2, lon2] = loc[home];
  const R = 3958.8; // miles
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const dist = R * c;

  let factor = null;
  if (dist > 1500) factor = "long_travel";
  else if (dist > 800) factor = "medium_travel";

  // Mild confidence penalty for long flights
  const confidenceAdj = dist > 1500 ? -0.02 : dist > 800 ? -0.01 : 0;

  return { distance: Math.round(dist), factor, confidenceAdj };
}
