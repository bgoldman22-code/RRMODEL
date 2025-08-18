export async function fetchDailyOdds(dateStr){
  const qs = dateStr ? `?date=${encodeURIComponent(dateStr)}` : '';
  try{
    const r = await fetch(`/.netlify/functions/odds-get${qs}`);
    if(!r.ok) return null;
    return await r.json();
  }catch(e){ return null; }
}

export function mapOdds(snapshot){
  const out = new Map();
  if (!snapshot || !snapshot.players) return out;
  for (const [name, rec] of Object.entries(snapshot.players)){
    out.set(String(name).toLowerCase(), rec);
  }
  return out;
}
