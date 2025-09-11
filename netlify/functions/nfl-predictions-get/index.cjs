// File: netlify/functions/nfl-predictions-get/index.cjs
exports.config = {
  includedFiles: ["netlify/functions/nfl-predictions-get/_data/**"]
};

const fs = require("fs/promises");
const path = require("path");

const DATA_ROOT = path.join(__dirname, "_data");

async function readJson(p) {
  try {
    const s = await fs.readFile(p, "utf8");
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function getWeekPath(season, week) {
  const weekPath = path.join(DATA_ROOT, String(season), `week${week}.json`);
  const file = await fs.stat(weekPath).then(() => weekPath).catch(() => null);
  return file;
}

async function load(season, week) {
  // 1) explicit week file
  if (Number.isFinite(week)) {
    const wp = await getWeekPath(season, week);
    if (wp) {
      const j = await readJson(wp);
      if (j) return { ...j, source: `local:${path.relative(process.cwd(), wp)}` };
    }
  }
  // 2) current.json
  const currPath = path.join(DATA_ROOT, "current.json");
  const curr = await readJson(currPath);
  if (curr) return { ...curr, source: `local:${path.relative(process.cwd(), currPath)}` };

  // 3) best-effort: find latest week file for given season
  try {
    const dir = path.join(DATA_ROOT, String(season));
    const files = await fs.readdir(dir);
    const wfiles = files.filter(f => /^week\d+\.json$/.test(f));
    if (wfiles.length) {
      const nums = wfiles.map(f => Number(f.replace(/[^\d]/g,""))).filter(n=>!isNaN(n));
      const maxW = Math.max(...nums);
      const wp = path.join(dir, `week${maxW}.json`);
      const j = await readJson(wp);
      if (j) return { ...j, source: `local:${path.relative(process.cwd(), wp)}` };
    }
  } catch {}
  return null;
}

exports.handler = async (event) => {
  try {
    const season = Number(event.queryStringParameters?.season || process.env.PREDICTIONS_SEASON || 2025);
    const week   = event.queryStringParameters?.week ? Number(event.queryStringParameters.week) : undefined;

    const data = await load(season, week);
    if (data) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({ ok: true, ...data })
      };
    }
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ ok: false, error: "No predictions found in local repo _data." })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ ok: false, error: String(err) })
    };
  }
};
