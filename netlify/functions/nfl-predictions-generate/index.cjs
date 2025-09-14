// patched nfl-predictions-generate/index.cjs
// simplified: fixed rows building, added logging, uses TEAM_FORM_URL env var

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  try {
    const teamFormUrl = process.env.TEAM_FORM_URL;
    const oddsUrl = process.env.ODDS_URL || "https://bgroundrobin.com/.netlify/functions/nfl-odds-bridge";
    const scheduleUrl = process.env.SCHEDULE_URL || "https://bgroundrobin.com/.netlify/functions/nfl-schedule-get";

    const [schedRes, oddsRes, formRes] = await Promise.all([
      fetch(scheduleUrl).then(r=>r.json()).catch(()=>({})),
      fetch(oddsUrl).then(r=>r.json()).catch(()=>({})),
      teamFormUrl ? fetch(teamFormUrl).then(r=>r.json()).catch(()=>({})) : {}
    ]);

    const rows = [];
    for (const game of (oddsRes.rows || [])) {
      rows.push({
        id: game.id,
        matchup: game.matchup,
        kickoff: game.commence_time,
        homeTeam: game.home,
        awayTeam: game.away,
        odds: game,
        pick: { type: "moneyline", team: game.home, confidence: 0.6 }
      });
    }

    console.log("Generated rows:", rows.length);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, updated: new Date().toISOString(), rows })
    };
  } catch (err) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
