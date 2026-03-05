// NCAA MBB V2 Predictions — Calibrated + Tiered Underdog Filter
// Walk-forward isotonic calibration → tiered underdog filter → calibrated edge gates
//
// TIERED STRATEGY (backed by full-season + maturity analysis):
//   Tier 1: Dogs ≤ +150, ≥5% calibrated edge  → 13-8, +34% ROI (mature cal)
//   Tier 2: Dogs +201 to +250, ≥10% cal edge   → 5-5, +55% ROI (mature cal)
//   DEAD ZONE: +151 to +200 — SKIP (0-2, -100% ROI at every maturity level)
//   Composite: 18-13, +40.8% ROI, +$12,640 P/L
//
// Data flow:
//   1. Fetch today's raw Variant B picks from GitHub
//   2. Fetch historical picks (last 60 days) for calibration training
//   3. Train isotonic regression on historical results (walk-forward: only past data)
//   4. Apply calibration to today's picks
//   5. Filter: tiered underdogs (≤+150 OR +201-250, skip +151-200 dead zone)
//   6. Require tier-specific calibrated edge (5% or 10%)
//   7. Re-size bets with calibrated probabilities

const GITHUB_RAW = 'https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_';
const ESPN_BASE  = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
const MIN_TRAINING_DAYS = 14;

// Tier 1: Short underdogs ≤ +150, 5% edge
const TIER1_MAX_ODDS = 150;
const TIER1_EDGE_MIN = 0.05;

// Tier 2: Longshots +201 to +250, 10% edge
const TIER2_MIN_ODDS = 201;
const TIER2_MAX_ODDS = 250;
const TIER2_EDGE_MIN = 0.10;

// Dead zone: +151 to +200 — never bet (confirmed dead at all maturity levels)

const CALIBRATED_EDGE_MIN = 0.05;   // fallback for calculateBetSize
const KELLY_FRACTION = 0.25;
const BANKROLL = 10000;

