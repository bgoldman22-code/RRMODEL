// src/utils/model_scalers.js
export const ENABLE_PITCH_EDGE = true;

const NEUTRAL_XISO = 0.160;
const SHRINK_PA = 40;

const PITCH_ALIAS = {
  FF: "FF", FA: "FF", FOUR_SEAM: "FF", "4S": "FF",
  SI: "SI", FT: "SI", "2S": "SI", SINKER: "SI",
  SL: "SL", SW: "SL", SWEEPER: "SL",
  CU: "CU", KC: "CU", CURVEBALL: "CU",
  CH: "CH", CHANGEUP: "CH",
  FC: "CT", CT: "CT", CUTTER: "CT",
};

function normPitch(p){ if(!p) return null; const k=String(p).toUpperCase(); return PITCH_ALIAS[k] || k; }

export function pitchTypeEdgeMultiplier(input){
  try{
    if(!ENABLE_PITCH_EDGE) return 1.00;
    const hvp = input?.hitter_vs_pitch || input?.hitterVsPitch || [];
    const pitches = input?.pitcher?.primary_pitches || input?.pitcher?.primaryPitches || [];
    if(!hvp.length || !pitches.length) return 1.00;

    const byPitch = new Map();
    for(const h of hvp){
      if(!h) continue;
      const key = normPitch(h.pitch);
      if(!key) continue;
      const pa = Number(h.sample_pa ?? h.pa ?? 0);
      const x  = (h.xiso==null)? null : Number(h.xiso);
      if(!(pa>=0) || x==null || !isFinite(x)) continue;
      const shrunk = (x*pa + NEUTRAL_XISO*SHRINK_PA) / (pa + SHRINK_PA);
      byPitch.set(key, { xiso: shrunk, pa });
    }

    const top = [...pitches]
      .map(p=>({ pitch: normPitch(p.pitch), usage: Number(p.usage||0) }))
      .filter(p=>p.pitch && p.usage>0)
      .sort((a,b)=> b.usage - a.usage)
      .slice(0,3);
    if(!top.length) return 1.00;

    let acc=0, used=0;
    for(const p of top){
      const hp = byPitch.get(p.pitch);
      if(!hp) continue;
      const usage = Math.max(0, Math.min(1, p.usage));
      const edge = (hp.xiso - NEUTRAL_XISO) / NEUTRAL_XISO;
      acc += edge * usage;
      used += usage;
    }
    if(!used) return 1.00;

    const raw = 1 + acc * 0.35;
    return Math.max(0.90, Math.min(1.15, raw));
  }catch{
    return 1.00;
  }
}
