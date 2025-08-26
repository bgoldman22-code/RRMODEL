// src/utils/parkAdjust.js
// Park adjustment with batter-type x park interactions

export function parkAdjust(hrProb, parkFactor, hitter) {
  let adj = parkFactor;

  if (parkFactor < 1.0) {
    // Penalizing parks
    if (hitter.pullPct > 40 && hitter.avgLA >= 20 && hitter.avgLA <= 35 && hitter.maxEV >= 108) {
      adj = 1 - (1 - parkFactor) * 0.5; // soften penalty by 50%
    }
  } else {
    // HR-friendly parks, amplify for flyball hitters
    if (hitter.fbPct > 40 && hitter.maxEV >= 107) {
      adj = parkFactor * 1.1;
    }
  }

  return hrProb * adj;
}
