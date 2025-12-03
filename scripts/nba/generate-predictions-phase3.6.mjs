#!/usr/bin/env node

/**
 * Phase 3.6 Production Prediction Generator
 * Fetches odds, engineers features, runs inference engine v4,
 * canonicalizes picks, and publishes the payload consumed by Netlify functions.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

import { createInferenceEngineV4 } from '../../netlify/functions/_lib/nba-props-engine-v4.mjs';
import { buildPhase36Features } from './_lib/phase36-feature-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_ROOT = path.join(__dirname, '../../data/nba');
const OUTPUT_DIR = path.join(__dirname, '../../public/data/nba');
const OUTPUT_FILE = 'nba-props-v3-live.json';
const OUTPUT_TMP = `${OUTPUT_FILE}.tmp`;

const BOX_SCORE_PATH = path.join(DATA_ROOT, 'player-history-2024-2026.json');
const HISTORICAL_ODDS_DIR = path.join(DATA_ROOT, 'historical_odds');

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_SPORT = 'basketball_nba';
const ODDS_API_REGIONS = 'us';
const ODDS_API_MARKETS = 'player_points,player_rebounds,player_assists';
const ODDS_API_FORMAT = 'american';

const DEFAULT_PACE = 98;
const MAX_EVENT_BATCH = 200;

const ALLOWED_BOOKS = ['betmgm', 'caesars', 'draftkings', 'espnbet', 'scorebet', 'fanatics', 'fanduel', 'novig'];
const MARKET_TO_STAT = {
  player_points: 'points',
  player_rebounds: 'rebounds',
  player_assists: 'assists'
};
const MODEL_VERSION_TAGS = {
  player_points: 'points_v36',
  player_rebounds: 'rebounds_v36',
  player_assists: 'assists_v36'
};

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function normalizeDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

const boxscores = readJSON(BOX_SCORE_PATH)
  .map(game => ({ ...game, date: normalizeDate(game.gameDate || game.date) }))
  .filter(g => g.date);

function oddsToImpliedProbability(odds) {
  const american = Number(odds);
  if (!Number.isFinite(american) || american === 0) return 0.5;
  return american > 0 ? 100 / (american + 100) : Math.abs(american) / (Math.abs(american) + 100);
}

function americanToDecimal(odds) {
  const american = Number(odds);
  if (!Number.isFinite(american) || american === 0) return 1.0;
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`Request failed with status ${res.statusCode}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function loadHistoricalOdds() {
  const files = fs.existsSync(HISTORICAL_ODDS_DIR)
    ? fs.readdirSync(HISTORICAL_ODDS_DIR).filter(f => f.endsWith('.json')).sort().reverse()
    : [];
  if (!files.length) throw new Error('No historical odds fallback available');
  const latest = files[0];
  console.warn(`⚠️  Using fallback odds from ${latest}`);
  return readJSON(path.join(HISTORICAL_ODDS_DIR, latest));
}

async function fetchOdds() {
  if (!ODDS_API_KEY) {
    console.warn('⚠️  Missing ODDS_API_KEY. Falling back to historical odds.');
    return loadHistoricalOdds();
  }

  const eventsUrl = `https://api.the-odds-api.com/v4/sports/${ODDS_API_SPORT}/events?apiKey=${ODDS_API_KEY}`;
  const events = await fetchJSON(eventsUrl);
  const limitedEvents = Array.isArray(events) ? events.slice(0, MAX_EVENT_BATCH) : [];
  const oddsPayload = [];

  for (let i = 0; i < limitedEvents.length; i++) {
    const event = limitedEvents[i];
    const oddsUrl = `https://api.the-odds-api.com/v4/sports/${ODDS_API_SPORT}/events/${event.id}/odds?apiKey=${ODDS_API_KEY}&regions=${ODDS_API_REGIONS}&markets=${ODDS_API_MARKETS}&oddsFormat=${ODDS_API_FORMAT}`;
    try {
      process.stdout.write(`\r   Fetching odds ${i + 1}/${limitedEvents.length}...`);
      const detail = await fetchJSON(oddsUrl);
      oddsPayload.push(detail);
      await sleep(150);
    } catch (err) {
      console.warn(`\n   ⚠️  Failed odds for ${event.home_team} vs ${event.away_team}: ${err.message}`);
    }
  }
  process.stdout.write('\n');
  return oddsPayload.length ? oddsPayload : loadHistoricalOdds();
}

function isAllowedBook(name = '') {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALLOWED_BOOKS.some(book => normalized.includes(book));
}

function parseOdds(eventsPayload) {
  const events = Array.isArray(eventsPayload) ? eventsPayload : eventsPayload.events || [];
  const bestMarkets = new Map();

  for (const event of events) {
    const bookmakers = event.bookmakers || [];
    for (const bookmaker of bookmakers) {
      if (!isAllowedBook(bookmaker.title)) continue;
      for (const market of bookmaker.markets || []) {
        if (!MARKET_TO_STAT[market.key]) continue;
        for (const outcome of market.outcomes || []) {
          const player = outcome.description || outcome.player || outcome.name;
          const line = Number(outcome.point);
          const odds = Number(outcome.price ?? outcome.odds);
          const sideRaw = (outcome.side || outcome.name || '').toUpperCase();
          const side = sideRaw.includes('UNDER') ? 'UNDER' : 'OVER';
          if (!player || !Number.isFinite(line) || !Number.isFinite(odds)) continue;
          const key = `${player}|${market.key}|${line}|${side}`;
          const candidate = {
            player,
            market: market.key,
            side,
            line,
            odds,
            bookmaker: bookmaker.title,
            home_team: event.home_team,
            away_team: event.away_team,
            commence_time: event.commence_time
          };
          const existing = bestMarkets.get(key);
          if (!existing) {
            bestMarkets.set(key, candidate);
          } else {
            const existingDecimal = americanToDecimal(existing.odds);
            const candidateDecimal = americanToDecimal(candidate.odds);
            if (candidateDecimal > existingDecimal) {
              bestMarkets.set(key, candidate);
            }
          }
        }
      }
    }
  }

  return Array.from(bestMarkets.values());
}

function getNBASeason(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return month >= 10 ? `${year}-${String(year + 1).slice(-2)}` : `${year - 1}-${String(year).slice(-2)}`;
}

function getPlayerHistory(playerName, targetDate) {
  return boxscores
    .filter(g => g.playerName === playerName && g.date && g.date < targetDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getPlayerRecentStats(playerName, targetDate, statKey) {
  return getPlayerHistory(playerName, targetDate).slice(-12).map(g => Number(g[statKey]) || 0);
}

function getGamesLastNDays(playerName, targetDate, days = 5) {
  const cutoff = new Date(targetDate);
  cutoff.setDate(cutoff.getDate() - days);
  return boxscores.filter(g => {
    if (g.playerName !== playerName || !g.date) return false;
    const gameDate = new Date(g.date);
    return gameDate >= cutoff && g.date < targetDate;
  }).length;
}

function getPlayerTeamContext(playerName, targetDate, homeTeam, awayTeam) {
  const history = getPlayerHistory(playerName, targetDate);
  const lastGame = history[history.length - 1];
  const playerTeam = lastGame?.team || lastGame?.teamAbbrev;
  const isHome = playerTeam ? playerTeam === homeTeam : true;
  const opponent = isHome ? awayTeam : homeTeam;
  return {
    playerTeam: playerTeam || (isHome ? homeTeam : awayTeam),
    isHome,
    opponent
  };
}

function average(games, statAccessor) {
  if (!games.length) return 0;
  return games.reduce((sum, g) => sum + statAccessor(g), 0) / games.length;
}

function calculateBaseFeatures(playerName, targetDate, opponent, isHome) {
  const priorGames = getPlayerHistory(playerName, targetDate);
  if (!priorGames.length) return null;

  const features = { home: isHome ? 1 : 0, games_played: priorGames.length };
  const windows = [
    { label: 'L5', size: 5 },
    { label: 'L10', size: 10 },
    { label: 'L20', size: 20 },
    { label: 'L40', size: 40 },
    { label: 'L999', size: 999 }
  ];

  for (const { label, size } of windows) {
    const games = size === 999 ? priorGames : priorGames.slice(-size);
    const safeGames = games.length ? games : priorGames.slice(-1);
    const avgStat = stat => average(safeGames, g => Number(g[stat]) || 0);
    const fgField = 'fga' in safeGames[0] ? 'fga' : ('fgAtt' in safeGames[0] ? 'fgAtt' : 'fga');
    const ftField = 'fta' in safeGames[0] ? 'fta' : ('ftAtt' in safeGames[0] ? 'ftAtt' : 'fta');

    features[`${label}_ppg`] = avgStat('points');
    features[`${label}_rpg`] = avgStat('rebounds');
    features[`${label}_apg`] = avgStat('assists');
    features[`${label}_pra`] = avgStat('points') + avgStat('rebounds') + avgStat('assists');
    features[`${label}_minutes`] = avgStat('minutes');
    features[`${label}_fga`] = avgStat(fgField);
    features[`${label}_fta`] = avgStat(ftField);
  }

  const seasonGames = priorGames.filter(g => getNBASeason(g.date) === getNBASeason(targetDate));
  const seasonSample = seasonGames.length ? seasonGames : priorGames.slice(-10);
  const seasonAvg = stat => average(seasonSample, g => Number(g[stat]) || 0);
  features.season_games_played = seasonSample.length;
  features.season_ppg = seasonAvg('points');
  features.season_rpg = seasonAvg('rebounds');
  features.season_apg = seasonAvg('assists');
  features.season_pra = seasonAvg('points') + seasonAvg('rebounds') + seasonAvg('assists');
  features.season_minutes = seasonAvg('minutes');
  const fgSeasonField = 'fga' in seasonSample[0] ? 'fga' : ('fgAtt' in seasonSample[0] ? 'fgAtt' : 'fga');
  const ftSeasonField = 'fta' in seasonSample[0] ? 'fta' : ('ftAtt' in seasonSample[0] ? 'ftAtt' : 'fta');
  features.season_fga = seasonAvg(fgSeasonField);
  features.season_fta = seasonAvg(ftSeasonField);

  const h2hGames = priorGames.filter(g => g.opponent === opponent);
  const h2hSample = h2hGames.length ? h2hGames : priorGames.slice(-5);
  const h2hAvg = stat => average(h2hSample, g => Number(g[stat]) || 0);
  features.h2h_games_played = h2hSample.length;
  features.h2h_ppg = h2hAvg('points');
  features.h2h_rpg = h2hAvg('rebounds');
  features.h2h_apg = h2hAvg('assists');
  features.h2h_pra = h2hAvg('points') + h2hAvg('rebounds') + h2hAvg('assists');

  const opponentGames = boxscores.filter(g => g.team === opponent && g.date && g.date < targetDate).slice(-10);
  const oppAvg = (slice, stat) => average(slice, g => Number(g[stat]) || 0);
  const oppL5 = opponentGames.slice(-5);
  features.opp_def_L5_ppg_allowed = oppAvg(oppL5, 'points');
  features.opp_def_L5_rpg_allowed = oppAvg(oppL5, 'rebounds');
  features.opp_def_L5_apg_allowed = oppAvg(oppL5, 'assists');
  features.opp_def_L10_ppg_allowed = oppAvg(opponentGames, 'points');
  features.opp_def_L10_rpg_allowed = oppAvg(opponentGames, 'rebounds');
  features.opp_def_L10_apg_allowed = oppAvg(opponentGames, 'assists');

  const lastGame = priorGames[priorGames.length - 1];
  const restDays = lastGame && lastGame.date
    ? Math.max(0, Math.round((new Date(targetDate) - new Date(lastGame.date)) / (1000 * 60 * 60 * 24)))
    : 3;
  features.rest_days = restDays;

  return features;
}

function historicalHitRate(playerName, targetDate, statKey, line) {
  const history = getPlayerHistory(playerName, targetDate).slice(-40);
  if (!history.length) return 0.5;
  const hits = history.filter(g => (Number(g[statKey]) || 0) >= line).length;
  return hits / history.length;
}

function buildFeatureContext(playerName, today, line, marketKey, baseFeatures) {
  const statKey = MARKET_TO_STAT[marketKey];
  const recent = getPlayerRecentStats(playerName, today, statKey);
  const usageRate = baseFeatures.L5_minutes ? (baseFeatures.L5_pra || 0) / Math.max(baseFeatures.L5_minutes, 1) : 0;
  const usageRateL10 = baseFeatures.L10_minutes ? (baseFeatures.L10_pra || 0) / Math.max(baseFeatures.L10_minutes, 1) : usageRate;
  return {
    line,
    impliedProb: 0.5,
    usageRate,
    usageRateL10,
    recentActuals: recent,
    lineHistory: [],
    restDays: baseFeatures.rest_days,
    gamesLast5: getGamesLastNDays(playerName, today, 5),
    travelMilesLast5: 0,
    opponentSwitchRate: 0.1,
    teamPace: DEFAULT_PACE,
    opponentPace: DEFAULT_PACE,
    injuryShock: 0,
    historicalOver: historicalHitRate(playerName, today, statKey, line)
  };
}

function canonicalizePicks(picks) {
  const grouped = new Map();
  for (const pick of picks) {
    const key = `${pick.player}|${pick.propType}|${pick.betSide}`;
    const edge = Number(pick.edge);
    if (!Number.isFinite(edge) || edge <= 0) continue;
    const implied = oddsToImpliedProbability(pick.odds);
    const distance = Math.abs(implied - 0.5);
    const existing = grouped.get(key);
    const shouldReplace = !existing || distance < existing.distance || (distance === existing.distance && edge > existing.edge);
    if (shouldReplace) grouped.set(key, { edge, distance, pick });
  }
  return Array.from(grouped.values()).map(entry => entry.pick);
}

function computeMarketBreakdown(picks) {
  return picks.reduce((acc, pick) => {
    acc[pick.propType] = (acc[pick.propType] || 0) + 1;
    return acc;
  }, { points: 0, rebounds: 0, assists: 0 });
}

function calculateKellyUnits(probability, odds, bankrollUnits = 400, maxUnits = 6) {
  const p = Number(probability) || 0;
  const american = Number(odds) || 0;
  const decimal = american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american || 1);
  const b = decimal - 1;
  if (b <= 0) return { units: 0, fraction: 0 };
  const k = p - ((1 - p) / b);
  const fraction = Math.max(0, k);
  const units = Math.min(fraction * bankrollUnits, maxUnits);
  return { units: Math.round(units * 10) / 10, fraction };
}

async function run() {
  console.log('[1/6] Loading Phase 3.6 inference engine...');
  const engine = await createInferenceEngineV4();

  console.log('[2/6] Fetching odds...');
  const oddsPayload = await fetchOdds();
  console.log(`   ✅ Retrieved ${Array.isArray(oddsPayload) ? oddsPayload.length : 0} events`);

  console.log('[3/6] Parsing odds...');
  const props = parseOdds(oddsPayload);
  console.log(`   ✅ Normalized ${props.length} props`);

  const today = new Date().toISOString().split('T')[0];
  const predictions = [];
  const errors = [];
  const skipped = { noFeatures: 0, belowThreshold: 0, unsupportedMarket: 0 };
  let sampleProjections = 0;

  console.log('[4/6] Running inference...');
  for (const prop of props) {
    const { player, market, side, line, odds, bookmaker, home_team, away_team, commence_time } = prop;
    if (!MARKET_TO_STAT[market]) {
      skipped.unsupportedMarket++;
      continue;
    }

    try {
      const teamContext = getPlayerTeamContext(player, today, home_team, away_team);
      const baseFeatures = calculateBaseFeatures(player, today, teamContext.opponent, teamContext.isHome);
      if (!baseFeatures) {
        skipped.noFeatures++;
        continue;
      }

      const context = buildFeatureContext(player, today, line, market, baseFeatures);
      context.impliedProb = oddsToImpliedProbability(odds);
      const features = buildPhase36Features({ ...baseFeatures, line }, market, context);
      const result = await engine.predict(market, features, line, odds, side);
      
      // Sanity check: Log first few projections to verify real LightGBM
      if (sampleProjections < 3 && result.meetsThreshold) {
        const marketLabel = market.replace('player_', '');
        const l10Key = marketLabel === 'points' ? 'L10_ppg' : marketLabel === 'rebounds' ? 'L10_rpg' : 'L10_apg';
        const l10Value = features[l10Key] || 0;
        console.log(`   Sample ${sampleProjections + 1}: ${player} ${marketLabel} - L10=${l10Value.toFixed(1)}, Proj=${result.proj.toFixed(1)}, Line=${line}, P(${side})=${(side === 'OVER' ? result.p_over : result.p_under).toFixed(3)}`);
        sampleProjections++;
      }
      
      if (!result.meetsThreshold) {
        skipped.belowThreshold++;
        continue;
      }

      const marketLabel = market.replace('player_', '');
      const probability = side === 'OVER' ? result.p_over : result.p_under;
      const { units: kellyUnits, fraction: kellyFraction } = calculateKellyUnits(probability, odds);

      predictions.push({
        player,
        team: teamContext.playerTeam,
        opponent: teamContext.opponent,
        propType: marketLabel,
        betSide: side,
        vegasLine: line,
        odds,
        book: bookmaker,
        game: `${away_team} @ ${home_team}`,
        gameTime: commence_time,
        modelVersion: MODEL_VERSION_TAGS[market] || 'phase3.6',
        projection: result.proj,
        probability: {
          over: result.p_over,
          under: result.p_under,
          calibrated: result.calibrated_probability
        },
        distribution: result.distribution,
        edge: Math.round(result.edge * 10000) / 100,
        impliedProb: result.implied_prob,
        confidenceBucket: result.confidence_bucket,
        lineSensitivity: result.line_sensitivity,
        threshold: result.threshold,
        kellyStake: kellyUnits,
        kellyFraction,
        calibratedProbability: result.calibrated_probability,
        meetsThreshold: result.meetsThreshold
      });
    } catch (err) {
      errors.push({ prop, error: err.message });
    }
  }

  console.log(`   ✅ Generated ${predictions.length} predictions (${errors.length} errors)`);
  console.log(`   Skipped: ${skipped.noFeatures} no-data, ${skipped.belowThreshold} below threshold, ${skipped.unsupportedMarket} unsupported`);

  console.log('[5/6] Canonicalizing payload...');
  const canonicalPicks = canonicalizePicks(predictions);
  const rawBreakdown = computeMarketBreakdown(predictions);
  const canonicalBreakdown = computeMarketBreakdown(canonicalPicks);

  // Get model metadata from engine
  const modelMetadata = {};
  for (const market of Object.keys(MARKET_TO_STAT)) {
    const meta = engine.getModelMetadata(market);
    if (meta) {
      modelMetadata[market] = {
        threshold: meta.threshold,
        projection_mae: meta.projection.test_mae,
        calibration_auc: meta.calibration.test_auc
      };
    }
  }

  const outputPayload = {
    generated_at: new Date().toISOString(),
    model_version: 'phase3.6',
    engine_version: 'v4',
    pipeline: 'projection + logistic calibration',
    source: 'Phase 3.6 projection-based system',
    model_metadata: modelMetadata,
    picks: canonicalPicks,
    stats: {
      total_raw: predictions.length,
      total_canonical: canonicalPicks.length,
      raw_breakdown: rawBreakdown,
      canonical_breakdown: canonicalBreakdown,
      errors: errors.length
    },
    diagnostics: {
      skipped,
      sample_errors: errors.slice(0, 5)
    }
  };

  console.log('[6/6] Writing output...');
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  const tmpPath = path.join(OUTPUT_DIR, OUTPUT_TMP);
  const finalPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
  fs.writeFileSync(tmpPath, JSON.stringify(outputPayload, null, 2));
  fs.renameSync(tmpPath, finalPath);
  console.log(`   ✅ Published ${finalPath}`);
}

run().catch(err => {
  console.error('Phase 3.6 generator failed:', err);
  process.exitCode = 1;
});
