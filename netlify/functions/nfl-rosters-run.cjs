// netlify/functions/nfl-rosters-run.cjs
const { runUpdate } = require("./_shared/rosters-shared.cjs");
module.exports.handler = async () => {
  const res = await runUpdate();
  return { statusCode: 200, body: JSON.stringify({ source:"manual", ...res }) };
};
