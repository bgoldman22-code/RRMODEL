#!/usr/bin/env node
/**
 * Schedule Source Module
 * 
 * Loads NFL schedules for future week predictions.
 * For 2025: reads from netlify/data/nfl/2025/schedule.full.json
 * 
 * Schedule structure:
 * {
 *   "weeks": {
 *     "11": {
 *       "matchups": [
 *         {
 *           "id": "2025_11_NYJ_NE",
 *           "homeTeam": "New England Patriots",
 *           "awayTeam": "New York Jets",
 *           "kickoff": "2025-11-14T00:15:00Z"
 *         }
 *       ]
 *     }
 *   }
 * }
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Team name to abbreviation mapping
const TEAM_NAME_TO_ABBREV = {
  'Arizona Cardinals': 'ARI',
  'Atlanta Falcons': 'ATL',
  'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF',
  'Carolina Panthers': 'CAR',
  'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN',
  'Cleveland Browns': 'CLE',
  'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN',
  'Detroit Lions': 'DET',
  'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU',
  'Indianapolis Colts': 'IND',
  'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC',
  'Las Vegas Raiders': 'LV',
  'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LA',
  'Miami Dolphins': 'MIA',
  'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE',
  'New Orleans Saints': 'NO',
  'New York Giants': 'NYG',
  'New York Jets': 'NYJ',
  'Philadelphia Eagles': 'PHI',
  'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF',
  'Seattle Seahawks': 'SEA',
  'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN',
  'Washington Commanders': 'WAS',
  // Legacy names (in case older schedules use them)
  'Washington Football Team': 'WAS',
  'Washington Redskins': 'WAS',
  'Oakland Raiders': 'LV',
  'St. Louis Rams': 'LA',
  'San Diego Chargers': 'LAC'
};

/**
 * Convert full team name to abbreviation
 * @param {string} teamName - Full team name (e.g., "New England Patriots")
 * @returns {string} Team abbreviation (e.g., "NE")
 * @throws {Error} If team name is not recognized
 */
function teamNameToAbbrev(teamName) {
  const abbrev = TEAM_NAME_TO_ABBREV[teamName];
  if (!abbrev) {
    throw new Error(`Unknown team name: "${teamName}". Please update TEAM_NAME_TO_ABBREV mapping.`);
  }
  return abbrev;
}

/**
 * Load schedule for a given NFL season & week
 * 
 * Returns a list of games with standardized format:
 * - season (number)
 * - week (number)
 * - home_team (abbreviation, e.g., "NE")
 * - away_team (abbreviation, e.g., "NYJ")
 * - kickoff (ISO string or null)
 * - game_id (unique identifier)
 * 
 * @param {Object} params - Parameters
 * @param {number} params.season - NFL season (e.g., 2025)
 * @param {number} params.week - Week number (1-18 for regular season)
 * @returns {Promise<Array>} Array of game objects
 * @throws {Error} If schedule file not found or week has no games
 * 
 * @example
 * const games = await loadWeekSchedule({ season: 2025, week: 11 });
 * // => [
 * //   {
 * //     season: 2025,
 * //     week: 11,
 * //     home_team: "NE",
 * //     away_team: "NYJ",
 * //     kickoff: "2025-11-14T00:15:00Z",
 * //     game_id: "2025_11_NYJ_NE"
 * //   }
 * // ]
 */
export async function loadWeekSchedule({ season, week }) {
  // Construct path to schedule file
  const schedulePath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'netlify',
    'data',
    'nfl',
    String(season),
    'schedule.full.json'
  );

  // Load and parse schedule
  let schedule;
  try {
    const raw = await readFile(schedulePath, 'utf8');
    schedule = JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Schedule file not found for season ${season}. ` +
        `Expected at: ${schedulePath}`
      );
    }
    throw new Error(`Failed to load schedule: ${error.message}`);
  }

  const targetWeek = String(week);

  // Find week in schedule (support different structures)
  const weekNode =
    schedule.weeks?.[targetWeek] ||
    schedule.weekMap?.[targetWeek] ||
    schedule[targetWeek];

  if (!weekNode) {
    throw new Error(
      `No schedule data found for season=${season}, week=${targetWeek}. ` +
      `Available weeks: ${Object.keys(schedule.weeks || {}).join(', ')}`
    );
  }

  // Extract matchups
  const matchups = weekNode.matchups || weekNode.games || weekNode;

  if (!Array.isArray(matchups) || matchups.length === 0) {
    throw new Error(
      `No games found for season=${season}, week=${targetWeek}`
    );
  }

  // Convert to standardized format
  const games = matchups
    .filter((m) => m && m.homeTeam && m.awayTeam)
    .map((m) => {
      try {
        return {
          season: Number(season),
          week: Number(week),
          home_team: teamNameToAbbrev(m.homeTeam),
          away_team: teamNameToAbbrev(m.awayTeam),
          kickoff: m.kickoff || m.gameTime || m.gameDate || null,
          game_id:
            m.id ||
            m.gameId ||
            `${season}_${week}_${teamNameToAbbrev(m.awayTeam)}_${teamNameToAbbrev(m.homeTeam)}`,
        };
      } catch (error) {
        console.warn(`⚠️  Skipping game ${m.awayTeam} @ ${m.homeTeam}: ${error.message}`);
        return null;
      }
    })
    .filter(Boolean); // Remove nulls from skipped games

  return games;
}

/**
 * Check if schedule exists for a given season
 * 
 * @param {number} season - NFL season
 * @returns {Promise<boolean>} True if schedule file exists
 */
export async function hasSchedule(season) {
  const schedulePath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'netlify',
    'data',
    'nfl',
    String(season),
    'schedule.full.json'
  );

  try {
    await readFile(schedulePath, 'utf8');
    return true;
  } catch {
    return false;
  }
}
