// netlify/functions/nfl-rosters-daily.cjs
const { runUpdate } = require("./_shared/rosters-shared.cjs");
module.exports.config = { schedule: "0 13 * * *" }; // 13:00 UTC daily (~09:00 ET)
module.exports.handler = async () => {
  const res = await runUpdate();
  return { statusCode: 200, body: JSON.stringify({ source:"daily", ...res }) };
};
