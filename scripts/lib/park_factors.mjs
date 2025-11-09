/**
 * MLB Park Factors Database
 * 
 * HR park factors for all 30 MLB stadiums
 * Based on 2024 Statcast data (3-year rolling average)
 * 
 * Factors > 1.00 = HR friendly (Coors Field)
 * Factors < 1.00 = HR suppressing (Oracle Park)
 */

export const PARK_FACTORS = {
  // American League East
  'Fenway Park': {
    team: 'BOS',
    overall: 1.02,
    RHH: 1.08,  // Green Monster helps RHH
    LHH: 0.95,  // Deep RF for LHH
    dimensions: { lf: 310, cf: 390, rf: 302 }
  },
  'Yankee Stadium': {
    team: 'NYY',
    overall: 1.12,
    RHH: 1.18,  // Short porch RF (314 ft)
    LHH: 1.04,
    dimensions: { lf: 318, cf: 408, rf: 314 }
  },
  'Tropicana Field': {
    team: 'TB',
    overall: 0.92,
    RHH: 0.90,
    LHH: 0.94,  // Dome, dead ball
    dimensions: { lf: 315, cf: 404, rf: 322 }
  },
  'Rogers Centre': {
    team: 'TOR',
    overall: 1.09,
    RHH: 1.12,
    LHH: 1.06,  // Retractable roof, altitude
    dimensions: { lf: 328, cf: 400, rf: 328 }
  },
  'Camden Yards': {
    team: 'BAL',
    overall: 1.08,
    RHH: 1.14,  // Short RF porch
    LHH: 1.02,
    dimensions: { lf: 333, cf: 400, rf: 318 }
  },
  
  // American League Central
  'Guaranteed Rate Field': {
    team: 'CHW',
    overall: 1.04,
    RHH: 1.06,
    LHH: 1.02,
    dimensions: { lf: 330, cf: 400, rf: 335 }
  },
  'Progressive Field': {
    team: 'CLE',
    overall: 0.98,
    RHH: 0.96,
    LHH: 1.00,
    dimensions: { lf: 325, cf: 405, rf: 325 }
  },
  'Comerica Park': {
    team: 'DET',
    overall: 0.88,
    RHH: 0.84,  // Deep CF (420 ft)
    LHH: 0.92,
    dimensions: { lf: 345, cf: 420, rf: 330 }
  },
  'Kauffman Stadium': {
    team: 'KC',
    overall: 0.96,
    RHH: 0.94,
    LHH: 0.98,
    dimensions: { lf: 330, cf: 410, rf: 330 }
  },
  'Target Field': {
    team: 'MIN',
    overall: 0.99,
    RHH: 0.98,
    LHH: 1.00,
    dimensions: { lf: 339, cf: 404, rf: 328 }
  },
  
  // American League West
  'Minute Maid Park': {
    team: 'HOU',
    overall: 1.06,
    RHH: 1.02,
    LHH: 1.10,  // Short LF (315 ft)
    dimensions: { lf: 315, cf: 435, rf: 326 }
  },
  'Angel Stadium': {
    team: 'LAA',
    overall: 0.94,
    RHH: 0.92,
    LHH: 0.96,
    dimensions: { lf: 330, cf: 400, rf: 330 }
  },
  'Oakland Coliseum': {
    team: 'OAK',
    overall: 0.86,
    RHH: 0.82,  // Massive foul territory
    LHH: 0.90,
    dimensions: { lf: 330, cf: 400, rf: 330 }
  },
  'T-Mobile Park': {
    team: 'SEA',
    overall: 0.88,
    RHH: 0.84,  // Marine layer, deep fences
    LHH: 0.92,
    dimensions: { lf: 331, cf: 401, rf: 326 }
  },
  'Globe Life Field': {
    team: 'TEX',
    overall: 1.11,
    RHH: 1.08,
    LHH: 1.14,  // Retractable roof, hot/humid
    dimensions: { lf: 329, cf: 407, rf: 326 }
  },
  
  // National League East
  'Truist Park': {
    team: 'ATL',
    overall: 1.02,
    RHH: 0.98,
    LHH: 1.06,  // LF power alley 380 ft
    dimensions: { lf: 335, cf: 400, rf: 325 }
  },
  'Marlins Park': {
    team: 'MIA',
    overall: 0.90,
    RHH: 0.88,
    LHH: 0.92,  // Retractable roof, AC
    dimensions: { lf: 344, cf: 407, rf: 335 }
  },
  'Citi Field': {
    team: 'NYM',
    overall: 0.94,
    RHH: 0.90,
    LHH: 0.98,
    dimensions: { lf: 335, cf: 408, rf: 330 }
  },
  'Citizens Bank Park': {
    team: 'PHI',
    overall: 1.14,
    RHH: 1.18,  // Short RF (330 ft), wind
    LHH: 1.10,
    dimensions: { lf: 329, cf: 401, rf: 330 }
  },
  'Nationals Park': {
    team: 'WSH',
    overall: 1.00,
    RHH: 0.98,
    LHH: 1.02,
    dimensions: { lf: 336, cf: 402, rf: 335 }
  },
  
  // National League Central
  'Wrigley Field': {
    team: 'CHC',
    overall: 1.06,
    RHH: 1.04,
    LHH: 1.08,  // Wind dependent
    dimensions: { lf: 355, cf: 400, rf: 353 }
  },
  'Great American Ball Park': {
    team: 'CIN',
    overall: 1.16,
    RHH: 1.20,  // Small dimensions, river
    LHH: 1.12,
    dimensions: { lf: 328, cf: 404, rf: 325 }
  },
  'American Family Field': {
    team: 'MIL',
    overall: 0.98,
    RHH: 0.96,
    LHH: 1.00,  // Retractable roof
    dimensions: { lf: 344, cf: 400, rf: 345 }
  },
  'PNC Park': {
    team: 'PIT',
    overall: 0.92,
    RHH: 0.88,
    LHH: 0.96,
    dimensions: { lf: 325, cf: 399, rf: 320 }
  },
  'Busch Stadium': {
    team: 'STL',
    overall: 0.96,
    RHH: 0.94,
    LHH: 0.98,
    dimensions: { lf: 336, cf: 400, rf: 335 }
  },
  
  // National League West
  'Chase Field': {
    team: 'ARI',
    overall: 1.18,
    RHH: 1.16,
    LHH: 1.20,  // Retractable roof, desert air
    dimensions: { lf: 330, cf: 407, rf: 334 }
  },
  'Coors Field': {
    team: 'COL',
    overall: 1.35,
    RHH: 1.38,  // Altitude (5,200 ft)
    LHH: 1.32,  // Ball flies 10% further
    dimensions: { lf: 347, cf: 415, rf: 350 }
  },
  'Dodger Stadium': {
    team: 'LAD',
    overall: 0.94,
    RHH: 0.92,
    LHH: 0.96,  // Marine layer, pitcher's park
    dimensions: { lf: 330, cf: 395, rf: 330 }
  },
  'Petco Park': {
    team: 'SD',
    overall: 0.86,
    RHH: 0.82,  // Marine layer, big dimensions
    LHH: 0.90,
    dimensions: { lf: 334, cf: 396, rf: 322 }
  },
  'Oracle Park': {
    team: 'SF',
    overall: 0.80,
    RHH: 0.72,  // Worst for RHH (wind, deep RF)
    LHH: 0.88,
    dimensions: { lf: 339, cf: 399, rf: 309 }
  }
};

/**
 * Get park factor for a specific venue and batter handedness
 */
export function getParkFactor(venue, batterHand = 'R') {
  const park = PARK_FACTORS[venue];
  if (!park) {
    console.warn(`Park not found: ${venue}, using neutral 1.00`);
    return { overall: 1.00, handed: 1.00, team: 'UNK' };
  }
  
  const handed = batterHand === 'R' ? park.RHH : park.LHH;
  
  return {
    overall: park.overall,
    handed: handed,
    team: park.team,
    dimensions: park.dimensions
  };
}

/**
 * Get all parks ranked by HR favorability
 */
export function getRankedParks() {
  return Object.entries(PARK_FACTORS)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.overall - a.overall);
}

/**
 * Calculate park adjustment for HR probability
 */
export function adjustProbabilityForPark(baseProb, venue, batterHand) {
  const parkFactor = getParkFactor(venue, batterHand);
  return baseProb * parkFactor.handed;
}

export default PARK_FACTORS;
