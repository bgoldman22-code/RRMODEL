const path = require("path");
const fs = require("fs/promises");
exports.config = {
  includedFiles: ["netlify/functions/nfl-predictions-get/_data/**"]
};
const LOCAL_BASE = path.join(__dirname, "_data");
const readJson = async (p) => {
  const s = await fs.readFile(p, "utf8").catch(() => null);
  return s ? JSON.parse(s) : null;
};
exports.handler = async (event) => {
  try {
    const season = Number(event.queryStringParameters?.season || new Date().getFullYear());
    const week   = Number(event.queryStringParameters?.week || 0);
    if (week) {
      const p = path.join(LOCAL_BASE, String(season), `week${week}.json`);
      const j = await readJson(p);
      if (j) return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(j) };
    }
    const curr = await readJson(path.join(LOCAL_BASE, "current.json"));
    if (curr) return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(curr) };
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok:false, error:"No predictions file found" }) };
  } catch (e) {
    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
