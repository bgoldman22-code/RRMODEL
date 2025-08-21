
const fs=require('fs');const path=require('path');
exports.handler=async (event)=>{
  try{
    const d=(event.queryStringParameters||{}).date || new Date().toISOString().substring(0,10);
    const p=path.join(process.cwd(),'public','data','nfl','schedule-2025.sample.json');
    const w=JSON.parse(fs.readFileSync(p,'utf8')).weeks||[];
    const hit=w.find(x=>d>=x.start && d<=x.end) || w[0] || {week:1,start:d,end:d,games:0};
    return {statusCode:200, body:JSON.stringify({week:hit.week,start:hit.start,end:hit.end,games:hit.games})};
  }catch(e){return{statusCode:200,body:JSON.stringify({week:1,start:d,end:d,games:0,error:String(e)})};}
};
