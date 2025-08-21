// public/nfl-negcorr/app.js
import { scoreRows, suggestLines } from './engine.js';

const $status = document.getElementById('status');
const $table = document.getElementById('table');

async function loadMetrics(){
  const res = await fetch('/data/nfl/negcorr-players.json');
  if(!res.ok) throw new Error('metrics fetch failed');
  return res.json();
}

async function loadOdds(){
  try{
    const r = await fetch('/.netlify/functions/odds-nfl-negcorr');
    if(!r.ok) return { ok:false };
    const j = await r.json();
    return j;
  }catch(e){
    return { ok:false };
  }
}

function rowHtml(r, odds){
  const lines = (odds?.lines?.[r.player]) || suggestLines(r);
  const s1 = r.profiles.recOver_ydsUnder.toFixed(2);
  const s2 = r.profiles.recUnder_ydsOver.toFixed(2);
  const overRec = lines.recLine ?? 4.5;
  const underYds = lines.ydsLine ?? 50;
  const altFloor = lines.altRecFloor ?? 3;

  return `<tr>
    <td><strong>${r.player}</strong> <span class="meta">(${r.team})</span></td>
    <td><span class="pill">ALT ${altFloor}+</span> &nbsp; + Under <strong>${underYds}.5</strong> yds <span class="meta score">• ${s1}</span></td>
    <td>Under <strong>${overRec}.5</strong> recs &nbsp; + Over <strong>${underYds}.5</strong> yds <span class="meta score">• ${s2}</span></td>
    <td class="meta">${r.role} • ${r.seasons}</td>
  </tr>`;
}

function render(rows, odds){
  $status.innerHTML = odds?.ok
    ? `<span class="ok">Using TheOddsAPI</span>`
    : `<span class="warn">Odds-agnostic mode</span>`;

  const head = `<table>
    <thead><tr>
      <th>Player</th><th>Receptions Over + Yards Under</th><th>Receptions Under + Yards Over</th><th>Role</th>
    </tr></thead><tbody>`;
  const body = rows.map(r => rowHtml(r, odds)).join('');
  const foot = `</tbody></table>`;
  $table.innerHTML = head + body + foot;
}

(async function init(){
  try{
    const [metrics, odds] = await Promise.all([loadMetrics(), loadOdds()]);
    const rows = scoreRows(metrics);
    render(rows, odds);
  }catch(e){
    $status.innerHTML = `<span class="err">Error: ${e?.message||e}</span>`;
  }
})();
