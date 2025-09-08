'use strict';
const fs = require('fs');
const path = require('path');

function readLocalJSON(relFile) {
  // Data lives INSIDE the functions bundle for GitHub->Netlify deploys
  const p = path.resolve(__dirname, './_data/nfl/2025/week1', relFile);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

exports.handler = async () => {
  try {
    const data = readLocalJSON('schedule.json');
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, season: data.season, week: data.week, games: data.games })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) })
    };
  }
};
