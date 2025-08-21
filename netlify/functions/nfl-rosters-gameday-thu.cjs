// netlify/functions/nfl-rosters-gameday-thu.cjs
const { runUpdate } = require("./_shared/rosters-shared.cjs");
// Every 30 minutes 21-23 UTC Thu and 0-3 UTC Fri (covers TNF inactives & late news)
module.exports.config = { schedule: "*/30 21-23 * * 4,5" };
module.exports.handler = async () => {
  const res = await runUpdate();
  return { statusCode: 200, body: JSON.stringify({ source:"gameday-thu", ...res }) };
};
