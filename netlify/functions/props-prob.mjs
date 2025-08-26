
// netlify/functions/props-prob.mjs
import { getBlobsStore } from "./_blobs.js";

function impliedFromAmerican(a){ a=Number(a); if(!Number.isFinite(a)) return null; return a>0? 100/(a+100) : Math.abs(a)/(Math.abs(a)+100); }
function ev(prob, amer){ const q=1-prob; const mult = amer>0? amer/100 : 100/Math.abs(amer); return prob*mult - q; }
function norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g,"'").replace(/[.]/g,"").replace(/,+/g,"").replace(/\s+/g," ").trim();}

// Conservative park bumps (align later with your HR model)
const PARK_MULT_TB = [["coors field",1.25],["great american ball park",1.12],["yankee stadium",1.10]];
const PARK_MULT_HRRBI = [["coors field",1.12],["great american ball park",1.07],["yankee stadium",1.05]];
function parkMult(park, tbl){
  const p = String(park||"").toLowerCase();
  for (const [name,m] of tbl){ if (p.includes(name)) return m; }
  return 1.00;
}

export const handler = async (event) => {
  const q = event.queryStringParameters || {};
  const market = (q.market || "tb").toLowerCase(); // tb or hrrbi
  const oddsKey = market === "hrrbi" ? "props/latest_hrrbi.json" : "props/latest_tb.json";
  const statsMetric = market;
  const store = getBlobsStore();
  const oddsMap = await store.getJSON(oddsKey) || {};
  const stats = await (await fetch(`/.netlify/functions/props-stats?metric=${statsMetric}`)).json().catch(()=>({players:{}}));

  const rows = [];
  for (const [key, v] of Object.entries(oddsMap)){
    const amer = Number(v?.median_american);
    if (!Number.isFinite(amer)) continue;
    const meta = stats.players?.[key] || {};
    // Baseline μ
    const base = market==="tb" ? (meta.tbPerGame || 1.2) : (meta.hrrbiPerGame || 1.6);
    // Form ratio (last 15 vs season), clamped
    const r = market==="tb" ? (meta.recentTbPerGame || base) : (meta.recentHRRBIPerGame || base);
    const form = Math.max(0.85, Math.min(1.25, r / (base || 1)));
    // Park bump (placeholder until we wire active park)
    const parkM = market==="tb" ? parkMult(meta.park, PARK_MULT_TB) : parkMult(meta.park, PARK_MULT_HRRBI);
    // Opponent pitcher adjustment: placeholder 1.00 (can be brought in via schedule/probable pitchers)
    const opp = 1.00;
    // Final μ
    const mu = base * form * parkM * opp;
    const pOver = 1 - Math.exp(-mu) * (1 + mu);
    rows.push({
      key, american: amer, p: Math.max(0, Math.min(0.95, pOver)) , ev: ev(pOver, amer),
      why: `μ≈${mu.toFixed(2)} (${market}) • form x${form.toFixed(2)} • park x${parkM.toFixed(2)} • odds ${amer>0? "+"+amer:amer}`
    });
  }
  rows.sort((a,b)=> b.ev - a.ev);
  return { statusCode:200, headers:{"content-type":"application/json"}, body: JSON.stringify({ ok:true, market, count: rows.length, rows }) };
};
