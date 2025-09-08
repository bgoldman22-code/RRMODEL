'use strict';
const fs = require('fs');
const path = require('path');

function readSchedule() {
  const p = path.resolve(__dirname, './_data/schedule.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Inline scaffold depth chart (kept minimal for now)
const DEPTH = {
  NE: { RB: [{ name: "Rhamondre Stevenson", role: "RB1" }, { name: "Antonio Gibson", role: "RB2" }],
        WR: [{ name: "Demario Douglas", role: "WR1" }, { name: "Ja'Lynn Polk", role: "WR2" }],
        TE: [{ name: "Hunter Henry", role: "TE1" }] },
  MIA:{ RB: [{ name: "Raheem Mostert", role: "RB1" }, { name: "De'Von Achane", role: "RB2" }],
        WR: [{ name: "Tyreek Hill", role: "WR1" }, { name: "Jaylen Waddle", role: "WR2" }],
        TE: [{ name: "Jonnu Smith", role: "TE1" }] },
  NYJ:{ RB: [{ name: "Breece Hall", role: "RB1" }, { name: "Israel Abanikanda", role: "RB2" }],
        WR: [{ name: "Garrett Wilson", role: "WR1" }, { name: "Mike Williams", role: "WR2" }],
        TE: [{ name: "Tyler Conklin", role: "TE1" }] },
  BUF:{ RB: [{ name: "James Cook", role: "RB1" }, { name: "Ray Davis", role: "RB2" }],
        WR: [{ name: "Keon Coleman", role: "WR1" }, { name: "Curtis Samuel", role: "WR2" }],
        TE: [{ name: "Dalton Kincaid", role: "TE1" }] },
  DAL:{ RB: [{ name: "Ezekiel Elliott", role: "RB1" }, { name: "Rico Dowdle", role: "RB2" }],
        WR: [{ name: "CeeDee Lamb", role: "WR1" }, { name: "Brandin Cooks", role: "WR2" }],
        TE: [{ name: "Jake Ferguson", role: "TE1" }] },
  PHI:{ RB: [{ name: "Saquon Barkley", role: "RB1" }, { name: "Kenneth Gainwell", role: "RB2" }],
        WR: [{ name: "A.J. Brown", role: "WR1" }, { name: "DeVonta Smith", role: "WR2" }],
        TE: [{ name: "Dallas Goedert", role: "TE1" }] }
};

exports.handler = async (event) => {
  try {
    const sched = readSchedule();
    const qs = (event && event.queryStringParameters) || {};
    const weekStr = qs.week ? String(parseInt(qs.week, 10)) : '1';
    const games = sched.weeks[weekStr] || [];

    const teams = new Set();
    for (const g of games) { teams.add(g.away); teams.add(g.home); }

    const players = [];
    for (const [team, groups] of Object.entries(DEPTH)) {
      if (!teams.has(team)) continue;
      for (const pos of ['RB', 'WR', 'TE']) {
        if (groups[pos]) {
          for (const pl of groups[pos].slice(0, 2)) {
            players.push({
              team, pos, player: pl.name, role: pl.role || null,
              td_prob: null, fair_odds: null, notes: `scaffold-inline (week ${weekStr})`
            });
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, season: sched.season, week: parseInt(weekStr,10), games: games.length, candidates: players })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:String(err && err.message ? err.message : err) }) };
  }
};
