/**
 * MLB Research V1 - Leakage Guard Unit Tests
 * 
 * These tests verify that the leakage prevention system works correctly.
 * Run with: npx vitest run lib/mlb_research/leakage_guard.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isStrictlyBefore,
  isTimestampBefore,
  validateGameRecord,
  checkForLeakage,
  getHistoricalGames,
  getPlayerGamesForRolling,
  stripOutcomes,
  validateDataset,
  type LeakageViolation
} from './leakage_guard.js';
import type { MLBResearchGameV1 } from './types.js';

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

function createMinimalGameRecord(overrides: Partial<{
  game_pk: number;
  game_date: string;
  season: number;
  scheduled_first_pitch_utc: string;
}>): MLBResearchGameV1 {
  const defaults = {
    game_pk: 123456,
    game_date: '2024-06-15',
    season: 2024,
    scheduled_first_pitch_utc: '2024-06-15T23:00:00Z'
  };
  
  const merged = { ...defaults, ...overrides };
  
  // Create a minimal valid game record
  return {
    schema_version: '1.0.0',
    game_id: {
      game_pk: merged.game_pk,
      game_date: merged.game_date,
      season: merged.season,
      scheduled_first_pitch_utc: merged.scheduled_first_pitch_utc,
      actual_first_pitch_utc: null
    },
    home_team: {
      team_id: 147,
      abbreviation: 'NYY',
      full_name: 'New York Yankees',
      league: 'AL',
      division: 'East'
    },
    away_team: {
      team_id: 111,
      abbreviation: 'BOS',
      full_name: 'Boston Red Sox',
      league: 'AL',
      division: 'East'
    },
    pregame: {
      home_lineup: createMockLineup(9),
      away_lineup: createMockLineup(9),
      home_starter: {
        player: { player_id: 543243, full_name: 'Gerrit Cole', primary_position: 'P', bats: 'R', throws: 'R' },
        status: 'confirmed',
        source: 'mlb_api',
        confirmed_at_utc: '2024-06-15T15:00:00Z'
      },
      away_starter: {
        player: { player_id: 453562, full_name: 'Chris Sale', primary_position: 'P', bats: 'L', throws: 'L' },
        status: 'confirmed',
        source: 'mlb_api',
        confirmed_at_utc: '2024-06-15T15:00:00Z'
      },
      weather: null,
      venue: {
        venue_id: 3313,
        name: 'Yankee Stadium',
        city: 'Bronx',
        state: 'NY',
        has_roof: false,
        surface: 'grass',
        park_factor_runs: 103,
        park_factor_hr: 108,
        park_factor_hr_lhb: 115,
        park_factor_hr_rhb: 102,
        cf_distance_ft: 408,
        lf_distance_ft: 318,
        rf_distance_ft: 314,
        lf_wall_height_ft: 8,
        rf_wall_height_ft: 8,
        elevation_ft: 55
      },
      odds: null,
      day_night: 'night',
      day_of_week: 6
    },
    features: {
      home_batters: createMockBatterFeatures(9),
      away_batters: createMockBatterFeatures(9),
      home_pitcher: createMockPitcherFeatures(543243, 'home'),
      away_pitcher: createMockPitcherFeatures(453562, 'away'),
      home_team: createMockTeamFeatures(147, 'NYY'),
      away_team: createMockTeamFeatures(111, 'BOS')
    },
    outcome: {
      home_score: 5,
      away_score: 3,
      innings: 9,
      home_f5_score: 3,
      away_f5_score: 2,
      total_runs: 8,
      f5_total_runs: 5,
      home_win: true,
      home_batters: createMockBatterOutcomes(9),
      away_batters: createMockBatterOutcomes(9),
      home_pitcher: createMockPitcherOutcome(543243),
      away_pitcher: createMockPitcherOutcome(453562),
      total_hr: 2,
      total_sb: 1,
      duration_minutes: 187
    },
    meta: {
      created_at_utc: '2024-06-16T04:00:00Z',
      features_computed_at_utc: '2024-06-15T20:00:00Z',
      quality_flags: {
        lineup_confirmed: true,
        weather_available: false,
        odds_available: false,
        statcast_available: true,
        issues: []
      }
    }
  } as MLBResearchGameV1;
}

function createMockLineup(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    batting_order: i + 1,
    player: {
      player_id: 100000 + i,
      full_name: `Player ${i + 1}`,
      primary_position: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'DH'][i],
      bats: 'R' as const,
      throws: 'R' as const
    },
    position: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'DH'][i],
    source: 'mlb_api_confirmed' as const,
    confirmed_at_utc: '2024-06-15T15:00:00Z'
  }));
}

function createMockBatterFeatures(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    player: {
      player_id: 100000 + i,
      full_name: `Player ${i + 1}`,
      primary_position: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'DH'][i],
      bats: 'R' as const,
      throws: 'R' as const
    },
    batting_order: i + 1,
    rolling: {},
    splits: {
      vs_lhp: createMockBatterStats(100000 + i),
      vs_rhp: createMockBatterStats(100000 + i)
    },
    matchup: {},
    days_rest: 0,
    games_last_7d: 6,
    is_hot: false,
    is_cold: false
  }));
}

function createMockBatterStats(playerId: number) {
  return {
    player_id: playerId,
    games: 10,
    pa: 40,
    ab: 35,
    h: 10,
    doubles: 2,
    triples: 0,
    hr: 1,
    rbi: 5,
    runs: 6,
    bb: 4,
    k: 8,
    sb: 1,
    cs: 0,
    avg: 0.286,
    obp: 0.350,
    slg: 0.429,
    ops: 0.779,
    iso: 0.143,
    babip: 0.310,
    k_rate: 0.200,
    bb_rate: 0.100,
    hr_rate: 0.025
  };
}

function createMockPitcherFeatures(playerId: number, homeAway: 'home' | 'away') {
  return {
    player: {
      player_id: playerId,
      full_name: 'Test Pitcher',
      primary_position: 'P',
      bats: 'R' as const,
      throws: 'R' as const
    },
    home_away: homeAway,
    rolling: {},
    splits: {
      vs_lhb: createMockPitcherStats(playerId),
      vs_rhb: createMockPitcherStats(playerId)
    },
    matchup: {},
    days_rest: 5,
    opp_lineup_lhb_pct: 0.333
  };
}

function createMockPitcherStats(playerId: number) {
  return {
    player_id: playerId,
    games: 5,
    ip: 30,
    bf: 120,
    h: 25,
    r: 10,
    er: 9,
    hr: 3,
    bb: 8,
    k: 35,
    era: 2.70,
    whip: 1.10,
    k_9: 10.5,
    bb_9: 2.4,
    hr_9: 0.9,
    k_rate: 0.292,
    bb_rate: 0.067,
    k_bb: 0.225
  };
}

function createMockTeamFeatures(teamId: number, abbr: string) {
  return {
    team: {
      team_id: teamId,
      abbreviation: abbr,
      full_name: `${abbr} Team`,
      league: 'AL' as const,
      division: 'East' as const
    },
    rolling_L10: {
      runs_scored_avg: 4.5,
      runs_allowed_avg: 3.8,
      win_pct: 0.600,
      ops: 0.750,
      era: 3.80
    },
    bullpen_std: {
      era: 3.50,
      whip: 1.25,
      k_9: 9.5,
      bb_9: 3.2,
      usage_last_3d: 8.0
    }
  };
}

function createMockBatterOutcomes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    player_id: 100000 + i,
    pa: 4,
    ab: 4,
    h: 1,
    doubles: 0,
    triples: 0,
    hr: 0,
    rbi: 0,
    runs: 0,
    bb: 0,
    k: 1,
    sb: 0,
    h_r_rbi: 1,
    total_bases: 1,
    hit_hr: false,
    hit_2_hr: false,
    hits_2_plus: false,
    h_r_rbi_3_plus: false
  }));
}

function createMockPitcherOutcome(playerId: number) {
  return {
    player_id: playerId,
    ip: 6.0,
    outs_recorded: 18,
    bf: 24,
    h: 5,
    r: 2,
    er: 2,
    hr: 1,
    bb: 2,
    k: 7,
    pitches: 95,
    strikes: 62,
    quality_start: true,
    win: true,
    loss: false,
    k_5_plus: true,
    k_6_plus: true,
    k_7_plus: true,
    outs_15_plus: true,
    outs_18_plus: true
  };
}

// ============================================================================
// DATE UTILITY TESTS
// ============================================================================

describe('Date Utilities', () => {
  describe('isStrictlyBefore', () => {
    it('returns true when date A is before date B', () => {
      expect(isStrictlyBefore('2024-06-14', '2024-06-15')).toBe(true);
    });
    
    it('returns false when dates are the same', () => {
      expect(isStrictlyBefore('2024-06-15', '2024-06-15')).toBe(false);
    });
    
    it('returns false when date A is after date B', () => {
      expect(isStrictlyBefore('2024-06-16', '2024-06-15')).toBe(false);
    });
    
    it('handles year boundaries', () => {
      expect(isStrictlyBefore('2023-12-31', '2024-01-01')).toBe(true);
    });
    
    it('ignores time component', () => {
      expect(isStrictlyBefore('2024-06-14T23:59:59Z', '2024-06-15T00:00:01Z')).toBe(true);
      expect(isStrictlyBefore('2024-06-15T00:00:01Z', '2024-06-15T23:59:59Z')).toBe(false);
    });
  });
  
  describe('isTimestampBefore', () => {
    it('returns true when timestamp A is before timestamp B', () => {
      expect(isTimestampBefore('2024-06-15T12:00:00Z', '2024-06-15T13:00:00Z')).toBe(true);
    });
    
    it('returns false when timestamps are equal', () => {
      expect(isTimestampBefore('2024-06-15T12:00:00Z', '2024-06-15T12:00:00Z')).toBe(false);
    });
    
    it('returns false when timestamp A is after timestamp B', () => {
      expect(isTimestampBefore('2024-06-15T14:00:00Z', '2024-06-15T13:00:00Z')).toBe(false);
    });
  });
});

// ============================================================================
// SCHEMA VALIDATION TESTS
// ============================================================================

describe('Schema Validation', () => {
  describe('validateGameRecord', () => {
    it('validates a correct game record', () => {
      const game = createMinimalGameRecord({});
      const result = validateGameRecord(game);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('rejects non-object input', () => {
      const result = validateGameRecord(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Game record must be an object');
    });
    
    it('reports missing required fields', () => {
      const result = validateGameRecord({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: schema_version');
      expect(result.errors).toContain('Missing required field: game_id');
    });
    
    it('rejects invalid schema version', () => {
      const game = createMinimalGameRecord({});
      (game as any).schema_version = '2.0.0';
      const result = validateGameRecord(game);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('schema_version'))).toBe(true);
    });
    
    it('validates lineup length', () => {
      const game = createMinimalGameRecord({});
      game.pregame.home_lineup = createMockLineup(8); // Only 8 batters
      const result = validateGameRecord(game);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('home_lineup'))).toBe(true);
    });
  });
});

// ============================================================================
// LEAKAGE DETECTION TESTS
// ============================================================================

describe('Leakage Detection', () => {
  describe('checkForLeakage', () => {
    it('passes when all historical games are before target', () => {
      const targetGame = createMinimalGameRecord({ game_date: '2024-06-15', game_pk: 100 });
      const historicalGames = [
        createMinimalGameRecord({ game_date: '2024-06-14', game_pk: 99 }),
        createMinimalGameRecord({ game_date: '2024-06-13', game_pk: 98 }),
        createMinimalGameRecord({ game_date: '2024-06-12', game_pk: 97 })
      ];
      
      const result = checkForLeakage(targetGame, historicalGames);
      expect(result.passed).toBe(true);
      expect(result.violations.filter(v => v.severity === 'critical')).toHaveLength(0);
    });
    
    it('detects same-day game in historical data', () => {
      const targetGame = createMinimalGameRecord({ game_date: '2024-06-15', game_pk: 100 });
      const historicalGames = [
        createMinimalGameRecord({ game_date: '2024-06-15', game_pk: 101 }) // Same day!
      ];
      
      const result = checkForLeakage(targetGame, historicalGames);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.type === 'temporal')).toBe(true);
    });
    
    it('detects future game in historical data', () => {
      const targetGame = createMinimalGameRecord({ game_date: '2024-06-15', game_pk: 100 });
      const historicalGames = [
        createMinimalGameRecord({ game_date: '2024-06-16', game_pk: 102 }) // Future!
      ];
      
      const result = checkForLeakage(targetGame, historicalGames);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.type === 'temporal')).toBe(true);
    });
    
    it('detects same game in historical data (critical leakage)', () => {
      const targetGame = createMinimalGameRecord({ game_date: '2024-06-15', game_pk: 100 });
      const historicalGames = [
        createMinimalGameRecord({ game_date: '2024-06-14', game_pk: 100 }) // Same game_pk!
      ];
      
      const result = checkForLeakage(targetGame, historicalGames);
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.type === 'same_game_data')).toBe(true);
    });
  });
});

// ============================================================================
// HISTORICAL GAME FILTERING TESTS
// ============================================================================

describe('Historical Game Filtering', () => {
  describe('getHistoricalGames', () => {
    let allGames: MLBResearchGameV1[];
    
    beforeEach(() => {
      allGames = [
        createMinimalGameRecord({ game_date: '2024-06-10', game_pk: 1 }),
        createMinimalGameRecord({ game_date: '2024-06-11', game_pk: 2 }),
        createMinimalGameRecord({ game_date: '2024-06-12', game_pk: 3 }),
        createMinimalGameRecord({ game_date: '2024-06-13', game_pk: 4 }),
        createMinimalGameRecord({ game_date: '2024-06-14', game_pk: 5 }),
        createMinimalGameRecord({ game_date: '2024-06-15', game_pk: 6 }) // Target day
      ];
    });
    
    it('returns only games strictly before target date', () => {
      const historical = getHistoricalGames(allGames, '2024-06-14');
      expect(historical).toHaveLength(3);
      expect(historical.map(g => g.game_id.game_pk)).toEqual([1, 2, 3]);
    });
    
    it('excludes same-day games', () => {
      const historical = getHistoricalGames(allGames, '2024-06-13');
      expect(historical).toHaveLength(2);
      expect(historical.every(g => g.game_id.game_date !== '2024-06-13')).toBe(true);
    });
    
    it('excludes specific game_pk if provided', () => {
      const historical = getHistoricalGames(allGames, '2024-06-15', 3);
      expect(historical.some(g => g.game_id.game_pk === 3)).toBe(false);
    });
    
    it('returns empty array when no prior games exist', () => {
      const historical = getHistoricalGames(allGames, '2024-06-10');
      expect(historical).toHaveLength(0);
    });
  });
  
  describe('getPlayerGamesForRolling', () => {
    let allGames: MLBResearchGameV1[];
    const testPlayerId = 100000; // First player in mock lineup
    
    beforeEach(() => {
      allGames = [
        createMinimalGameRecord({ game_date: '2024-06-10', game_pk: 1 }),
        createMinimalGameRecord({ game_date: '2024-06-11', game_pk: 2 }),
        createMinimalGameRecord({ game_date: '2024-06-12', game_pk: 3 }),
        createMinimalGameRecord({ game_date: '2024-06-13', game_pk: 4 }),
        createMinimalGameRecord({ game_date: '2024-06-14', game_pk: 5 })
      ];
    });
    
    it('returns correct number of games for window size', () => {
      const playerGames = getPlayerGamesForRolling(allGames, testPlayerId, '2024-06-15', 3, 'batter');
      expect(playerGames.length).toBeLessThanOrEqual(3);
    });
    
    it('returns games in reverse chronological order', () => {
      const playerGames = getPlayerGamesForRolling(allGames, testPlayerId, '2024-06-15', 10, 'batter');
      for (let i = 0; i < playerGames.length - 1; i++) {
        const currentDate = new Date(playerGames[i].game_id.game_date);
        const nextDate = new Date(playerGames[i + 1].game_id.game_date);
        expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
      }
    });
    
    it('excludes games on or after target date', () => {
      const playerGames = getPlayerGamesForRolling(allGames, testPlayerId, '2024-06-13', 10, 'batter');
      expect(playerGames.every(g => g.game_id.game_date < '2024-06-13')).toBe(true);
    });
  });
});

// ============================================================================
// FEATURE ISOLATION TESTS
// ============================================================================

describe('Feature Isolation', () => {
  describe('stripOutcomes', () => {
    it('removes outcome data from game record', () => {
      const game = createMinimalGameRecord({});
      const stripped = stripOutcomes(game);
      
      expect('outcome' in stripped).toBe(false);
      expect('pregame' in stripped).toBe(true);
      expect('features' in stripped).toBe(true);
    });
    
    it('preserves all pregame data', () => {
      const game = createMinimalGameRecord({});
      const stripped = stripOutcomes(game);
      
      expect(stripped.pregame).toEqual(game.pregame);
      expect(stripped.features).toEqual(game.features);
      expect(stripped.game_id).toEqual(game.game_id);
    });
  });
});

// ============================================================================
// DATASET VALIDATION TESTS
// ============================================================================

describe('Dataset Validation', () => {
  describe('validateDataset', () => {
    it('validates a clean dataset', () => {
      const games = [
        createMinimalGameRecord({ game_date: '2024-06-10', game_pk: 1 }),
        createMinimalGameRecord({ game_date: '2024-06-11', game_pk: 2 }),
        createMinimalGameRecord({ game_date: '2024-06-12', game_pk: 3 })
      ];
      
      const result = validateDataset(games);
      expect(result.valid).toBe(true);
      expect(result.summary.validGames).toBe(3);
      expect(result.summary.invalidGames).toBe(0);
    });
    
    it('reports invalid games', () => {
      const games = [
        createMinimalGameRecord({ game_date: '2024-06-10', game_pk: 1 }),
        createMinimalGameRecord({ game_date: '2024-06-11', game_pk: 2 })
      ];
      
      // Break one game
      (games[1] as any).schema_version = 'invalid';
      
      const result = validateDataset(games);
      expect(result.valid).toBe(false);
      expect(result.summary.invalidGames).toBe(1);
      expect(result.gameErrors.has(2)).toBe(true);
    });
    
    it('provides accurate summary', () => {
      const games = [
        createMinimalGameRecord({ game_date: '2024-06-10', game_pk: 1 }),
        createMinimalGameRecord({ game_date: '2024-06-11', game_pk: 2 }),
        createMinimalGameRecord({ game_date: '2024-06-12', game_pk: 3 })
      ];
      
      const result = validateDataset(games);
      expect(result.summary.totalGames).toBe(3);
    });
  });
});
