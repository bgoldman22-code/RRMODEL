
// public/nfl-negcorr/engine.js
// NegCorr scoring with matchup awareness. Odds-free, static-friendly.

export function zscore(arr, v){
  const n = arr.length || 1;
  const mean = arr.reduce((a,b)=>a+Number(b||0),0)/n;
  const varsum = arr.reduce((s,x)=>{const d = Number(x||0)-mean; return s + d*d;},0);
  const sd = Math.sqrt(varsum/Math.max(1,n-1)) || 1;
  return (Number(v||0) - mean)/sd;
}

// Robust fetch that tries multiple sources, returns first good JSON.
export async function tryFetchJSON(urls){
  for(const u of urls){
    try{
      const r = await fetch(u, { cache: 'no-store' });
      if(r.ok){
        const j = await r.json();
        // sanity check object-ness
        if(j && typeof j === 'object') return { ok:true, data:j, source:u };
      }
    }catch(_){}
  }
  return { ok:false };
}

// Normalize schedule shapes to { week, start, end, games, matchups:[{home,away}] }
export function normalizeSchedule(obj, pickDateISO){
  const iso = pickDateISO || new Date().toISOString().slice(0,10);
  // Case A: already window object
  if(obj.week && obj.matchups) return obj;

  // Case B: season with weeks[]
  if(Array.isArray(obj.weeks)){
    const hit = obj.weeks.find(w => iso >= w.start && iso <= w.end) || obj.weeks[0];
    return { week: hit.week, start: hit.start, end: hit.end, games: hit.games|| (hit.matchups?hit.matchups.length:0), matchups: hit.matchups || [] };
  }

  // Case C: schedule.latest style
  if(Array.isArray(obj.matchups) && obj.window){
    const w = obj.window || {};
    return { week: w.week || 1, start: w.start || iso, end: w.end || iso, games: (obj.matchups||[]).length, matchups: obj.matchups };
  }

  return null;
}

// Load data sets with fallbacks: players, defenses, QBs
export async function loadDataSets(){
  const playersUrls = [
    '/data/nfl/player_metrics_3y.json',
    '/data/nfl/player_metrics_small.json'
  ];
  const defenseUrls = [
    '/data/nfl/defense_profiles_2025.json',
    '/data/nfl/defense_profiles_small.json'
  ];
  const qbUrls = [
    '/data/nfl/qb_tendencies_2025.json',
    '/data/nfl/qb_tendencies_small.json'
  ];

  const [p, d, q] = await Promise.all([
    tryFetchJSON(playersUrls),
    tryFetchJSON(defenseUrls),
    tryFetchJSON(qbUrls)
  ]);

  return {
    players: (p.ok ? p.data : []),
    defenses: (d.ok ? d.data : []),
    qbs: (q.ok ? q.data : []),
    sources: { players: p.ok && p.source, defenses: d.ok && d.source, qbs: q.ok && q.source }
  };
}

// Build maps
export function indexBy(arr, key){ const m = {}; for(const x of arr||[]) m[(x[key]||'').toUpperCase()] = x; return m; }

