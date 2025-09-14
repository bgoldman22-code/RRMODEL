// netlify/functions/nfl-predictions-generate/index.cjs
// Model-first NFL picks using team-form EPA; odds only for context.
// No Blobs dependencies. CommonJS. Works on Node 18+ (global fetch).

const DEFAULT_TEAM_FORM_URL = process.env.TEAM_FORM_URL || "https://bgroundrobin.com/nflverse-team-form.json";
const SCHEDULE_URL = process.env.SCHEDULE_URL || "https://bgroundrobin.com/.netlify/functions/nfl-schedule-get";
const ODDS_URL = process.env.ODDS_URL || "https://bgroundrobin.com/.netlify/functions/nfl-odds-bridge";

// --- helpers ---
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function toPct(x) {
  if (x == null || Number.isNaN(x)) return null;
  return Math.round(x * 100);
}

// Normalize some team name variants used across schedule/odds/model.
function normTeam(s) {
  if (!s) return s;
  return s.toUpperCase()
    .replace(/\s+/, ' ')
    .replace('LOS ANGELES CHARGERS', 'LAC')
    .replace('LA CHARGERS', 'LAC')
    .replace(/\bCHARGERS\b/, 'LAC')
    .replace('LOS ANGELES RAMS', 'LAR')
    .replace('LA RAMS', 'LAR')
    .replace(/\bRAMS\b/, 'LAR')
    .replace('SAN FRANCISCO 49ERS', 'SF')
    .replace(/\b49ERS\b/, 'SF')
    .replace('WASHINGTON FOOTBALL TEAM', 'WASHINGTON COMMANDERS')
    .trim();
}

// Pull a simple strength score from team form JSON.
function teamStrength(tf, teamKey) {
  const t = tf?.team_data?.[teamKey];
  if (!t) return null;
  // Use decayed EPA components; offense positive is good, defense negative is good (allowed epa).
  // Convert defense to "strength" by negating allowed EPA signals.
  const off = (t.decayed_data?.off_epa_decayed ?? t.offense?.epa_per_play ?? 0);
  const defGood = -(t.decayed_data?.def_epa_decayed ?? t.defense?.epa_allowed_per_play ?? 0);
  // Heuristic blend; weight offense slightly higher.
  return 0.6 * off + 0.4 * defGood;
}

// Map full names to model keys when necessary.
function mapNameToKey(name) {
  const n = normTeam(name);
  const direct = n;
  // Common NFL abbreviations already in model file (e.g., KC, GB). Try direct first.
  return direct;
}

// Logistic transform of margin -> win prob.
function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

// Convert strength diff to projected margin (heuristic scale).
function projectedMargin(strDiff, hfaPts) {
  // 1 EPA roughly ~ 45 points per 100 plays; scale small. We'll treat strDiff ~ 0.07 -> ~1 point.
  const scale = 14.0; // tuned to make reasonable spreads
  return strDiff * scale + hfaPts;
}

// Probability from margin vs. line with assumed sigma.
function probFromEdge(edgePts, sigma = 13.5) {
  // Treat spread outcome roughly normal in points with sigma ~13.5.
  // Probability favorite covers = Phi(edge / sigma).
  const z = Math.max(-6, Math.min(6, edgePts / sigma));
  // approximate normal CDF
  const phi = 0.5 * (1 + Math.erf ? Math.erf(z / Math.SQRT2) : (z>=0?1:-1)); // fallback if erf absent
  return Math.max(0, Math.min(1, phi));
}

// Implied probability from American odds.
function impliedFromMoneyline(ml) {
  if (ml == null) return null;
  const n = Number(ml);
  if (Number.isNaN(n)) return null;
  return n < 0 ? (-n) / ((-n) + 100) : 100 / (n + 100);
}

async function getJSON(url, fallback = { ok:false }) {
  try {
    const r = await fetch(url, { headers: { "accept": "application/json" } });
    const json = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, url, json };
  } catch (e) {
    return { ok:false, status:0, url, error: String(e) };
  }
}

