// SAME modeling idea: team “form” from recent games → sigmoid → confidence
export function buildTeamForm(games, { window = 8, k = 3.0 } = {}) {
  const teams = new Map(); // name -> { form:number }
  const hist = new Map();  // name -> recent diffs

  const push = (name, v) => {
    if (!hist.has(name)) hist.set(name, []);
    const arr = hist.get(name);
    arr.push(v);
    if (arr.length > window) arr.shift();
  };

  games.forEach(g => {
    if (g.homePoints == null || g.awayPoints == null) return;
    const diffHome = g.homePoints - g.awayPoints;
    const diffAway = -diffHome;
    push(g.homeTeam, diffHome);
    push(g.awayTeam, diffAway);
  });

  for (const [team, arr] of hist.entries()) {
    const avg = arr.reduce((a,b)=>a+b,0) / arr.length;
    teams.set(team, { form: avg });
  }
  return { teams, params: { window, k } };
}

export function matchupPick({ home, away }, teamForm, odds) {
  const fh = teamForm.teams.get(home)?.form ?? 0;
  const fa = teamForm.teams.get(away)?.form ?? 0;
  const k = teamForm.params.k ?? 3;
  const pHome = sigmoid(k * (fh - fa));
  const pAway = 1 - pHome;

  const moneyline = pricePick({ home, away, pHome, pAway, odds });
  return { pHome, pAway, moneyline };
}

function pricePick({ home, away, pHome, pAway, odds }) {
  const mlHome = odds?.ml_home ?? null;
  const mlAway = odds?.ml_away ?? null;
  const impliedHome = mlHome != null ? americanToProb(mlHome) : null;
  const impliedAway = mlAway != null ? americanToProb(mlAway) : null;

  const edgeHome = impliedHome != null ? (pHome - impliedHome) : (pHome - 0.5);
  const edgeAway = impliedAway != null ? (pAway - impliedAway) : (pAway - 0.5);

  const pickHome = edgeHome >= edgeAway;
  const pickTeam = pickHome ? home : away;
  const pickPrice = pickHome ? mlHome : mlAway;
  const pickProb  = pickHome ? pHome : pAway;

  // simple confidence: combine delta between edges and distance from coin flip
  const conf = Math.round(Math.max(0, Math.min(1, Math.abs(edgeHome - edgeAway) + Math.abs(pickProb - 0.5))) * 100);

  return {
    pick: pickTeam,
    price: pickPrice,
    confidence: conf,
    text: formatMoneyline(pickTeam, pickPrice),
  };
}

function sigmoid(x){ return 1/(1+Math.exp(-x)); }

function americanToProb(ml){
  if (ml == null) return null;
  const n = Number(ml);
  if (!Number.isFinite(n)) return null;
  return n > 0 ? 100/(n+100) : (-n)/(-n+100);
}

function formatMoneyline(team, price){
  if (price == null || Number.isNaN(Number(price))) return `${team}`;
  const v = Number(price);
  const sign = v > 0 ? `(+${v})` : `(${v})`;
  return `${team} ${sign}`;
}
