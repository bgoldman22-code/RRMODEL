
// utils/why.js (patched)
// - Robustly resolves the TRUE opponent pitcher for the WHY line
// - Backwards compatible: you don't need to change MLB.jsx
// - Logic:
//   1) If input.opponentPitcher exists -> use it
//   2) Else if input.pitcher exists AND pitcher.team !== batter team -> use it
//   3) Else try to infer from many possible fields (probables, schedule, home/away)
//   4) As a final guard, if we still only have the batter's own pitcher, drop pitcher from WHY

export function buildWhy(input, seed) {
  const rng = seeded(input.player + (input.opponent||"") + (new Date()).toDateString(), seed);
  const parts = [];

  // attach a trustworthy opponent pitcher, if we can find one
  const opponentPitch = resolveOpponentPitcher(input);
  const safeInput = opponentPitch ? {...input, pitcher: opponentPitch} : {...input, pitcher: undefined};

  push(parts, pick(T_BASELINE, rng), safeInput);

  const match = bestPitchMatch(safeInput);
  if (match) push(parts, pick(T_PITCH_MATCH, rng), {...safeInput, ...match});
  else push(parts, pick(T_PITCHER, rng), safeInput);

  const env = envSummary(safeInput);
  if (env) push(parts, pick(T_ENV, rng), {...safeInput, ...env});

  // prefer best/actual odds fields if present
  const impliedProb = (safeInput.implied_prob ?? safeInput.impliedProb ?? null);
  const trueProb = (safeInput.true_hr_prob ?? safeInput.trueProb ?? null);
  const oddsBest = (safeInput.odds_best_american ?? safeInput.actual_american ?? safeInput.american ?? null);
  const evPerUnit = (safeInput.ev_per_unit != null ? safeInput.ev_per_unit
                   : (impliedProb!=null && trueProb!=null && oddsBest!=null ? (trueProb - impliedProb) : null));

  push(parts, pick(T_MARKET, rng), {
    ...safeInput,
    implied_prob: impliedProb,
    true_hr_prob: trueProb,
    odds_best_american: oddsBest,
    ev_per_unit: evPerUnit,
    edge_pts: (impliedProb!=null && trueProb!=null) ? Math.round((trueProb - impliedProb)*1000)/10 : null
  });

  if (safeInput.risk_notes) push(parts, pick(T_RISK, rng), safeInput);

  const text = parts.filter(Boolean).slice(0,5).join(" ");
  return { text, bullets: parts };
}

/** =========================
 *  Pitcher selection logic
 *  ========================= */
function resolveOpponentPitcher(input){
  // 0) Explicit
  if (input?.opponentPitcher) return sanitizePitcher(input.opponentPitcher);

  const batterTeam = (input.team || input.batter_team || input.team_abbr || input.team_code || guessTeamFromGame(input, input.player))?.toUpperCase?.();
  const oppTeam = (input.opp_team || input.opponent_team || input.opponent || guessOppFromGame(input, batterTeam))?.toUpperCase?.();

  // 1) If we already have a pitcher and it is NOT the batter's team, keep it
  if (input?.pitcher && !teamsEqual(input.pitcher?.team, batterTeam)) {
    return sanitizePitcher(input.pitcher);
  }

  // 2) Try common shapes
  // Arrays of probables:
  const probableArrays = [
    input.probables, input.probable_pitchers, input.pitchers, input.game_probables
  ].filter(Boolean);

  for (const arr of probableArrays){
    const found = pickOpponentFromArray(arr, oppTeam, batterTeam);
    if (found) return sanitizePitcher(found);
  }

  // Object shapes with home/away
  const shaped = [
    input.probables_by_team,
    input.game,
    input.matchup,
    input.sched,
  ].filter(Boolean);

  for (const obj of shaped){
    const found = pickOpponentFromObj(obj, oppTeam, batterTeam);
    if (found) return sanitizePitcher(found);
  }

  // Individual fields
  const homeProb = input.home_probable || input.home_pitcher || input.home?.probable_pitcher || input.game?.home?.probable_pitcher;
  const awayProb = input.away_probable || input.away_pitcher || input.away?.probable_pitcher || input.game?.away?.probable_pitcher;

  if (homeProb || awayProb){
    // Determine which side is opponent
    const homeTeam = (input.home_team || input.game?.home_team || input.game?.home?.team || input.home)?.toUpperCase?.();
    const awayTeam = (input.away_team || input.game?.away_team || input.game?.away?.team || input.away)?.toUpperCase?.();

    if (batterTeam && homeTeam && awayTeam){
      if (teamsEqual(batterTeam, homeTeam)) return sanitizePitcher(awayProb);
      if (teamsEqual(batterTeam, awayTeam)) return sanitizePitcher(homeProb);
    }
    // If we know the opponent team, use that directly
    if (oppTeam){
      // attempt to match by team field on pitcher objects
      const oppFromPair = [homeProb, awayProb].find(p => teamsEqual(p?.team, oppTeam));
      if (oppFromPair) return sanitizePitcher(oppFromPair);
    }
  }

  // 3) If we only have a pitcher but it's the same team as batter, drop it to avoid "own pitcher" bug
  if (input?.pitcher && teamsEqual(input.pitcher?.team, batterTeam)) return null;

  // 4) Nothing reliable
  return null;
}

