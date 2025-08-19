// netlify/functions/mlb-learn-batch.mjs
const json = (b) => ({ statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify(b) });

function datesBetween(start, end){
  const out = [];
  const s = new Date(start+"T00:00:00Z");
  const e = new Date(end+"T00:00:00Z");
  for (let d = s; d <= e; d = new Date(d.getTime()+86400000)){
    out.push(d.toISOString().slice(0,10));
  }
  return out;
}

export const handler = async (event) => {
  const qp = event?.queryStringParameters || {};
  const start = qp.start;
  const end = qp.end || start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start||"")) return json({ ok:false, error:"missing or invalid ?start=YYYY-MM-DD" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end||"")) return json({ ok:false, error:"missing or invalid ?end=YYYY-MM-DD" });

  const urls = datesBetween(start, end).map(d => `/.netlify/functions/mlb-learn?date=${d}`);
  return json({ ok:true, urls });
};
