// netlify/functions/lib/bvp.mjs
import { fetchJSON } from "./fetch-json.mjs";

/**
 * Fetch batter-vs-pitcher totals from MLB Stats API.
 * Returns: { ab, h, hr } or null if unavailable.
 */
export async function fetchBvP(batterId, pitcherId) {
  try {
    if (!batterId || !pitcherId) return null;
    const url = `https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=vsPlayer&group=hitting&gameType=R&opposingPlayerId=${pitcherId}`;
    const data = await fetchJSON(url, { timeoutMs: 8000 });
    const arr = data?.stats?.find(s => s?.type?.displayName === "vsPlayer")?.splits || [];
    if (!arr.length) return null;
    // Aggregate totals across seasons if multiple splits exist
    let ab = 0, h = 0, hr = 0;
    for (const s of arr) {
      const st = s?.stat || {};
      ab += Number(st.atBats || 0);
      h  += Number(st.hits || 0);
      hr += Number(st.homeRuns || 0);
    }
    if (ab <= 0) return null;
    return { ab, h, hr };
  } catch {
    return null;
  }
}
