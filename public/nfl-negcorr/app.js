
// public/nfl-negcorr/app.js
import { tryFetchJSON, normalizeSchedule, loadDataSets, computeScoresForWeek, suggestLines } from './engine.js';

const SCHEDULE_SOURCES = (dateISO) => [
  `/.netlify/functions/nfl-td-schedule?date=${dateISO}`,     // preferred if exists in your repo
  `/.netlify/functions/nfl-schedule?date=${dateISO}`,        // generic alt
  '/data/nfl/schedule-2025.json',                            // TD local file (if present)
  '/data/nfl/schedule.latest.json',
  '/data/nfl/schedule-2025.sample.json'                      // fallback (from our previous patch)
];

function el(q){ return document.querySelector(q); }

async function init(){
  // UI refs
  const dateInput = el('#pickDate');
  const header = el('#windowHeader');
  const tbody = el('#rows');

  // Default start (Week 1): 2025-09-04
  const defaultStart = '2025-09-04';
  dateInput.value = defaultStart;

  // 1) Resolve schedule (prefer TD scheduler)
  const urls = SCHEDULE_SOURCES(dateInput.value);
  const schedRes = await tryFetchJSON(urls);
  let window = normalizeSchedule(schedRes.data || {}, dateInput.value);
  if(!window){
    // hard fallback to a simple Week 1 window
    window = { week: 1, start: '2025-09-04', end: '2025-09-08', games: 16, matchups: [] };
  }
  header.textContent = `Week ${window.week} • ${window.start} → ${window.end} • Games: ${window.games || (window.matchups||[]).length}`;

  // 2) Load datasets (players/defenses/QBs) and compute scores for teams in week
  const data = await loadDataSets();
  const rows = computeScoresForWeek(data, window.matchups||[]);

  // 3) Render table
  tbody.innerHTML = '';
  for(const r of rows){
    const lines = suggestLines(r);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px">${r.player} <span class="dim">(${r.team})</span></td>
      <td class="px">ALT ${lines.altRecFloor}+ recs  +  Under ${lines.ydsLine}.5 yds <span class="dim">• ${r.profiles.receptionsOver_yardsUnder}</span></td>
      <td class="px">Under ${lines.recLine}.5 recs  +  Over ${lines.ydsLine}.5 yds <span class="dim">• ${r.profiles.receptionsUnder_yardsOver}</span></td>
      <td class="px"><span class="dim">${r.role} • ${r.seasons}</span></td>
    `;
    tbody.appendChild(tr);
  }

  // wire date change (will attempt schedule fetch again)
  dateInput.addEventListener('change', async (e)=>{
    const iso = e.target.value;
    const urls2 = SCHEDULE_SOURCES(iso);
    const sched2 = await tryFetchJSON(urls2);
    let w2 = normalizeSchedule(sched2.data || {}, iso) || window;
    header.textContent = `Week ${w2.week} • ${w2.start} → ${w2.end} • Games: ${w2.games || (w2.matchups||[]).length}`;
  });
}

init();
