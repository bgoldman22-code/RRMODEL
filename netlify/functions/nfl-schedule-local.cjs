
// netlify/functions/nfl-schedule-local.cjs
const { readFile } = require('fs/promises');
const path = require('path');

exports.handler = async (event) => {
  try{
    const date = (new URLSearchParams(event.queryStringParameters||{}).get('date')) || new Date().toISOString().slice(0,10);
    const jsonPath = path.join(process.cwd(), 'public', 'data', 'nfl', 'schedule-2025.sample.json');
    const raw = await readFile(jsonPath, 'utf8');
    const sched = JSON.parse(raw);

    const d = new Date(date);
    const week = (sched.weeks || []).find(w => new Date(w.start) <= d && d <= new Date(w.end)) || sched.weeks[0];
    return { statusCode:200, body: JSON.stringify({ ok:true, week, games: week.games }) };
  }catch(e){
    return { statusCode:200, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
}
