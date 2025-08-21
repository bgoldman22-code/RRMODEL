
import { loadMetrics, scoreNegCorr, suggestLines } from './engine.js';

const $pick = document.getElementById('pick');
const $banner = document.getElementById('banner');
const $tbody = document.querySelector('#table tbody');

function defaultThursday(){
  const d = new Date();
  const diff = (4 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0,10);
}
$pick.value = defaultThursday();

async function loadWindow(){
  try{
    const d = $pick.value;
    const res = await fetch('/.netlify/functions/nfl-schedule-local?date='+d);
    const j = await res.json();
    $banner.textContent = `Week ${j.week} • ${j.start} → ${j.end} • Games: ${j.games}`;
  }catch(e){
    $banner.textContent = '';
  }
}

async function render(){
  await loadWindow();
  const metrics = await loadMetrics();
  const rows = scoreNegCorr(metrics);
  $tbody.innerHTML = '';
  for(const r of rows){
    const lines = suggestLines(r);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${r.player}</strong> <span class="muted">(${r.team})</span></td>
      <td>ALT <span class="tag">${lines.altRecFloor}+</span> recs  +  Under ${lines.ydsLine}.5 yds
          <span class="tiny">score ${r.profiles.receptionsOver_yardsUnder}</span></td>
      <td>Under ${lines.recLine}.5 recs  +  Over ${lines.ydsLine}.5 yds
          <span class="tiny">score ${r.profiles.receptionsUnder_yardsOver}</span></td>
      <td class="tiny">${r.role} • ${r.seasons}</td>
    `;
    $tbody.appendChild(tr);
  }
}
$pick.addEventListener('change', render);
render();
