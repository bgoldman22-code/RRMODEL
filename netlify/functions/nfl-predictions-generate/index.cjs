// netlify/functions/nfl-predictions-generate/index.cjs
'use strict';

/**
 * Generates NFL predictions using team form (EPA-like) and schedule/odds as context.
 * Odds inform display/market selection only; model probabilities come from team form.
 */

const fetch = globalThis.fetch || ((...args) => import('node-fetch').then(({default: f}) => f(...args)));

const ENDPOINTS = {
  scheduleUrl: process.env.SCHEDULE_URL || "https://bgroundrobin.com/.netlify/functions/nfl-schedule-get",
  oddsUrl: process.env.ODDS_URL || "https://bgroundrobin.com/.netlify/functions/nfl-odds-bridge",
  teamFormUrl: process.env.TEAM_FORM_URL || "https://bgroundrobin.com/nflverse-team-form.json"
};

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
function impliedFromMoneyline(ml) {
  if (ml == null) return null;
  if (ml < 0) return (-ml) / ((-ml) + 100);
  return 100 / (ml + 100);
}
function formatMoneyline(ml){
  if (ml == null) return null;
  return ml > 0 ? `(${ml})` : `(${ml})`;
}
function pct(n){ if (n==null) return null; return Math.round(n*100); }

function pickFromEdge(probModel, probImplied, favoriteLabel, dogLabel){
  // Choose side by model > 0.5
  const side = probModel >= 0.5 ? favoriteLabel : dogLabel;
  const edge = probImplied == null ? Math.abs(probModel - 0.5) : Math.abs(probModel - probImplied);
  // Map edge to confidence 50%..85%
  const conf = clamp(0.5 + edge, 0.5, 0.85);
  return { side, confidence: conf };
}

function getTeamCodeMap(team_data){
  // The form JSON uses 2–3 letter codes; build simple name->code fallback.
  // We'll derive by initials of words, fallback to first 3 caps letters.
  const codes = Object.keys(team_data || {});
  return {
    resolve(name){
      if (!name) return null;
      const key = name.toUpperCase();
      // Try exact code
      if (codes.includes(key)) return key;
      // Try first letters e.g., New York Jets -> NYJ
      const init = key.split(/\s+/).map(w=>w[0]).join('');
      if (codes.includes(init)) return init;
      // Try first 3 letters
      const first3 = key.replace(/[^A-Z]/g,'').slice(0,3);
      if (codes.includes(first3)) return first3;
      // Last attempt: special cases
      const map = { 'LAR':'LA', 'LA RAMS':'LA', 'SAN FRANCISCO 49ERS':'SF', 'SAN FRANCISCO':'SF',
        'LOS ANGELES CHARGERS':'LAC', 'CHARGERS':'LAC', 'WASHINGTON COMMANDERS':'WAS',
        'KANSAS CITY CHIEFS':'KC', 'GREEN BAY PACKERS':'GB', 'NEW ORLEANS SAINTS':'NO',
        'TAMPA BAY BUCCANEERS':'TB', 'NEW ENGLAND PATRIOTS':'NE' };
      if (map[key] && codes.includes(map[key])) return map[key];
      return null;
    }
  };
}

