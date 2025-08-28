import { applyBvpPolicy } from "./bvp-policy.mjs";

export async function fetchBvpRaw({ batterId, pitcherId }){
  const url = `https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=vsPlayer&group=hitting&gameType=R&opposingPlayerId=${pitcherId}`;
  const r = await fetch(url, { headers: { "accept":"application/json" } });
  if (!r.ok) return { pa:0, hr:0, avg:0, slg:0, ops:0 };
  const j = await r.json();
  const group = j?.stats?.find(s => s.type?.displayName === "vsPlayer");
  const split = group?.splits?.[0];
  const s = split?.stat;
  if (!s) return { pa:0, hr:0, avg:0, slg:0, ops:0 };
  const num = k => Number((s[k] ?? 0));
  const parseDec = k => Number(String(s[k]||"0").replace(/^\./,"0."));
  return {
    pa: num("plateAppearances"),
    hr: num("homeRuns"),
    avg: parseDec("avg"),
    slg: parseDec("slg"),
    ops: parseDec("ops"),
  };
}

export async function applyBvp({ batterId, pitcherId, baseProb }){
  const raw = await fetchBvpRaw({ batterId, pitcherId });
  const pol = applyBvpPolicy(raw, baseProb);
  if (!pol.applied) return { applied:false, bvpMul:1.0, explain:"" };
  return { applied:true, ...pol };
}
