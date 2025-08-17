// netlify/functions/_lib/fanduel-hr.mjs
const API = 'https://api.the-odds-api.com/v4/sports/baseball_mlb';
const BOOKMAKER = 'fanduel';
export async function fetchFanDuelHrOdds(eventMap) {
  const key = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;
  if (!key || !eventMap || eventMap.size === 0) return new Map();
  const out = new Map();
  for (const [gameId, eventId] of eventMap.entries()) {
    try {
      const url = `${API}/events/${eventId}/odds?regions=us&markets=player_props&bookmakers=${BOOKMAKER}&apiKey=${key}`;
      const res = await fetch(url, { headers: { 'accept': 'application/json' } });
      if (!res.ok) continue;
      const data = await res.json();
      const byPlayer = new Map();
      const book = (data.bookmakers || []).find(b => (b.key || '').toLowerCase() === BOOKMAKER);
      if (book) {
        for (const m of (book.markets || [])) {
          const mk = (m.key || m.name || '').toLowerCase();
          if (mk.includes('home') && mk.includes('run')) {
            for (const o of (m.outcomes || [])) {
              const name = String(o.name || o.description || o.participant || '').trim().toLowerCase();
              const american = toAmerican(o.price ?? o.american ?? o.odds ?? null);
              if (name && Number.isFinite(american)) byPlayer.set(name, american);
            }
          }
        }
      }
      out.set(gameId, byPlayer);
    } catch {}
  }
  return out;
}
function toAmerican(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) >= 100) return Math.trunc(n);
  if (n > 1) return n >= 2 ? Math.round((n - 1) * 100) : Math.round(-100 / (n - 1));
  return null;
}
export function normName(s) { return String(s || '').trim().toLowerCase(); }
export function americanToProb(american){
  const a = Number(american);
  if (!Number.isFinite(a)) return null;
  return a > 0 ? 100 / (a + 100) : (-a) / ((-a) + 100);
}
