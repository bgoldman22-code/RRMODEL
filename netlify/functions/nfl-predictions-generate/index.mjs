// netlify/functions/nfl-predictions-generate/index.mjs
import { openStore, loadJSON } from "../_lib/blobs-helper.mjs";

const BASE = "https://bgroundrobin.com"; // per user request: hardcode
const GAMES_CSV = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";

// simple CSV parser (no external dep)
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(",");
  return lines.map(line => {
    const cols = [];
    let cur = "", inQ = false;
    for (let i=0;i<line.length;i++){
      const ch = line[i];
      if (ch === '"'){
        if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ){
        cols.push(cur); cur="";
      } else cur += ch;
    }
    cols.push(cur);
    const row = {};
    header.forEach((h,idx)=> row[h] = cols[idx]);
    return row;
  });
}

function sigmoid(x){ return 1/(1+Math.exp(-x)); }

function computeTeamForm(rows, maxGames=10){
  // rows expected sorted by season, week ascending
  const form = {}; const history = {};
  for (const r of rows){
    const home = r.home_team, away = r.away_team;
    const hs = Number(r.home_score||0), as = Number(r.away_score||0);
    if (!home || !away) continue;
    const diffHome = hs - as;
    const diffAway = as - hs;
    history[home] = history[home] || [];
    history[away] = history[away] || [];
    history[home].push(diffHome);
    history[away].push(diffAway);
    if (history[home].length>maxGames) history[home].shift();
    if (history[away].length>maxGames) history[away].shift();
    const avg = arr => arr.length? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
    form[home] = avg(history[home]);
    form[away] = avg(history[away]);
  }
  return form;
}

async function getSchedule(){
  // rely on your existing lambda for schedule
  const url = BASE + "/.netlify/functions/nfl-schedule-get";
  const res = await fetch(url);
  if (!res.ok) throw new Error("schedule_fetch_failed");
  const js = await res.json();
  return (js.matchups||[]).map(m => ({
    id: m.id,
    home: m.homeTeam,
    away: m.awayTeam,
    kickoff: m.kickoff
  }));
}

async function loadTeamFormFromBlobs(){
  const store = await openStore({ storeName: process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td' });
  if (!store) return null;
  const tf = await loadJSON(store, "team_form.json");
  return tf;
}

async function buildTeamFormEphemeral(){
  const res = await fetch(GAMES_CSV, { headers: { "Cache-Control":"no-cache" }});
  if (!res.ok) throw new Error("games_csv_fetch_failed");
  const text = await res.text();
  const rows = parseCSV(text)
    .filter(r => r.season && Number(r.season) >= 2023) // recent seasons for speed
    .sort((a,b)=> Number(a.season)-Number(b.season) || Number(a.week||0)-Number(b.week||0));
  return computeTeamForm(rows, 10);
}

function pickRow(match, form){
  const fh = form[match.home] ?? 0;
  const fa = form[match.away] ?? 0;
  const alpha = 0.12; // scaling
  const pAway = sigmoid((fa - fh) * alpha);
  const pHome = 1 - pAway;
  const awayPct = Math.round(pAway*100);
  const homePct = Math.round(pHome*100);
  const pickTeam = (pAway>pHome) ? match.away : match.home;
  const conf = (pAway>pHome) ? awayPct : homePct;
  return {
    id: match.id,
    matchup: match.away.toUpperCase()+" @ "+match.home.toUpperCase(),
    kickoff: match.kickoff,
    moneylineText: pickTeam.toUpperCase(),
    moneylineConf: conf,
    spreadText: "–",
    spreadConf: null,
    totalText: "–",
    totalConf: null,
    debug: { fh, fa, pHome, pAway }
  };
}

export const handler = async (event) => {
  try {
    const force = (event?.queryStringParameters?.force ?? "0") === "1" || event?.queryStringParameters?.force === "true";
    let teamForm = await loadTeamFormFromBlobs();
    if (!teamForm || force){
      // Ephemeral rebuild (does NOT persist)
      teamForm = await buildTeamFormEphemeral();
    }

    const sched = await getSchedule();
    const rows = sched.map(m => pickRow(m, teamForm));
    const body = { ok:true, updated:new Date().toISOString(), meta:{ source: teamForm ? "team-form" : "ephemeral" }, rows };
    return { statusCode:200, headers: { "content-type":"application/json" }, body: JSON.stringify(body) };
  } catch (e){
    return { statusCode:500, headers: { "content-type":"application/json" }, body: JSON.stringify({ ok:false, error: String(e?.message||e) }) };
  }
};
