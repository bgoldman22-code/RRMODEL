
const fs = require('fs');
const path = require('path');
exports.handler = async (event) => {
  try{
    const q = event.queryStringParameters || {};
    const d = q.date || new Date().toISOString().slice(0,10);
    const p = path.join(process.cwd(),'public','data','nfl','schedule-2025.sample.json');
    const raw = fs.readFileSync(p,'utf8');
    const obj = JSON.parse(raw);
    const weeks = obj.weeks || [];
    const w = weeks.find(x => d >= x.start && d <= x.end) || weeks[0];
    return { statusCode:200, body: JSON.stringify(w) };
  }catch(e){
    return { statusCode:200, body: JSON.stringify({week:1,start:d,end:d,games:0,err:String(e)})};
  }
}
