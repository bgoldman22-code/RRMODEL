const { createBlob } = require('@netlify/blobs');
const SLUGGERS = new Set([
  'Aaron Judge','Shohei Ohtani','Juan Soto','Kyle Schwarber','Yordan Alvarez',
  'Vladimir Guerrero Jr.','Giancarlo Stanton','Freddie Freeman','Ronald Acuña Jr.',
  'Corey Seager','Rafael Devers','Pete Alonso','Austin Riley','Matt Olson',
  'Mookie Betts','Adolis García','Marcell Ozuna','José Ramírez','Bryce Harper',
  'Fernando Tatis Jr.','Julio Rodríguez','Bo Bichette','Manny Machado','Nolan Arenado'
]);

const CAPS = {
  maxProb: 0.60,
  maxAdjBump: 0.03,
  sluggerFloorAdd: 0.025,
  clusterAdd: 0.018
};

function cap(x, lo=0, hi=1) { return Math.max(lo, Math.min(hi, x)); }
function clone(obj){ return JSON.parse(JSON.stringify(obj)); }

function applyLineupValidation(picks, knownOut=[]) {
  const outSet = new Set((knownOut||[]).map(x => (x||'').toLowerCase()));
  return picks.filter(p => {
    const nm = (p.player||'').toLowerCase();
    const ls = (p.lineup_status||'').toUpperCase();
    if (outSet.has(nm)) return false;
    if (ls === 'OUT' || ls === 'IL') return false;
    return true;
  });
}

function applySluggerFloor(pick){
  const isSlugger = SLUGGERS.has(pick.player);
  if (!isSlugger) return { applied:false, newProb: pick.model_hrp };
  const base = Number(pick.model_hrp||0);
  if (base < 0.16 && !(pick.ev_positive)) return { applied:false, newProb: base };
  const bumped = cap(base + CAPS.sluggerFloorAdd, 0, CAPS.maxProb);
  return { applied:true, newProb: bumped };
}

function computeTeamStats(picks){
  const byTeam = {};
  for (const p of picks){
    const t = p.team || p.team_abbr || 'UNK';
    if (!byTeam[t]) byTeam[t] = { strong:0, list:[] };
    if ((p.model_hrp||0) >= 0.26) byTeam[t].strong++;
    byTeam[t].list.push(p);
  }
  return byTeam;
}

function applyClusterBumps(picks){
  const byTeam = computeTeamStats(picks);
  const boosted = new Set();
  for (const [team, info] of Object.entries(byTeam)){
    if (info.strong >= 2){
      for (const p of info.list){
        const base = Number(p.model_hrp||0);
        if (base >= 0.14){
          const newP = cap(base + CAPS.clusterAdd, 0, CAPS.maxProb);
          if (newP > base + 1e-9){
            p.model_hrp_adjusted = newP;
            boosted.add(p.player);
          }
        }
      }
    }
  }
  return { boosted: Array.from(boosted) };
}

function finalizeAdjusted(picks, flagsByPlayer){
  return picks.map(p => {
    const base = Number(p.model_hrp||0);
    let proposed = Number(p.model_hrp_adjusted||base);
    let totalBump = proposed - base;
    if (totalBump > CAPS.maxAdjBump) {
      proposed = base + CAPS.maxAdjBump;
    }
    return { ...p, model_hrp_final: proposed, flags: flagsByPlayer[p.player] || {} };
  });
}

function buildTracks(baselinePicks, knownOut=[]) {
  const valid = applyLineupValidation(baselinePicks, knownOut);

  const control = valid.map(p => ({
    ...clone(p),
    model_hrp_final: Number(p.model_hrp||0),
    flags: { removed_by_lineup_validation:false, slugger_floor:false, cluster_bump:false }
  }));

  const adjusted = clone(valid);
  const flags = {};
  for (const p of adjusted){
    flags[p.player] = { removed_by_lineup_validation:false, slugger_floor:false, cluster_bump:false };
    const res = applySluggerFloor(p);
    if (res.applied){
      p.model_hrp_adjusted = res.newProb;
      flags[p.player].slugger_floor = true;
    }
  }
  const { boosted } = applyClusterBumps(adjusted);
  for (const name of boosted){
    if (!flags[name]) flags[name] = { removed_by_lineup_validation:false, slugger_floor:false, cluster_bump:false };
    flags[name].cluster_bump = true;
  }
  const adjustedFinal = finalizeAdjusted(adjusted, flags);

  return { control, adjusted: adjustedFinal };
}

function isoDateET(date=new Date(), offsetMin=-240){
  const dt = new Date(date.getTime() + offsetMin*60000);
  return dt.toISOString().slice(0,10);
}

async function writeExperiment(dayIso, trackName, payload){
  const key = `mlb-hr/experiments/${dayIso}/${trackName}.json`;
  await createBlob({ key, data: Buffer.from(JSON.stringify(payload,null,2)), contentType:'application/json' });
  return key;
}

module.exports = { buildTracks, isoDateET, writeExperiment, CAPS };
