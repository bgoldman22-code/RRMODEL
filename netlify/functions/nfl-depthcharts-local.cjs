'use strict';

// INLINE test data to avoid file packaging issues
const DEPTH = {
  NE: {
    RB: [{ name: "Rhamondre Stevenson", role: "RB1", goal_line_share: 0.60 },
         { name: "Antonio Gibson", role: "RB2", goal_line_share: 0.30 }],
    WR: [{ name: "Demario Douglas", role: "WR1", deep_threat: 0.40 },
         { name: "Ja'Lynn Polk", role: "WR2", deep_threat: 0.35 }],
    TE: [{ name: "Hunter Henry", role: "TE1", red_zone_target_share: 0.22 }]
  },
  MIA: {
    RB: [{ name: "Raheem Mostert", role: "RB1", goal_line_share: 0.55 },
         { name: "De'Von Achane", role: "RB2", goal_line_share: 0.30 }],
    WR: [{ name: "Tyreek Hill", role: "WR1", deep_threat: 0.55 },
         { name: "Jaylen Waddle", role: "WR2", deep_threat: 0.45 }],
    TE: [{ name: "Jonnu Smith", role: "TE1", red_zone_target_share: 0.16 }]
  },
  NYJ: {
    RB: [{ name: "Breece Hall", role: "RB1", goal_line_share: 0.62 },
         { name: "Israel Abanikanda", role: "RB2", goal_line_share: 0.22 }],
    WR: [{ name: "Garrett Wilson", role: "WR1", deep_threat: 0.38 },
         { name: "Mike Williams", role: "WR2", deep_threat: 0.50 }],
    TE: [{ name: "Tyler Conklin", role: "TE1", red_zone_target_share: 0.18 }]
  },
  BUF: {
    RB: [{ name: "James Cook", role: "RB1", goal_line_share: 0.35 },
         { name: "Ray Davis", role: "RB2", goal_line_share: 0.30 },
         { name: "Damien Harris", role: "RB3", goal_line_share: 0.25 }],
    WR: [{ name: "Keon Coleman", role: "WR1", deep_threat: 0.40 },
         { name: "Curtis Samuel", role: "WR2", deep_threat: 0.28 }],
    TE: [{ name: "Dalton Kincaid", role: "TE1", red_zone_target_share: 0.20 }]
  },
  DAL: {
    RB: [{ name: "Ezekiel Elliott", role: "RB1", goal_line_share: 0.55 },
         { name: "Rico Dowdle", role: "RB2", goal_line_share: 0.30 }],
    WR: [{ name: "CeeDee Lamb", role: "WR1", deep_threat: 0.42 },
         { name: "Brandin Cooks", role: "WR2", deep_threat: 0.40 }],
    TE: [{ name: "Jake Ferguson", role: "TE1", red_zone_target_share: 0.19 }]
  },
  PHI: {
    RB: [{ name: "Saquon Barkley", role: "RB1", goal_line_share: 0.65 },
         { name: "Kenneth Gainwell", role: "RB2", goal_line_share: 0.22 }],
    WR: [{ name: "A.J. Brown", role: "WR1", deep_threat: 0.35 },
         { name: "DeVonta Smith", role: "WR2", deep_threat: 0.32 }],
    TE: [{ name: "Dallas Goedert", role: "TE1", red_zone_target_share: 0.17 }]
  }
};

exports.handler = async () => {
  try {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, season: 2025, week: 1, teams: Object.keys(DEPTH).length, charts: DEPTH })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) })
    };
  }
};
