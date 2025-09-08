'use strict';
const fs = require('fs');
const path = require('path');

function readLocalJSON(relFile) {
  const p = path.resolve(__dirname, './_data/nfl/2025/week1', relFile);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

exports.handler = async () => {
  try {
    const charts = readLocalJSON('depth-charts.json');
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, week: 1, season: 2025, teams: Object.keys(charts).length, charts })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) })
    };
  }
};