function pickOpponentFromArray(arr, oppTeam, batterTeam){
  if (!Array.isArray(arr)) return null;
  // Prefer an object with team matching opponent
  if (oppTeam){
    const byOpp = arr.find(p => teamsEqual(p?.team, oppTeam));
    if (byOpp) return byOpp;
  }
  // Avoid same-team pitcher
  if (batterTeam){
    const notOwn = arr.find(p => !teamsEqual(p?.team, batterTeam));
    if (notOwn) return notOwn;
  }
  // Fallback: first item
  return arr[0] || null;
}

function pickOpponentFromObj(obj, oppTeam, batterTeam){
  // Support shapes like {HOME:{team:'PHI', probable_pitcher:{...}}, AWAY:{team:'SEA', probable_pitcher:{...}}}
  const home = obj.home || obj.HOME || null;
  const away = obj.away || obj.AWAY || null;

  if (home && away){
    const homeTeam = (home.team || home.team_abbr || home.code || "").toUpperCase?.();
    const awayTeam = (away.team || away.team_abbr || away.code || "").toUpperCase?.();
    if (oppTeam){
      if (teamsEqual(homeTeam, oppTeam)) return home.probable_pitcher || home.pitcher || home.p || null;
      if (teamsEqual(awayTeam, oppTeam)) return away.probable_pitcher || away.pitcher || away.p || null;
    }
    if (batterTeam){
      if (teamsEqual(batterTeam, homeTeam)) return away.probable_pitcher || away.pitcher || away.p || null;
      if (teamsEqual(batterTeam, awayTeam)) return home.probable_pitcher || home.pitcher || home.p || null;
    }
  }

  // Alternate shape: {PHI:{probable:{...}}, SEA:{probable:{...}}}
  if (oppTeam && obj[oppTeam]) {
    return obj[oppTeam].probable_pitcher || obj[oppTeam].probable || obj[oppTeam].pitcher || null;
  }
  return null;
}

function teamsEqual(a,b){
  if (!a || !b) return false;
  const A = a.toString().trim().toUpperCase();
  const B = b.toString().trim().toUpperCase();
  if (A===B) return true;
  // Allow matching full names to codes (very lightweight)
  return normalizeTeam(A) === normalizeTeam(B);
}

