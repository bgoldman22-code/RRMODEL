// netlify/functions/nfl-rosters-gameday-sun.cjs
const { runUpdate } = require("./_shared/rosters-shared.cjs");
// Every 30 minutes 15-23 UTC on Sundays (11am–7:59pm ET) and 0-3 UTC Mondays (SNF tail)
module.exports.config = { schedule: "*/30 15-23 * * 0,1" };
module.exports.handler = async () => {
  const res = await runUpdate();
  return { statusCode: 200, body: JSON.stringify({ source:"gameday-sun", ...res }) };
};