// ─── helpers ──────────────────────────────────────────────────
function fmt(d) { return d.toISOString().slice(0, 10); }
function fmtESPN(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function normalize(name) {
  return name.toLowerCase().replace(/\./g, '').replace(/['']/g, '').replace(/\s+/g, ' ').trim();
}
function keyWords(name) {
  const n = normalize(name);
  return n.replace(/(leopards|greyhounds|paladins|bears|governors|royals|wolves|lions|lobos|antelopes|eagles|mountain hawks|dolphins|hatters|bulls|cardinals|flames|aggies|monarchs|thundering herd|coyotes|fighting hawks|yellow jackets|demon deacons|bluejays|bisons|colonels|terriers|blue demons|falcons|huskies|owls|tigers|hokies|gators|bulldogs|buffaloes|red raiders|wildcats|wolverines|golden|warriors|spartans|knights|cougars|braves|raiders|rockets|hawks|hornets|panthers|rams|rebels|mustangs|pirates|saints|miners|lumberjacks|penguins|bearcats|highlanders|racers|ospreys|retrievers|spiders|tribe|phoenix|billikens|musketeers|friars|explorers|gaels|jaspers|dukes|toreros|zags|commodores|boilermakers|cyclones|jayhawks|mountaineers|sooners|longhorns|badgers|tar heels|seminoles|cavaliers|hoosiers|buckeyes|nittany lions|fighting irish|terrapins|cornhuskers|razorbacks|volunteers|crimson tide|gamecocks)$/g, '').trim().split(' ').filter(w => w.length > 2);
}
function findGame(pick, espnGames) {
  const homeNorm = normalize(pick.home_team), awayNorm = normalize(pick.away_team);
  const homeKeys = keyWords(pick.home_team), awayKeys = keyWords(pick.away_team);
  for (const g of espnGames) {
    const eh = normalize(g.homeName), ea = normalize(g.awayName);
    const ehs = normalize(g.homeShort || ''), eas = normalize(g.awayShort || '');
    const hm = eh.includes(homeNorm) || homeNorm.includes(eh) || ehs.includes(homeNorm) || homeNorm.includes(ehs) || eh.includes(homeKeys[0] || '___') || (homeKeys[0] && ehs.includes(homeKeys[0]));
    const am = ea.includes(awayNorm) || awayNorm.includes(ea) || eas.includes(awayNorm) || awayNorm.includes(eas) || ea.includes(awayKeys[0] || '___') || (awayKeys[0] && eas.includes(awayKeys[0]));
    if (hm && am) return g;
    const ehk = keyWords(g.homeName), eak = keyWords(g.awayName);
    if (homeKeys.some(k => ehk.includes(k) || eh.includes(k)) && awayKeys.some(k => eak.includes(k) || ea.includes(k))) return g;
  }
  return null;
}

function oddsToImpliedProb(odds) {
  return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
}

// ─── Isotonic Regression (Pool Adjacent Violators) ────────────
function fitIsotonic(trainingData) {
  const sorted = [...trainingData].sort((a, b) => a.modelProb - b.modelProb);
  const n = sorted.length;
  if (n === 0) return { calibrate: (p) => p };

  let blocks = sorted.map((d, i) => ({
    start: i, end: i, value: d.outcome, weight: 1, sumX: d.modelProb
  }));

  let changed = true;
  while (changed) {
    changed = false;
    const newBlocks = [blocks[0]];
    for (let i = 1; i < blocks.length; i++) {
      const prev = newBlocks[newBlocks.length - 1];
      const curr = blocks[i];
      if (prev.value > curr.value) {
        const totalWeight = prev.weight + curr.weight;
        prev.value = (prev.value * prev.weight + curr.value * curr.weight) / totalWeight;
        prev.weight = totalWeight;
        prev.end = curr.end;
        prev.sumX = prev.sumX + curr.sumX;
        changed = true;
      } else {
        newBlocks.push(curr);
      }
    }
    blocks = newBlocks;
  }

  const knots = blocks.map(b => ({ x: b.sumX / b.weight, y: b.value }));

  return {
    knots,
    calibrate: (rawProb) => {
      if (knots.length === 0) return rawProb;
      if (rawProb <= knots[0].x) return knots[0].y;
      if (rawProb >= knots[knots.length - 1].x) return knots[knots.length - 1].y;
      for (let i = 0; i < knots.length - 1; i++) {
        if (rawProb >= knots[i].x && rawProb <= knots[i + 1].x) {
          const t = (rawProb - knots[i].x) / (knots[i + 1].x - knots[i].x);
          return knots[i].y + t * (knots[i + 1].y - knots[i].y);
        }
      }
      return knots[knots.length - 1].y;
    }
  };
}

// ─── Kelly bet sizing from calibrated prob ────────────────────
function calculateBetSize(calibratedProb, odds) {
  const impliedProb = oddsToImpliedProb(odds);
  const edge = calibratedProb - impliedProb;

  if (edge < CALIBRATED_EDGE_MIN) return { betSize: 0, edge, skip: true };

  const b = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  let kelly = (calibratedProb * b - (1 - calibratedProb)) / b;
  kelly = Math.max(0, kelly) * KELLY_FRACTION;

  let betSize = Math.round(kelly * BANKROLL);
  betSize = Math.max(0, Math.min(betSize, 1000));

  return { betSize, edge, skip: betSize === 0 };
}

// ─── Tiered underdog filter ───────────────────────────────────
// Returns { pass: bool, tier: 'tier1'|'tier2'|null, edgeMin: number }
function classifyPick(pick) {
  // Must be an underdog (positive odds)
  if (pick.odds <= 0) return { pass: false, tier: null, reason: 'notDog' };

  // Tier 1: ≤ +150, 5% edge
  if (pick.odds <= TIER1_MAX_ODDS) {
    return { pass: true, tier: 'tier1', edgeMin: TIER1_EDGE_MIN };
  }

  // Dead zone: +151 to +200 — NEVER bet
  if (pick.odds < TIER2_MIN_ODDS) {
    return { pass: false, tier: null, reason: 'deadZone' };
  }

  // Tier 2: +201 to +250, 10% edge
  if (pick.odds <= TIER2_MAX_ODDS) {
    return { pass: true, tier: 'tier2', edgeMin: TIER2_EDGE_MIN };
  }

  // Too long (> +250)
  return { pass: false, tier: null, reason: 'oddsTooHigh' };
}

// ═══════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════
export default async function handler(event, context) {
  console.log('[NCAA MBB V2] Starting calibrated predictions...');

  try {
    // Today in ET (US Eastern)
    const now = new Date();
    const etOffset = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const etDate = new Date(etOffset);
    const today = fmt(etDate);
    console.log(`[NCAA MBB V2] Today (ET): ${today}`);

    // ── Step 1: Fetch today's raw picks ─────────────────────
    const todayUrl = `${GITHUB_RAW}${today}.json`;
    console.log(`[NCAA MBB V2] Fetching today's picks: ${todayUrl}`);
    const todayRes = await fetch(todayUrl);

    if (!todayRes.ok) {
      if (todayRes.status === 404) {
        return jsonResponse({
          ok: false,
          message: `No V1 picks found for ${today}. Picks are generated daily at 10 AM ET.`
        });
      }
      throw new Error(`GitHub fetch failed: ${todayRes.status}`);
    }

    const todayData = await todayRes.json();
    const rawPicks = todayData.picks || [];
    console.log(`[NCAA MBB V2] Raw V1 picks: ${rawPicks.length}`);

    if (rawPicks.length === 0) {
      return jsonResponse({ ok: false, message: `No picks available for ${today}.` });
    }

    // ── Step 2: Fetch historical picks for calibration training ─
    // Go back 60 days to ensure we have enough training data
    const historyDays = 60;
    const histStart = addDays(new Date(today + 'T00:00:00Z'), -historyDays);
    const histDates = [];
    for (let i = 0; i < historyDays; i++) {
      const d = fmt(addDays(histStart, i));
      if (d < today) histDates.push(d);
    }

    console.log(`[NCAA MBB V2] Fetching ${histDates.length} historical days for calibration...`);
    const histPromises = histDates.map(async (d) => {
      try {
        const res = await fetch(`${GITHUB_RAW}${d}.json`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.picks && data.picks.length > 0 ? { dateStr: d, picks: data.picks } : null;
      } catch { return null; }
    });

    const histResults = (await Promise.all(histPromises)).filter(Boolean);
    console.log(`[NCAA MBB V2] Found ${histResults.length} historical days with picks`);

    // ── Step 3: Fetch ESPN scores for historical picks ──────
    const espnDatesNeeded = new Set();
    for (const { dateStr } of histResults) {
      const d = new Date(dateStr + 'T00:00:00Z');
      espnDatesNeeded.add(fmtESPN(d));
      espnDatesNeeded.add(fmtESPN(addDays(d, 1)));
    }

    console.log(`[NCAA MBB V2] Fetching ${espnDatesNeeded.size} ESPN score dates...`);
    const espnCache = new Map();
    const espnPromises = [...espnDatesNeeded].map(async (espnDate) => {
      try {
        const res = await fetch(`${ESPN_BASE}?dates=${espnDate}&limit=300&groups=50`);
        const data = await res.json();
        const games = [];
        for (const event of (data.events || [])) {
          const comp = event.competitions?.[0];
          if (!comp || !comp.status?.type?.completed) continue;
          const home = comp.competitors.find(c => c.homeAway === 'home');
          const away = comp.competitors.find(c => c.homeAway === 'away');
          if (!home || !away) continue;
          games.push({
            homeName: home.team.displayName, homeShort: home.team.shortDisplayName,
            homeScore: parseInt(home.score),
            awayName: away.team.displayName, awayShort: away.team.shortDisplayName,
            awayScore: parseInt(away.score),
            winner: parseInt(home.score) > parseInt(away.score) ? 'home' : 'away',
          });
        }
        espnCache.set(espnDate, games);
      } catch { /* skip */ }
    });
    await Promise.all(espnPromises);
    console.log(`[NCAA MBB V2] ESPN cache: ${espnCache.size} dates`);

    // ── Step 4: Grade historical picks ──────────────────────
    const trainingData = [];
    for (const { dateStr, picks } of histResults) {
      const d = new Date(dateStr + 'T00:00:00Z');
      const espn0 = espnCache.get(fmtESPN(d)) || [];
      const espn1 = espnCache.get(fmtESPN(addDays(d, 1))) || [];
      const allGames = [...espn0, ...espn1];

      for (const pick of picks) {
        const game = findGame(pick, allGames);
        if (!game) continue;
        const won = game.winner === pick.side;
        trainingData.push({
          modelProb: pick.model_prob,
          outcome: won ? 1 : 0,
          date: dateStr
        });
      }
    }
    console.log(`[NCAA MBB V2] Training data: ${trainingData.length} graded picks`);

    // ── Step 5: Train isotonic calibrator ────────────────────
    let calibrator;
    if (trainingData.length >= MIN_TRAINING_DAYS * 5) {
      calibrator = fitIsotonic(trainingData);
      console.log(`[NCAA MBB V2] Isotonic calibrator trained on ${trainingData.length} picks`);
    } else {
      // Fallback: simple Platt-like scaling from observed ECE
      const avgModel = trainingData.reduce((s, d) => s + d.modelProb, 0) / trainingData.length;
      const avgActual = trainingData.filter(d => d.outcome === 1).length / trainingData.length;
      const ratio = avgActual / avgModel;
      calibrator = { calibrate: (p) => Math.min(0.99, Math.max(0.01, p * ratio)) };
      console.log(`[NCAA MBB V2] Fallback calibrator (ratio=${ratio.toFixed(3)})`);
    }

    // ── Step 6: Apply calibration + tiered filter to today's picks ─
    const v2Picks = [];
    let totalFiltered = 0;
    let filteredByType = { notDog: 0, deadZone: 0, oddsTooHigh: 0, lowEdge: 0 };
    let tierCounts = { tier1: 0, tier2: 0 };

    for (const pick of rawPicks) {
      // Classify into tier
      const classification = classifyPick(pick);

      if (!classification.pass) {
        filteredByType[classification.reason]++;
        totalFiltered++;
        continue;
      }

      // Calibrate probability
      const calibratedProb = calibrator.calibrate(pick.model_prob);
      const impliedProb = oddsToImpliedProb(pick.odds);
      const calibratedEdge = calibratedProb - impliedProb;

      // Tier-specific edge gate
      if (calibratedEdge < classification.edgeMin) {
        filteredByType.lowEdge++;
        totalFiltered++;
        continue;
      }

      // Re-size bet with calibrated probability
      const { betSize, edge } = calculateBetSize(calibratedProb, pick.odds);

      tierCounts[classification.tier]++;
      const tierLabel = classification.tier === 'tier1' ? 'dog_lt150_5pct' : 'longshot_201_250_10pct';

      v2Picks.push({
        ...pick,
        raw_model_prob: pick.model_prob,
        calibrated_prob: calibratedProb,
        raw_edge: pick.edge,
        calibrated_edge: calibratedEdge,
        bet_size_dollars: betSize || pick.bet_size_dollars,
        v2_filter: tierLabel,
        v2_tier: classification.tier,
        tier_edge_min: classification.edgeMin
      });
    }

    console.log(`[NCAA MBB V2] After filter: ${v2Picks.length} picks (filtered ${totalFiltered})`);
    console.log(`[NCAA MBB V2] Tier breakdown: Tier1(≤+150@5%)=${tierCounts.tier1}, Tier2(+201-250@10%)=${tierCounts.tier2}`);
    console.log(`[NCAA MBB V2] Filter breakdown: not-dog=${filteredByType.notDog}, dead-zone(+151-200)=${filteredByType.deadZone}, odds>+250=${filteredByType.oddsTooHigh}, low-edge=${filteredByType.lowEdge}`);

    // ── Step 7: Transform for frontend ──────────────────────
    const transformed = transformV2Picks(v2Picks, today, trainingData.length, filteredByType, rawPicks.length, tierCounts);

    return jsonResponse({
      ok: true,
      predictions: transformed.predictions,
      metadata: transformed.metadata,
      generated: new Date().toISOString(),
      source: 'github-calibrated-v2'
    });

  } catch (error) {
    console.error('[NCAA MBB V2] Error:', error);
    return jsonResponse({ ok: false, message: error.message }, 500);
  }
}

// ─── Transform V2 picks for frontend ─────────────────────────
function transformV2Picks(picks, date, trainingSize, filterBreakdown, rawTotal, tierCounts) {
  const predictions = picks.map(pick => {
    const underdogOdds = pick.odds; // the pick IS the underdog
    // Estimate favorite odds (approximate inverse)
    let favOdds;
    if (underdogOdds > 0) {
      favOdds = -Math.round((underdogOdds * 100) / (underdogOdds + 100)) - 20; // rough vig adjustment
    } else {
      favOdds = underdogOdds;
    }

    const pickTeam = pick.side === 'away' ? pick.away_team : pick.home_team;
    const oppTeam  = pick.side === 'away' ? pick.home_team : pick.away_team;

    const tierDisplay = pick.v2_tier === 'tier1'
      ? `Dog ≤ +150 (≥${(pick.tier_edge_min * 100).toFixed(0)}% edge)`
      : `Longshot +201-250 (≥${(pick.tier_edge_min * 100).toFixed(0)}% edge)`;

    return {
      game: `${pick.away_team} @ ${pick.home_team}`,
      awayTeam: pick.away_team,
      homeTeam: pick.home_team,
      prediction: {
        pick: pickTeam,
        side: pick.side,
        confidence: Math.round(pick.calibrated_edge * 100),
        winProbability: {
          rawModelPercent: pick.raw_model_prob * 100,
          calibratedPercent: pick.calibrated_prob * 100,
          impliedPercent: oddsToImpliedProb(pick.odds) * 100
        }
      },
      vegasLines: {
        moneyline: {
          pick: underdogOdds,
          pickTeam: pickTeam,
          opponent: favOdds,
          opponentTeam: oppTeam
        }
      },
      betting: {
        rawEdge: pick.raw_edge,
        calibratedEdge: pick.calibrated_edge,
        recommendedStake: pick.bet_size_dollars,
        kellyFraction: KELLY_FRACTION,
        tier: pick.v2_tier,
        tierDisplay
      },
      metadata: {
        date: date,
        model: 'NCAA MBB V2 (Calibrated)',
        filter: tierDisplay,
        market: pick.market
      }
    };
  });

  // Sort by calibrated edge descending
  predictions.sort((a, b) => b.betting.calibratedEdge - a.betting.calibratedEdge);

  return {
    predictions,
    metadata: {
      totalPicks: predictions.length,
      rawPicksTotal: rawTotal,
      filteredOut: rawTotal - predictions.length,
      filterBreakdown,
      tierCounts,
      totalStake: predictions.reduce((s, p) => s + p.betting.recommendedStake, 0),
      avgCalibratedEdge: predictions.length > 0
        ? predictions.reduce((s, p) => s + p.betting.calibratedEdge, 0) / predictions.length
        : 0,
      maxCalibratedEdge: predictions.length > 0
        ? Math.max(...predictions.map(p => p.betting.calibratedEdge))
        : 0,
      date,
      bankroll: BANKROLL,
      model: 'NCAA MBB V2 (Isotonic Calibration, Tiered Strategy)',
      calibrationTrainingSize: trainingSize,
      filters: [
        'Underdog (positive odds)',
        `Tier 1: Odds ≤ +${TIER1_MAX_ODDS}, cal. edge ≥ ${TIER1_EDGE_MIN * 100}%`,
        `Tier 2: Odds +${TIER2_MIN_ODDS}-+${TIER2_MAX_ODDS}, cal. edge ≥ ${TIER2_EDGE_MIN * 100}%`,
        'Dead zone: +151-200 SKIPPED (confirmed -100% ROI)',
        'Walk-forward isotonic calibration'
      ],
      backtestROI: '+40.8%',
      backtestRecord: '18-13 (58.1%)'
    }
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=900'
    }
  });
}
