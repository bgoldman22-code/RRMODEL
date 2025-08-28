// netlify/functions/_lib/extensions-bvp.mjs
const MLB_BASE = "https://statsapi.mlb.com/api/v1";
async function safeFetchJson(url, timeoutMs = 7000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) { return null; } finally { clearTimeout(t); }
}
function pickIds(row) {
  const b = row.batterId ?? row.batterID ?? row.playerId ?? row.playerID ?? row.player_id ?? row.batter ?? null;
  const p = row.pitcherId ?? row.pitcherID ?? row.spId ?? row.spID ?? row.pitcher_id ?? row.sp ?? null;
  return { batterId: b, pitcherId: p };
}
export async function bvpMultiplier(row) {
  const { batterId, pitcherId } = pickIds(row);
  if (!batterId || !pitcherId) return { mul: 1.0, applied: false };
  const url = `${MLB_BASE}/people/${batterId}/stats?stats=vsPlayer&group=hitting&gameType=R&opposingPlayerId=${pitcherId}`;
  const data = await safeFetchJson(url);
  if (!data || !Array.isArray(data.stats)) return { mul: 1.0, applied: false };
  let stat = null, seasonStat = null;
  for (const s of data.stats) {
    if (s.type?.displayName === "vsPlayerTotal" && s.splits && s.splits[0]?.stat) stat = s.splits[0].stat;
    if (s.type?.displayName === "vsPlayer" && s.splits && s.splits.length) seasonStat = s.splits[0].stat;
  }
  const st = stat || seasonStat;
  if (!st) return { mul: 1.0, applied: false };
  const pa = Number(st.plateAppearances || st.atBats || 0);
  const hr = Number(st.homeRuns || 0);
  if (!pa || pa < 6) return { mul: 1.0, applied: false, pa, hr };
  const hrRate = hr / pa;
  const lgHR = 0.045;
  const raw = hrRate / lgHR;
  const w = Math.max(0, Math.min(1, (pa - 6) / 24));
  let mul = 1 + (w * 0.25 * (raw - 1));
  mul = Math.max(0.90, Math.min(1.10, mul));
  return { mul, applied: Math.abs(mul-1)>0.001, pa, hr };
}
