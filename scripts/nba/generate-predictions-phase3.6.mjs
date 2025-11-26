#!/usr/bin/env node
/**
 * Phase 3.6 Production Prediction Generator
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

import { createInferenceEngineV4 } from '../../netlify/functions/_lib/nba-props-engine-v4.mjs';
import { buildPhase36Features } from './_lib/phase36-feature-utils.mjs';
import { augmentLineAwareFeatures } from './_lib/line-feature-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '../../public/data/nba');
const OUTPUT_FILE = 'nba-props-v3-live.json';
const OUTPUT_TMP = 'nba-props-v3-live.json.tmp';

const BOX_SCORES = path.join(__dirname, '../../data/nba/player-history-2024-2026.json');
const REGISTRY_PATH = path.join(__dirname, '../../data/nba/models/phase3_6_model_registry.json');
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_SPORT = 'basketball_nba';
const ODDS_REGIONS = 'us';
const ODDS_MARKETS = 'player_points,player_rebounds,player_assists';

const ALLOWED_BOOKS = ['betmgm', 'caesars', 'draftkings', 'espnbet', 'scorebet', 'fanatics', 'fanduel', 'novig'];

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const boxscores = readJSON(BOX_SCORES);
const registry = readJSON(REGISTRY_PATH);

function normalizeDate(dateStr) {
  const d = new Date(dateStr);
  return d.toISOString().split('T')[0];
}

boxscores.forEach(g => {
  g.date = normalizeDate(g.gameDate || g.date);
});

class OddsClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async fetchEvents() {
    if (!this.apiKey) return this.loadFallback();
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/${ODDS_SPORT}/events?apiKey=${this.apiKey}`;
    const events = await this.fetchJSON(eventsUrl);
    const enriched = [];
    for (const event of events) {
      const oddsUrl = `https://api.the-odds-api.com/v4/sports/${ODDS_SPORT}/events/${event.id}/odds?apiKey=${this.apiKey}&regions=${ODDS_REGIONS}&markets=${ODDS_MARKETS}`;
      try {
        const eventOdds = await this.fetchJSON(oddsUrl);
        enriched.push(eventOdds);
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        console.warn(`Skipping odds for ${event.home_team} vs ${event.away_team}: ${err.message}`);
      }
    }
    return enriched;
  }

  async fetchJSON(url) {
    return new Promise((resolve, reject) => {
      https.get(url, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
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

  loadFallback() {
    const fallbackPath = path.join(__dirname, '../../data/nba/odds/fallback-odds.json');
    if (!fs.existsSync(fallbackPath)) throw new Error('No fallback odds available');
    return readJSON(fallbackPath);
  }
}

function isAllowedBook(name) {
  if (!name) return false;
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALLOWED_BOOKS.some(book => normalized.includes(book));
}

function groupGamesById(boxscoresArr) {
  const map = new Map();
  for (const game of boxscoresArr) {
    const key = `${game.gameId || game.eventId || game.date}_${game.playerName}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(game);
  }
  return map;
}

const playerHistory = groupGamesById(boxscores);

function getPlayerRecentStats(playerName, targetDate, statKey) {
  const history = boxscores
    .filter(g => g.playerName === playerName && g.date < targetDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  return history.slice(-12).map(g => g[statKey] || 0);
}

function getPlayerTeamContext(playerName, targetDate, homeTeam, awayTeam) {
  const history = boxscores
    .filter(g => g.playerName === playerName && g.date < targetDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const lastGame = history[history.length - 1];
  const playerTeam = lastGame?.team || lastGame?.teamAbbrev;
  const isHome = playerTeam ? playerTeam === homeTeam : true;
  const opponent = isHome ? awayTeam : homeTeam;
  return { opponent, isHome };
}

function getNBASeason(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month >= 10) return `${year}-${String(year + 1).slice(-2)}`;
  return `${year - 1}-${String(year).slice(-2)}`;
}

function calculateBaseFeatures(playerName, targetDate, opponent, isHome) {
  const priorGames = boxscores
    .filter(g => g.playerName === playerName && g.date < targetDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!priorGames.length) return null;

  const features = { home: isHome ? 1 : 0, games_played: priorGames.length };

  const rollingWindows = [
    { label: 'L5', size: 5, includeMinutes: true, includeShooting: true },
    { label: 'L10', size: 10, includeMinutes: true, includeShooting: true },
    { label: 'L20', size: 20, includeMinutes: true, includeShooting: true },
    { label: 'L40', size: 40, includeMinutes: true, includeShooting: true },
    { label: 'L999', size: 999, includeMinutes: false, includeShooting: false }
  ];

  for (const { label, size, includeMinutes, includeShooting } of rollingWindows) {
    const windowGames = size === 999 ? priorGames : priorGames.slice(-size);
    const n = windowGames.length;
    if (n > 0) {
      features[`${label}_ppg`] = windowGames.reduce((sum, g) => sum + (g.points || 0), 0) / n;
      features[`${label}_rpg`] = windowGames.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n;
      features[`${label}_apg`] = windowGames.reduce((sum, g) => sum + (g.assists || 0), 0) / n;
      features[`${label}_pra`] = windowGames.reduce((sum, g) => sum + ((g.points || 0) + (g.rebounds || 0) + (g.assists || 0)), 0) / n;
      if (includeMinutes) features[`${label}_minutes`] = windowGames.reduce((sum, g) => sum + (g.minutes || 0), 0) / n;
      if (includeShooting) {
        features[`${label}_fga`] = windowGames.reduce((sum, g) => sum + (g.fgAtt || g.fga || 0), 0) / n;
        features[`${label}_fta`] = windowGames.reduce((sum, g) => sum + (g.ftAtt || g.fta || 0), 0) / n;
      }
    } else {
      features[`${label}_ppg`] = 0;
      features[`${label}_rpg`] = 0;
      features[`${label}_apg`] = 0;
      features[`${label}_pra`] = 0;
      if (includeMinutes) features[`${label}_minutes`] = 0;
      if (includeShooting) {
        features[`${label}_fga`] = 0;
        features[`${label}_fta`] = 0;
      }
    }
  }

  const targetSeason = getNBASeason(targetDate);
  const seasonGames = priorGames.filter(g => getNBASeason(g.date) === targetSeason);
  if (seasonGames.length) {
    const n = seasonGames.length;
    features.season_games_played = n;
    features.season_ppg = seasonGames.reduce((sum, g) => sum + (g.points || 0), 0) / n;
    features.season_rpg = seasonGames.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n;
    features.season_apg = seasonGames.reduce((sum, g) => sum + (g.assists || 0), 0) / n;
    features.season_pra = seasonGames.reduce((sum, g) => sum + ((g.points || 0) + (g.rebounds || 0) + (g.assists || 0)), 0) / n;
    features.season_minutes = seasonGames.reduce((sum, g) => sum + (g.minutes || 0), 0) / n;
    features.season_fga = seasonGames.reduce((sum, g) => sum + (g.fgAtt || g.fga || 0), 0) / n;
    features.season_fta = seasonGames.reduce((sum, g) => sum + (g.ftAtt || g.fta || 0), 0) / n;
  } else {
    features.season_games_played = 0;
    features.season_ppg = 0;
    features.season_rpg = 0;
    features.season_apg = 0;
    features.season_pra = 0;
    features.season_minutes = 0;
    features.season_fga = 0;
    features.season_fta = 0;
  }

  const h2hGames = seasonGames.filter(g => g.opponent === opponent);
  if (h2hGames.length) {
    const n = h2hGames.length;
    features.h2h_games_played = n;
    features.h2h_ppg = h2hGames.reduce((sum, g) => sum + (g.points || 0), 0) / n;
    features.h2h_rpg = h2hGames.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n;
    features.h2h_apg = h2hGames.reduce((sum, g) => sum + (g.assists || 0), 0) / n;
    features.h2h_pra = h2hGames.reduce((sum, g) => sum + ((g.points || 0) + (g.rebounds || 0) + (g.assists || 0)), 0) / n;
    features.h2h_minutes = h2hGames.reduce((sum, g) => sum + (g.minutes || 0), 0) / n;
    features.h2h_fga = h2hGames.reduce((sum, g) => sum + (g.fgAtt || g.fga || 0), 0) / n;
    features.h2h_fta = h2hGames.reduce((sum, g) => sum + (g.ftAtt || g.fta || 0), 0) / n;
  } else {
    features.h2h_games_played = 0;
    features.h2h_ppg = 0;
    features.h2h_rpg = 0;
    features.h2h_apg = 0;
    features.h2h_pra = 0;
    features.h2h_minutes = 0;
    features.h2h_fga = 0;
    features.h2h_fta = 0;
  }

  const oppGames = boxscores.filter(g => g.team === opponent && g.date < targetDate).slice(-10);
  if (oppGames.length >= 5) {
    const L5_opp = oppGames.slice(-5);
    const n5 = L5_opp.length;
    features.opp_def_L5_ppg_allowed = L5_opp.reduce((sum, g) => sum + (g.points || 0), 0) / n5;
    features.opp_def_L5_rpg_allowed = L5_opp.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n5;
    features.opp_def_L5_apg_allowed = L5_opp.reduce((sum, g) => sum + (g.assists || 0), 0) / n5;
    features.opp_def_L5_pra_allowed = L5_opp.reduce((sum, g) => sum + ((g.points || 0) + (g.rebounds || 0) + (g.assists || 0)), 0) / n5;
    const n10 = oppGames.length;
    features.opp_def_L10_ppg_allowed = oppGames.reduce((sum, g) => sum + (g.points || 0), 0) / n10;
    features.opp_def_L10_rpg_allowed = oppGames.reduce((sum, g) => sum + (g.rebounds || 0), 0) / n10;
    features.opp_def_L10_apg_allowed = oppGames.reduce((sum, g) => sum + (g.assists || 0), 0) / n10;
    features.opp_def_L10_pra_allowed = oppGames.reduce((sum, g) => sum + ((g.points || 0) + (g.rebounds || 0) + (g.assists || 0)), 0) / n10;
  } else {
    features.opp_def_L5_ppg_allowed = 0;
    features.opp_def_L5_rpg_allowed = 0;
    features.opp_def_L5_apg_allowed = 0;
    features.opp_def_L5_pra_allowed = 0;
    features.opp_def_L10_ppg_allowed = 0;
    features.opp_def_L10_rpg_allowed = 0;
    features.opp_def_L10_apg_allowed = 0;
    features.opp_def_L10_pra_allowed = 0;
  }

  if (priorGames.length) {
    const lastGameDate = new Date(priorGames[priorGames.length - 1].date);
    const targetDateObj = new Date(targetDate);
    const restDays = Math.floor((targetDateObj - lastGameDate) / (1000 * 60 * 60 * 24));
    features.rest_days = restDays;
  } else {
    features.rest_days = 0;
  }

  return features;
}

async function main() {
  console.log('=== Phase 3.6 Generator (line-aware) ===');
  const oddsClient = new OddsClient(ODDS_API_KEY);
  const oddsData = await oddsClient.fetchEvents();
  const engine = await createInferenceEngineV4();
  const picks = [];

  for (const event of oddsData) {
    const commence = event.commence_time ? event.commence_time.split('T')[0] : null;
    for (const bookmaker of event.bookmakers || []) {
      if (!isAllowedBook(bookmaker.key)) continue;
      for (const market of bookmaker.markets || []) {
        const marketKey = market.key;
        for (const outcome of market.outcomes || []) {
          const playerName = outcome.description;
          const line = outcome.point;
          const odds = outcome.price;
          const side = marketKey.includes('over') || outcome.name === 'Over' ? 'Over' : 'Under';
          const marketType = market.key.includes('points') ? 'player_points' : market.key.includes('rebounds') ? 'player_rebounds' : 'player_assists';

          const baseFeatures = calculateBaseFeatures(playerName, commence, event.away_team, event.home_team === event.away_team ? 1 : 0);
          if (!baseFeatures) continue;
          augmentLineAwareFeatures(baseFeatures, marketType, line);
          const context = {
            line,
            impliedProb: outcome.price < 0 ? Math.abs(outcome.price) / (Math.abs(outcome.price) + 100) : 100 / (outcome.price + 100),
            usageRate: baseFeatures.L5_pra ? baseFeatures.L5_pra / Math.max(baseFeatures.L5_minutes, 1) : 0,
            recentActuals: getPlayerRecentStats(playerName, commence, marketType === 'player_points' ? 'points' : marketType === 'player_rebounds' ? 'rebounds' : 'assists'),
            lineHistory: [],
            restDays: baseFeatures.rest_days ?? 2
          };
          const features = buildPhase36Features(baseFeatures, marketType, context);
          try {
            const prediction = await engine.predict(marketType, features, line, odds, side);
            picks.push({
              player: playerName,
              market: marketType,
              side,
              line,
              odds,
              book: bookmaker.key,
              projection: prediction.proj,
              distribution: prediction.distribution,
              probability: {
                over: prediction.p_over,
                under: prediction.p_under,
                calibrated: prediction.calibrated_probability
              },
              edge: prediction.edge,
              implied_prob: prediction.implied_prob,
              confidence_bucket: prediction.confidence_bucket,
              line_sensitivity: prediction.line_sensitivity
            });
          } catch (err) {
            console.warn(`Prediction failed for ${playerName} ${marketType}:`, err.message);
          }
        }
      }
    }
  }

  const payload = {
    version: registry.version,
    generated_at: new Date().toISOString(),
    model_registry: 'data/nba/models/phase3_6_model_registry.json',
    picks
  };

  const tmpPath = path.join(OUTPUT_DIR, OUTPUT_TMP);
  const finalPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tmpPath, finalPath);
  console.log(`✅ Wrote ${picks.length} props to ${finalPath}`);
}

main().catch(err => {
  console.error('Generator failed:', err);
  process.exit(1);
});