export function computeScoresForWeek({players, defenses, qbs}, matchups){
  const arr = (players||[]).filter(p => p.pos !== 'QB');
  if(!arr.length) return [];

  const byTeam = indexBy(arr, 'team');
  const defByTeam = indexBy(defenses||[], 'team');
  const qbByTeam = indexBy(qbs||[], 'team');

  const adots = arr.map(m => Number(m.aDOT||0));
  const tshares = arr.map(m => Number(m.target_share||0));
  const yprs = arr.map(m => Number(m.yards_per_rec||0));
  const catchRates = arr.map(m => Number(m.catch_rate||0));

  const teamsInWeek = new Set();
  for(const g of (matchups||[])){
    teamsInWeek.add((g.home||'').toUpperCase());
    teamsInWeek.add((g.away||'').toUpperCase());
  }

  // Collect one or two WRs per team in week if present in dataset
  const candidates = arr.filter(m => teamsInWeek.has((m.team||'').toUpperCase()));

  const rows = [];
  for(const m of candidates){
    // Base profile scores
    const base_overRec_underYds = zscore(tshares, m.target_share) + zscore(catchRates, m.catch_rate) - zscore(adots, m.aDOT) - zscore(yprs, m.yards_per_rec);
    const base_underRec_overYds = zscore(adots, m.aDOT) + zscore(yprs, m.yards_per_rec) - zscore(tshares, m.target_share);

    // Opponent detection (simple: if player's team is home, opp = away; else opp=home in its game)
    // Find game containing this team
    const game = (matchups||[]).find(g => (g.home||'').toUpperCase() === (m.team||'').toUpperCase() || (g.away||'').toUpperCase() === (m.team||'').toUpperCase());
    const opp = game ? ((game.home||'').toUpperCase() === (m.team||'').toUpperCase() ? (game.away||'').toUpperCase() : (game.home||'').toUpperCase()) : null;

    const def = opp ? defByTeam[opp] : null;
    const qb = qbByTeam[(m.team||'').toUpperCase()] || null;

    // Matchup adjustments (defensive profile)
    // Weights are modest so base profile still matters.
    let adj1 = 0, adj2 = 0;
    if(def){
      // Higher completion -> favors Over rec + Under yds
      adj1 += ((def.comp_allowed || 0) - 0.63) * 1.0; // baseline ~63%
      // Lower YPA allowed -> favors Under yds (for path 1)
      adj1 += ( (6.5 - (def.ypa_allowed || 6.5)) ) * 0.25;
      // Higher explosive pass rate allowed -> favors Under rec + Over yds
      adj2 += ((def.explosive_allowed || 0) - 0.10) * 2.0; // baseline ~10%
      // Higher aDOT allowed -> favors path 2
      adj2 += ((def.adot_allowed || 8.5) - 8.5) * 0.25;
      // Zone-heavy -> checkdowns (path 1), Man-heavy -> deep shots (path 2)
      adj1 += ((def.zone_rate || 0.60) - 0.60) * 0.8;
      adj2 += ((def.man_rate || 0.40) - 0.40) * 0.8;
    }

    // QB tendencies
    if(qb){
      adj1 += ((7.0 - (qb.adot || 7.0)) * 0.30);   // lower QB aDOT helps path 1
      adj1 += ((qb.attempts || 34) - 34) * 0.02;   // more attempts => more receptions
      adj2 += ((qb.adot || 7.0) - 7.0) * 0.30;     // higher QB aDOT helps path 2
    }

    const s1 = Number((base_overRec_underYds + adj1).toFixed(2));
    const s2 = Number((base_underRec_overYds + adj2).toFixed(2));

    rows.push({
      player: m.player,
      team: m.team,
      seasons: m.seasons,
      role: m.role,
      profiles: {
        receptionsOver_yardsUnder: s1,
        receptionsUnder_yardsOver: s2,
      }
    });
  }

  // Sort by strongest path-1 preference by default
  return rows.sort((a,b)=> b.profiles.receptionsOver_yardsUnder - a.profiles.receptionsOver_yardsUnder);
}

export function suggestLines(m){
  const role = (m.role||'').toLowerCase();
  let altRecFloor=3, recLine=4.5, ydsLine=50;
  if(role.includes('alpha-possession')){ altRecFloor=5; recLine=6.5; ydsLine=58; }
  if(role.includes('alpha-deep')){ altRecFloor=3; recLine=4.5; ydsLine=56; }
  if(role.includes('speed')){ altRecFloor=2; recLine=3.5; ydsLine=34; }
  if(role.includes('rookie') || role.includes('possession-wing')){ altRecFloor=2; recLine=3.5; ydsLine=30; }
  return { altRecFloor, recLine, ydsLine };
}
