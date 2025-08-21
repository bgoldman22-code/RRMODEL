
// netlify/functions/nfl-schedule-local.cjs
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  try{
    const q = event.queryStringParameters || {};
    const d = q.date || new Date().toISOString().substring(0,10);

    const p = path.join(process.cwd(), 'public', 'data', 'nfl', 'schedule-2025.sample.json');
    const raw = fs.readFileSync(p, 'utf8');
    const obj = JSON.parse(raw);
    const weeks = obj.weeks || [];
    const hit = weeks.find(w => d >= w.start && d <= w.end) || weeks[0];
    return {
      statusCode: 200,
      body: JSON.stringify({ week: hit.week, start: hit.start, end: hit.end, games: hit.games })
    };
  }catch(e){
    return { statusCode: 200, body: JSON.stringify({ week: 1, start: d, end: d, games: 0, error: String(e) }) };
  }
};