function chooseMoneylinePick(modelHomeProb, oddsRow) {
  // Decide which team to pick based purely on model win probability.
  const pickHome = modelHomeProb >= 0.5;
  const sideTeam = pickHome ? oddsRow?.home ?? "HOME" : oddsRow?.away ?? "AWAY";
  const price = pickHome ? oddsRow?.ml_home ?? null : oddsRow?.ml_away ?? null;
  const confidence = pickHome ? modelHomeProb : (1 - modelHomeProb);
  return { team: normTeam(sideTeam), price, confidence };
}

function chooseSpreadPick(modelMargin, oddsRow, hTeam, aTeam) {
  if (!oddsRow || oddsRow.spread_point == null) return null;
  // Line is in terms of home team (negative if home favored).
  const line = Number(oddsRow.spread_point);
  const pickHomeSide = modelMargin >= line; // if projected margin >= line, lay the points with home
  const price = pickHomeSide ? oddsRow.spread_home_line ?? null : oddsRow.spread_away_line ?? null;
  const edgePts = (modelMargin - line) * (pickHomeSide ? 1 : -1); // positive edge in chosen direction
  const p = probFromEdge(edgePts);
  const team = pickHomeSide ? hTeam : aTeam;
  return { team: normTeam(team), line, price, confidence: p };
}

function chooseTotalPick(projectedTotal, oddsRow) {
  if (!oddsRow || oddsRow.total_points == null) return null;
  const line = Number(oddsRow.total_points);
  const pickOver = projectedTotal >= line;
  const price = pickOver ? oddsRow.over_price ?? null : oddsRow.under_price ?? null;
  const edgePts = (projectedTotal - line) * (pickOver ? 1 : -1);
  const p = probFromEdge(edgePts);
  return { side: pickOver ? "OVER" : "UNDER", line, price, confidence: p };
}

