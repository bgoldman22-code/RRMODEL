'use strict';
const fs = require('fs');
const path = require('path');

function readLocalJSON(relFile) {
  const p = path.resolve(__dirname, './_data/nfl/2025/week1', relFile);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

exports.handler = async () => {
  try {
    const schedule = readLocalJSON('schedule.json');
    const charts = readLocalJSON('depth-charts.json');
    const players = [];

    for (const [team, groups] of Object.entries(charts)) {
      for (const pos of ['RB', 'WR', 'TE']) {
        if (groups[pos]) {
          for (const pl of groups[pos].slice(0, 2)) {
            players.push({
              team,
              pos,
              player: pl.name,
              role: pl.role || null,
              td_prob: null,
              fair_odds: null,
              notes: 'scaffold'
            });
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        season: schedule.season,
        week: schedule.week,
        games: schedule.games.length,
        candidates: players.slice(0, 24)
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) })
    };
  }
};
