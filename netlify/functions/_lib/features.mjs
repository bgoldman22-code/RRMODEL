/**
 * SAME MODEL MATH (tunable knobs kept explicit):
 * - Rolling form: exponential smoothing over last N games of (wp_diff as EPA proxy)
 * - Sigmoid probability with K calibrated so that diff≈0.285 -> p≈0.805 (matches your logs)
 */
const MAX_GAMES = 8;
const ALPHA = 0.35;            // smoothing factor (recent > older)
const K_SIGMOID = 5.0;         // calibration for p = sigmoid(K * formDiff)

function sigmoid(x){ return 1/(1+Math.exp(-x)); }

function key(team){ return team; } // already normalized team names from schedule/odds

/** Build team form map from game rows */
export function buildTeamForm(rows){
  const gamesByTeam = new Map();
  for (const r of rows){
    if (!gamesByTeam.has(key(r.home))) gamesByTeam.set(key(r.home), []);
    if (!gamesByTeam.has(key(r.away))) gamesByTeam.set(key(r.away), []);
    // Using (home_wp - away_wp) as a stand-in for EPA differential if EPA not present
    let diff = null;
    if (r.home_wp != null && r.away_wp != null){
      diff = (Number(r.home_wp) - Number(r.away_wp));
    }else{
      diff = 0; // if missing, neutral
    }
    gamesByTeam.get(key(r.home)).push(diff);
    gamesByTeam.get(key(r.away)).push(-diff);
  }

  const form = new Map();
  for (const [t, arr] of gamesByTeam){
    const last = arr.slice(-MAX_GAMES);
    let s = 0;
    let weight = 1;
    for (let i=0;i<last.length;i++){
      s = ALPHA*last[i] + (1-ALPHA)*s;
      weight = ALPHA + (1-ALPHA)*weight;
    }
    const val = last.length ? s : 0;
    form.set(t, val);
  }
  return form;
}

export function winProb(formHome, formAway){
  const d = (formHome - formAway);
  return sigmoid(K_SIGMOID * d);
}
