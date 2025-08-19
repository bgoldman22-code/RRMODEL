
import React, { useEffect, useState } from "react";

function pad2(n){ return String(n).padStart(2,"0"); }
function nextThursdayISO(){
  const now = new Date();
  const dow = now.getDay(); // local
  const daysUntilThu = (4 - dow + 7) % 7;
  const cand = new Date(now);
  cand.setDate(now.getDate() + daysUntilThu);
  const y = cand.getFullYear();
  const m = pad2(cand.getMonth()+1);
  const d = pad2(cand.getDate());
  return `${y}-${m}-${d}`;
}

async function safeJSON(url){
  try{
    const r = await fetch(url);
    const t = await r.text();
    if(!r.ok) return null;
    if(!t || t.trim().startsWith('<')) return null;
    return JSON.parse(t);
  }catch{ return null; }
}

export default function NFL(){
  const [date, setDate] = useState(nextThursdayISO());
  const [meta, setMeta] = useState({ games: 0, from: null, to: null });
  const [note, setNote] = useState(null);

  async function refresh(){
    const sch = await safeJSON(`/.netlify/functions/nfl-schedule?date=${date}&mode=week`);
    const games = Array.isArray(sch?.games) ? sch.games : [];
    setMeta({ games: games.length });
    setNote(games.length === 0 ? "No games found in the Thu–Mon window yet." : null);
  }

  useEffect(() => { refresh(); }, [date]);

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-2">NFL Anytime TD — Weekly Window (Thu–Mon)</h1>
      <div className="text-sm text-gray-600 mb-2">
        Pick date (defaults to next Thursday):
      </div>
      <div className="flex items-center gap-2 mb-4">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border px-2 py-1 rounded"/>
        <button onClick={refresh} className="bg-black text-white px-3 py-1 rounded">Refresh</button>
      </div>
      <div className="mb-3 text-sm">
        Games in window: {meta.games}
      </div>
      {note && <div className="text-sm text-amber-700">{note}</div>}
      <div className="mt-6">
        <a href="/nfl-td" className="underline text-blue-600">Go to Anytime TD picks page</a>
      </div>
    </div>
  );
}
