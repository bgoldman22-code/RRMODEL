'use strict';

// INLINE test data to avoid file packaging issues
const SCHEDULE = {
  season: 2025, week: 1,
  games: [
    { game_id: "2025-W1-NE-MIA", kickoff_et: "2025-09-07T13:00:00-04:00", away: "NE",  home: "MIA", venue: "Hard Rock Stadium" },
    { game_id: "2025-W1-NYJ-BUF", kickoff_et: "2025-09-07T16:25:00-04:00", away: "NYJ", home: "BUF", venue: "Highmark Stadium" },
    { game_id: "2025-W1-DAL-PHI", kickoff_et: "2025-09-07T20:20:00-04:00", away: "DAL", home: "PHI", venue: "Lincoln Financial Field" }
  ]
};

exports.handler = async () => {
  try {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, season: SCHEDULE.season, week: SCHEDULE.week, games: SCHEDULE.games })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) })
    };
  }
};