exports.handler = async (event) => {
  const q = event && event.queryStringParameters || {};
  const force = q.force === 'true';

  try {
    const [schedRes, oddsRes, formRes] = await Promise.all([
      fetch(ENDPOINTS.scheduleUrl),
      fetch(ENDPOINTS.oddsUrl),
      fetch(ENDPOINTS.teamFormUrl)
    ]);
    const scheduleJson = await schedRes.json().catch(()=>({ ok:false }));
    const oddsJson = await oddsRes.json().catch(()=>({ ok:false }));
    const formJson = await formRes.json().catch(()=>({ ok:false }));

    const matchups = (scheduleJson && scheduleJson.json && scheduleJson.json.matchups) || scheduleJson.matchups || [];
    const oddsRows = (oddsJson && oddsJson.rows) || (oddsJson && oddsJson.json && oddsJson.json.rows) || [];
    const teamData = (formJson && formJson.team_data) || (formJson && formJson.json && formJson.json.team_data) || {};

    const codeMap = getTeamCodeMap(teamData);

    const oddsById = new Map(oddsRows.map(o => [o.id, o]));

    const kStrength = 3.25; // scale for sigmoid
    const rows = [];

    for (const g of matchups) {
      const o = oddsById.get(g.id) || {};
      const homeName = (g.homeTeam || o.home || '').toUpperCase();
      const awayName = (g.awayTeam || o.away || '').toUpperCase();

      const homeCode = codeMap.resolve(homeName);
      const awayCode = codeMap.resolve(awayName);

      let reason = null;
      if (!homeCode || !awayCode || !teamData[homeCode] || !teamData[awayCode]) {
        reason = 'missing-team-form';
      }

      // Pull "form" (already decayed) from form JSON; fallback to 0
      const formHome = teamData[homeCode]?.form ?? 0;
      const formAway = teamData[awayCode]?.form ?? 0;
      const delta = (formHome - formAway);

      // Model probability (home win)
      const pHome = sigmoid(kStrength * delta);
      const pAway = 1 - pHome;

      // Moneyline implieds
      const pImpHome = impliedFromMoneyline(o.ml_home ?? null);
      const pImpAway = impliedFromMoneyline(o.ml_away ?? null);

      // Moneyline pick
      const mlPick = pickFromEdge(
        pHome,
        pImpHome,
        homeName,
        awayName
      );

      // Spread: choose toward our model lean (positive delta favors home)
      const spreadPoint = o.spread_point ?? null;
      const spreadHomeLine = o.spread_home_line ?? null;
      const spreadAwayLine = o.spread_away_line ?? null;

      // Define a soft confidence from |delta| scaled (0..~0.25) -> 50..80%
      const spreadEdge = clamp(Math.abs(delta), 0, 0.3);
      const spreadConf = clamp(0.5 + spreadEdge, 0.5, 0.8);
      const spreadSide = delta >= 0 ? `${homeName} ${spreadPoint}` : `${awayName} ${spreadPoint}`;

      // Total: rough lean—if combined offensive form minus defensive form > 0 -> over, else under
      const ho = teamData[homeCode]?.offense?.epa_per_play ?? 0;
      const ao = teamData[awayCode]?.offense?.epa_per_play ?? 0;
      const hd = teamData[homeCode]?.defense?.epa_allowed_per_play ?? 0; // negative is good D (suppresses points)
      const ad = teamData[awayCode]?.defense?.epa_allowed_per_play ?? 0;

      const totalLean = (ho + ao) - (Math.abs(hd) + Math.abs(ad)) * 0.5;
      const totalSide = totalLean >= 0 ? 'OVER' : 'UNDER';
      const totalEdge = clamp(Math.min(Math.abs(totalLean) * 8, 0.35), 0, 0.35); // scale
      const totalConf = clamp(0.5 + totalEdge, 0.5, 0.85);

      const row = {
        id: g.id,
        matchup: g.matchup || `${awayName} @ ${homeName}`,
        kickoff: g.kickoff,
        reason,
        homeTeam: homeName,
        awayTeam: awayName,
        moneyline: {
          pick: mlPick.side,
          price: o.ml_home!=null && o.ml_away!=null ? (mlPick.side === homeName ? o.ml_home : o.ml_away) : null,
          confidence: mlPick.confidence
        },
        spread: {
          pick: spreadSide,
          price: spreadSide.startsWith(homeName) ? spreadHomeLine : spreadAwayLine,
          confidence: spreadConf
        },
        total: {
          pick: o.total_points != null ? `${totalSide} ${o.total_points}` : totalSide,
          price: totalSide === 'OVER' ? o.over_price ?? null : o.under_price ?? null,
          confidence: totalConf
        }
      };

      // Logging for debugging in Netlify function logs
      console.log('[PREDICTION]', JSON.stringify({
        id: row.id,
        matchup: row.matchup,
        pHome: Number(pHome.toFixed(4)),
        moneyline: row.moneyline,
        spread: row.spread,
        total: row.total
      }));

      rows.push(row);
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        updated: new Date().toISOString(),
        meta: { source: 'model-epa-v1', schedule_source: scheduleJson?.source || scheduleJson?.json?.source || 'unknown' },
        rows
      })
    };
  } catch (err) {
    console.error('GEN_CRASH', err);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok:false, error:'Function crashed', details: { hint:'See function logs', code:'GEN_CRASH' } })
    };
  }
};