function normalizeTeam(t){
  // maps common forms to a simple key
  const map = {
    "ARIZONA DIAMONDBACKS":"ARI","D-BACKS":"ARI","ARI":"ARI","AZ":"ARI","ARIZONA":"ARI",
    "ATLANTA BRAVES":"ATL","ATL":"ATL","ATLANTA":"ATL",
    "BALTIMORE ORIOLES":"BAL","BAL":"BAL","BALTIMORE":"BAL",
    "BOSTON RED SOX":"BOS","BOS":"BOS","BOSTON":"BOS",
    "CHICAGO CUBS":"CHC","CUBS":"CHC","CHC":"CHC",
    "CHICAGO WHITE SOX":"CWS","WHITE SOX":"CWS","CWS":"CWS",
    "CINCINNATI REDS":"CIN","REDS":"CIN","CIN":"CIN",
    "CLEVELAND GUARDIANS":"CLE","GUARDIANS":"CLE","CLE":"CLE",
    "COLORADO ROCKIES":"COL","ROCKIES":"COL","COL":"COL",
    "DETROIT TIGERS":"DET","TIGERS":"DET","DET":"DET",
    "HOUSTON ASTROS":"HOU","ASTROS":"HOU","HOU":"HOU",
    "KANSAS CITY ROYALS":"KC","ROYALS":"KC","KCR":"KC","KC":"KC",
    "LOS ANGELES ANGELS":"LAA","ANGELS":"LAA","LAA":"LAA",
    "LOS ANGELES DODGERS":"LAD","DODGERS":"LAD","LAD":"LAD",
    "MIAMI MARLINS":"MIA","MARLINS":"MIA","MIA":"MIA",
    "MILWAUKEE BREWERS":"MIL","BREWERS":"MIL","MIL":"MIL",
    "MINNESOTA TWINS":"MIN","TWINS":"MIN","MIN":"MIN",
    "NEW YORK METS":"NYM","METS":"NYM","NYM":"NYM",
    "NEW YORK YANKEES":"NYY","YANKEES":"NYY","NYY":"NYY",
    "OAKLAND ATHLETICS":"OAK","ATHLETICS":"OAK","A'S":"OAK","OAK":"OAK","ATH":"OAK",
    "PHILADELPHIA PHILLIES":"PHI","PHILLIES":"PHI","PHI":"PHI",
    "PITTSBURGH PIRATES":"PIT","PIRATES":"PIT","PIT":"PIT",
    "SAN DIEGO PADRES":"SD","PADRES":"SD","SD":"SD","SDP":"SD",
    "SAN FRANCISCO GIANTS":"SF","GIANTS":"SF","SF":"SF","SFG":"SF",
    "SEATTLE MARINERS":"SEA","MARINERS":"SEA","SEA":"SEA",
    "ST. LOUIS CARDINALS":"STL","CARDINALS":"STL","STL":"STL",
    "TAMPA BAY RAYS":"TB","RAYS":"TB","TB":"TB","TBR":"TB",
    "TEXAS RANGERS":"TEX","RANGERS":"TEX","TEX":"TEX",
    "TORONTO BLUE JAYS":"TOR","BLUE JAYS":"TOR","TOR":"TOR",
    "WASHINGTON NATIONALS":"WSH","NATIONALS":"WSH","WSH":"WSH","WSN":"WSH"
  };
  return map[t] || t;
}

function guessTeamFromGame(input, playerName){
  // If Game looks like "SEA@PHI" and input has playerTeam, it's already better.
  // Otherwise leave undefined; this is just a last resort and we avoid guessing wrongly.
  return input.team || input.batter_team || null;
}
function guessOppFromGame(input, batterTeam){
  const game = input.game || input.Game || input.matchup_str || "";
  const m = typeof game === "string" ? game.match(/([A-Z]{2,3})@([A-Z]{2,3})/) : null;
  if (!m) return null;
  const away = m[1], home = m[2];
  if (!batterTeam) return null;
  if (teamsEqual(batterTeam, away)) return home;
  if (teamsEqual(batterTeam, home)) return away;
  return null;
}

function sanitizePitcher(p){
  if (!p) return null;
  const name = p.name || p.full_name || p.player || p.Player || null;
  const team = (p.team || p.Team || p.team_abbr || p.team_code || null);
  const throws = p.throws || p.hand || p.handedness || null;
  const hr9 = p.hr9 ?? p.HR9 ?? p.hr_9 ?? null;
  const barrel_pct_allowed = p.barrel_pct_allowed ?? p.barrels_allowed_rate ?? null;
  const primary_pitches = p.primary_pitches || p.pitches || null;
  return { name, team, throws, hr9, barrel_pct_allowed, primary_pitches };
}

/** =========================
 *  WHY text templates
 *  ========================= */
const T_BASELINE = [
  "{player} projects from a {pct(base_hr_pa)} HR/PA baseline with ~{fix(exp_pa,1)} expected plate appearances.",
  "Baseline power is {pct(base_hr_pa)} per PA, supported by a likely {fix(exp_pa,1)} PA workload."
];

