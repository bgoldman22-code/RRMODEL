import fetch from 'node-fetch';
const MLB_STATS_BASE = 'https://statsapi.mlb.com/api/v1';

// Returns {ab, h, hr} or null. Uses opposingPlayerId per MLB API.
export async function fetchBvP(batterId, pitcherId) {
  if (!batterId || !pitcherId) return null;
  const url = `${MLB_STATS_BASE}/people/${batterId}/stats?stats=vsPlayer&group=hitting&gameType=R&opposingPlayerId=${pitcherId}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'roundrobin-app' }, timeout: 8000 });
    if (!r.ok) return null;
    const j = await r.json();
    const splits = j?.stats?.find(s => s?.type?.displayName === 'vsPlayer')?.splits || [];
    const stat = splits[0]?.stat;
    if (!stat) return null;
    const ab = Number(stat.atBats || 0);
    const h = Number(stat.hits || 0);
    const hr = Number(stat.homeRuns || 0);
    return { ab, h, hr };
  } catch {
    return null;
  }
}
