const fs = require('fs');
const path = require('path');

function safeList(dir) {
  try { return fs.readdirSync(dir); } catch (_) { return null; }
}

exports.handler = async () => {
  try {
    const here = __dirname;
    const root = path.resolve(here, '..'); // functions root
    const dataDir = path.join(here, '_data');
    const week1Path = path.join(here, '_data', 'nfl', '2025', 'week1', 'depth-charts.json');
    const currentPath = path.join(here, '_data', 'nfl', 'current.json');

    const result = {
      ok: true,
      __dirname: here,
      dirs: {
        here: safeList(here),
        dataDir: safeList(dataDir),
        dataNFL: safeList(path.join(here,'_data','nfl')),
        week2025: safeList(path.join(here, '_data', 'nfl', '2025')),
        week1: safeList(path.join(here, '_data', 'nfl', '2025', 'week1')),
      },
      exists: {
        week1: fs.existsSync(week1Path),
        current: fs.existsSync(currentPath),
      },
      env: {
        BLOBS_STORE: process.env.BLOBS_STORE || null,
        BLOBS_STORE_NFL: process.env.BLOBS_STORE_NFL || null,
      },
      paths: { week1Path, currentPath }
    };

    return { statusCode: 200, headers:{'content-type':'application/json'}, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers:{'content-type':'application/json'}, body: JSON.stringify({ ok:false, error:String(err && err.stack || err) }) };
  }
};