// netlify/functions/nfl-rosters-gameday-mon.cjs
const { runUpdate } = require("./_shared/rosters-shared.cjs");
// Every 30 minutes 22-23 UTC Mon and 0-3 UTC Tue (covers MNF inactives & late scratches)
module.exports.config = { schedule: "*/30 22-23 * * 1,2" };
module.exports.handler = async () => {
  const res = await runUpdate();
  return { statusCode: 200, body: JSON.stringify({ source:"gameday-mon", ...res }) };
};