const T_PITCHER = [
  "He draws {pitcher.name}, a {pitcher.throws}-hander allowing {val(pitcher.hr9)} HR/9 and {pct(pitcher.barrel_pct_allowed)} barrels.",
  "{pitcher.name} leans on the {pitch_list} and has been vulnerable when behind in the count."
];

const T_PITCH_MATCH = [
  "{player} profiles well vs {match_pitch}: xISO {val(match_xiso)} on that pitch type.",
  "Matchup edge: {player} vs {match_pitch} has played {dir(match_xiso)} in our book."
];

const T_ENV = [
  "{park.name} plays {park_dir} for {hand}-handed power (HR index {park_idx}).",
  "Weather {weather_blurb} — a small {env_boost} HR boost."
];

const T_MARKET = [
  "At {odds_best_american}, the market implies {pct(implied_prob)}, while we project {pct(true_hr_prob)} — EV {fix(ev_per_unit,2)}u.",
  "Books price it at {odds_best_american} ({pct(implied_prob)}), our edge is {edge_pts} pts to {pct(true_hr_prob)}."
];

const T_RISK = ["Notes: {risk_notes}."];

// helpers
function seeded(str, seed = 1) {
  let h = 0;
  for (let i=0; i<str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return () => {
    seed = Math.imul(48271, seed) % 2147483647;
    return (h ^ seed) / 2147483647;
  };
}
function pick(arr, rng) {
  if (!arr || arr.length === 0) return "";
  const idx = Math.floor(rng() * arr.length);
  return arr[idx];
}
function render(tpl, ctx) {
  return tpl.replace(/\{(.*?)\}/g, (_,k) => {
    try {
      if (k.startsWith("pct(")) return fmtPct(evalKey(k.slice(4,-1), ctx));
      if (k.startsWith("fix(")) { let [v,d] = k.slice(4,-1).split(","); return fmtFix(evalKey(v.trim(), ctx), Number(d)); }
      if (k.startsWith("val(")) return fmtVal(evalKey(k.slice(4,-1), ctx));
      if (k.startsWith("dir(")) return fmtDir(evalKey(k.slice(4,-1), ctx));
      if (k==="pitch_list") return (ctx.pitcher?.primary_pitches||[]).slice(0,2).map(p=>p.pitch).join("/");
      return evalKey(k, ctx);
    } catch { return ""; }
  });
}
function evalKey(path, ctx) {
  return path.split(".").reduce((o,k)=>o?.[k], ctx);
}
function fmtPct(x){ return x==null?"—":(100*x).toFixed(1)+"%"; }
function fmtFix(x,d){ return x==null?"—":Number(x).toFixed(d); }
function fmtVal(x){ return x==null?"—":x; }
function fmtDir(x){ if(x==null) return "flat"; return x>0?"up":"down"; }
function push(arr, tpl, ctx){ if(tpl) arr.push(render(tpl,ctx)); }

function bestPitchMatch(input){
  if(!input.hitter_vs_pitch) return null;
  const good = input.hitter_vs_pitch.filter(p=>p.sample_pa>=25 && p.xiso!=null);
  if(good.length===0) return null;
  const best = [...good].sort((a,b)=>(b.xiso||0)-(a.xiso||0))[0];
  return { match_pitch: best.pitch, match_xiso: best.xiso };
}
function envSummary(input){
  if(!input.park && !input.weather) return null;
  const hand = input.bats;
  const park_idx = hand==="L"?input.park?.hr_index_lhb:input.park?.hr_index_rhb;
  let park_dir = "neutral";
  if(park_idx!=null){
    if(park_idx>=120) park_dir="very favorable";
    else if(park_idx>=110) park_dir="favorable";
    else if(park_idx<=90) park_dir="tough";
  }
  let weather_blurb="", env_boost="";
  if(input.weather?.temp_f>=80) { weather_blurb="warm temps"; env_boost="plus"; }
  if(input.weather?.wind_dir?.startsWith("out") && input.weather?.wind_mph>=8){ weather_blurb="wind blowing out"; env_boost="plus"; }
  if(input.weather?.wind_dir==="in" && input.weather?.wind_mph>=8){ weather_blurb="wind in"; env_boost="minus"; }
  return { park_dir, park_idx, hand, weather_blurb, env_boost };
}