exports.handler = async (event, context) => {
  const started = Date.now();
  const meta = { source: "model-epa-v1" };

  // Pull inputs (schedule, odds, team form)
  const [tfRes, schedRes, oddsRes] = await Promise.all([
    getJSON(DEFAULT_TEAM_FORM_URL),
    getJSON(SCHEDULE_URL),
    getJSON(ODDS_URL)
  ]);

  // Build quick maps for odds rows keyed by id or matchup text.
  const oddsRows = Array.isArray(oddsRes?.json?.rows) ? oddsRes.json.rows : [];
  const oddsByMatchup = new Map();
  const oddsById = new Map();
  for (const r of oddsRows) {
    if (r?.matchup) oddsByMatchup.set(r.matchup.toUpperCase(), r);
    if (r?.id) oddsById.set(r.id, r);
  }

  // Choose the schedule source: prefer explicit schedule JSON; otherwise, synthesize from odds.
  let games = [];
  if (schedRes?.json?.ok && Array.isArray(schedRes?.json?.matchups)) {
    games = schedRes.json.matchups.map(m => ({
      id: m.id,
      homeTeam: normTeam(m.homeTeam),
      awayTeam: normTeam(m.awayTeam),
      kickoff: m.kickoff
    }));
    meta.schedule_source = schedRes.json.source || "schedule";
  } else if (oddsRows.length) {
    games = oddsRows.map(o => {
      const [away, home] = o.matchup.split("@").map(s => s.trim());
      return {
        id: o.id,
        homeTeam: normTeam(o.home),
        awayTeam: normTeam(o.away),
        kickoff: o.commence_time
      };
    });
    meta.schedule_source = "odds-fallback";
  }

  const tf = tfRes?.json || null;

  // Modeling parameters
  const HFA_PTS = 1.5;                  // home field advantage (points)
  const TOTAL_BASELINE = 43.5;          // average total baseline
  const TOTAL_SCALE = 60;               // scale EPA into totals
  const rows = [];

  for (const g of games) {
    try {
      const hKey = mapNameToKey(g.homeTeam);
      const aKey = mapNameToKey(g.awayTeam);
      const hStr = teamStrength(tf, hKey);
      const aStr = teamStrength(tf, aKey);

      // If we don't have both, skip (or set neutral)
      if (hStr == null || aStr == null) {
        rows.push({
          id: g.id, matchup: `${g.awayTeam} @ ${g.homeTeam}`, kickoff: g.kickoff,
          reason: "missing-team-form", homeTeam: g.homeTeam, awayTeam: g.awayTeam
        });
        continue;
      }

      const strDiff = hStr - aStr;
      const margin = projectedMargin(strDiff, HFA_PTS);
      // Convert margin to win prob using logistic with ~5.5pt scale => 75% at ~+5.5
      const modelHomeProb = logistic(margin / 5.5);

      // Rough projected total from offensive + defensive quality
      const hOff = tf?.team_data?.[hKey]?.decayed_data?.off_epa_decayed ?? 0;
      const aOff = tf?.team_data?.[aKey]?.decayed_data?.off_epa_decayed ?? 0;
      const hDef = -(tf?.team_data?.[hKey]?.decayed_data?.def_epa_decayed ?? 0);
      const aDef = -(tf?.team_data?.[aKey]?.decayed_data?.def_epa_decayed ?? 0);
      const projectedTotal = TOTAL_BASELINE + (hOff + aOff + hDef + aDef) * TOTAL_SCALE;

      const oddsRow = g.id ? (oddsById.get(g.id) || null) : null;

      const mlPick = chooseMoneylinePick(modelHomeProb, oddsRow || { home: g.homeTeam, away: g.awayTeam });
      const spPick = chooseSpreadPick(margin, oddsRow, g.homeTeam, g.awayTeam);
      const totPick = chooseTotalPick(projectedTotal, oddsRow);

      const impliedHome = impliedFromMoneyline(oddsRow?.ml_home);
      const impliedAway = impliedFromMoneyline(oddsRow?.ml_away);
      const valueHome = (modelHomeProb != null && impliedHome != null) ? (modelHomeProb - impliedHome) : null;
      const valueAway = (modelHomeProb != null && impliedAway != null) ? ((1-modelHomeProb) - impliedAway) : null;

      const row = {
        id: g.id,
        matchup: `${g.awayTeam} @ ${g.homeTeam}`,
        kickoff: g.kickoff,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        model: {
          home_prob: Number(modelHomeProb.toFixed(3)),
          projected_margin: Number(margin.toFixed(2)),
          projected_total: Number(projectedTotal.toFixed(1)),
          home_value_vs_implied: valueHome != null ? Number(valueHome.toFixed(3)) : null,
          away_value_vs_implied: valueAway != null ? Number(valueAway.toFixed(3)) : null
        },
        moneyline: mlPick ? {
          team: mlPick.team,
          price: mlPick.price,
          confidence: Number(mlPick.confidence.toFixed(3))
        } : null,
        spread: spPick ? {
          team: spPick.team,
          line: spPick.line,
          price: spPick.price,
          confidence: Number(spPick.confidence.toFixed(3))
        } : null,
        total: totPick ? {
          side: totPick.side,
          line: totPick.line,
          price: totPick.price,
          confidence: Number(totPick.confidence.toFixed(3))
        } : null,
        odds: oddsRow || null
      };

      // Runtime logging for debugging value + decisions
      console.log(JSON.stringify({
        at: new Date().toISOString(),
        fn: "nfl-predictions-generate",
        game_id: g.id,
        matchup: row.matchup,
        model_input: { hKey, aKey, hStr, aStr },
        model_output: row.model,
        decisions: { moneyline: row.moneyline, spread: row.spread, total: row.total }
      }));

      rows.push(row);
      // tiny jitter to keep logs readable on Netlify
      await sleep(1);
    } catch (e) {
      console.error("row-error", g, String(e));
    }
  }

  const body = JSON.stringify({
    ok: true,
    updated: new Date().toISOString(),
    meta,
    rows
  });

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body
  };
};