'use strict';
// Simple NFL odds placeholder so generator can run without MLB odds leakage.
// Returns no odds (rows: []), which the generator tolerates.
exports.handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, sport: "nfl", rows: [] })
  };
};
