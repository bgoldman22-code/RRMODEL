'use strict';
const fs = require('fs');
const path = require('path');

function readLocalJSON(relFile) {
  const p = path.resolve(__dirname, '../../data/nfl/2025/week1', relFile);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

exports.handler = async () => {
  try {
    const schedule = readLocalJSON('schedule.json');
    const charts = readLocalJSON('depth-charts.json');
    const players = [];

    // produce a small, deterministic candidate list from depth charts for sanity testing
    for (const [team, groups] of Object.entries(charts)) {
      for (const pos of ['RB', 'WR', 'TE']) {
        if (groups[pos]) {
          // take up to two per position to keep output small
          for (const p of groups[pos].slice(0, 2)) {
            players.push({
              team,
              pos,
              player: p.name,
              role: p.role || null,
              // in v1 scaffolding, return null prob to prove plumbing, we fill later
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
        candidates: players.slice(0, 24) // keep response small for first test
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
