/**
 * MLB Research V1 Schema Types
 * 
 * CRITICAL LEAKAGE PREVENTION:
 * - All "pregame" fields contain ONLY data available BEFORE first pitch
 * - All "outcome" fields contain ONLY data from AFTER first pitch
 * - The schema is designed to make leakage structurally impossible
 * 
 * Version: 1.0.0
 * Last Updated: 2025-01-14
 */

// ============================================================================
// CORE IDENTIFIERS
// ============================================================================

export interface GameId {
  /** MLB Stats API game_pk - unique identifier */
  game_pk: number;
  /** ISO date string YYYY-MM-DD */
  game_date: string;
  /** Season year (2021-2025) */
  season: number;
  /** Scheduled first pitch time in UTC ISO format */
  scheduled_first_pitch_utc: string;
  /** Actual first pitch time in UTC ISO format (null if game not started) */
  actual_first_pitch_utc: string | null;
}

export interface TeamInfo {
  /** MLB team ID */
  team_id: number;
  /** Team abbreviation (e.g., "NYY", "LAD") */
  abbreviation: string;
  /** Full team name */
  full_name: string;
  /** League: "AL" or "NL" */
  league: 'AL' | 'NL';
  /** Division: "East", "Central", "West" */
  division: 'East' | 'Central' | 'West';
}

export interface PlayerInfo {
  /** MLB player ID */
  player_id: number;
  /** Full name */
  full_name: string;
  /** Primary position */
  primary_position: string;
  /** Bats: L, R, S (switch) */
  bats: 'L' | 'R' | 'S';
  /** Throws: L, R */
  throws: 'L' | 'R';
}

// ============================================================================
// PREGAME CONTEXT (AVAILABLE BEFORE FIRST PITCH)
// ============================================================================

export interface PregameLineup {
  /** Batting order position (1-9) */
  batting_order: number;
  /** Player information */
  player: PlayerInfo;
  /** Defensive position for this game */
  position: string;
  /** Source of lineup data */
  source: 'mlb_api_confirmed' | 'mlb_api_probable' | 'fallback_rotowire' | 'fallback_espn';
  /** When this lineup was confirmed (UTC) */
  confirmed_at_utc: string;
}

export interface PregameStartingPitcher {
  /** Pitcher information */
  player: PlayerInfo;
  /** Probability status */
  status: 'confirmed' | 'probable' | 'expected';
  /** Source of information */
  source: 'mlb_api' | 'rotowire' | 'espn';
  /** When this was confirmed (UTC) */
  confirmed_at_utc: string;
}

export interface PregameWeather {
  /** Temperature in Fahrenheit */
  temperature_f: number;
  /** Wind speed in MPH */
  wind_speed_mph: number;
  /** Wind direction in degrees (0-360, 0=North) */
  wind_direction_degrees: number;
  /** Wind direction relative to field: "out", "in", "cross_lf", "cross_rf" */
  wind_relative_to_field: 'out' | 'in' | 'cross_lf' | 'cross_rf' | 'calm';
  /** Humidity percentage */
  humidity_percent: number;
  /** Precipitation probability percentage */
  precip_prob_percent: number;
  /** Weather condition */
  condition: 'clear' | 'cloudy' | 'partly_cloudy' | 'overcast' | 'rain' | 'drizzle' | 'dome';
  /** Data source */
  source: 'openweathermap' | 'visualcrossing' | 'weatherapi' | 'dome_default';
  /** Forecast timestamp (when forecast was made) */
  forecast_made_at_utc: string;
}

export interface VenueInfo {
  /** MLB venue ID */
  venue_id: number;
  /** Venue name */
  name: string;
  /** City */
  city: string;
  /** State/Province */
  state: string;
  /** Is retractable roof */
  has_roof: boolean;
  /** Roof status if applicable */
  roof_status?: 'open' | 'closed' | 'unknown';
  /** Field surface */
  surface: 'grass' | 'turf';
  /** Park factor for runs (100 = neutral) */
  park_factor_runs: number;
  /** Park factor for HRs (100 = neutral) */
  park_factor_hr: number;
  /** Park factor for LHB HRs */
  park_factor_hr_lhb: number;
  /** Park factor for RHB HRs */
  park_factor_hr_rhb: number;
  /** Center field distance */
  cf_distance_ft: number;
  /** Left field distance */
  lf_distance_ft: number;
  /** Right field distance */
  rf_distance_ft: number;
  /** Left field wall height */
  lf_wall_height_ft: number;
  /** Right field wall height */
  rf_wall_height_ft: number;
  /** Elevation in feet */
  elevation_ft: number;
}

export interface PregameOdds {
  /** Moneyline odds for home team */
  home_ml: number;
  /** Moneyline odds for away team */
  away_ml: number;
  /** Run line spread (typically -1.5/+1.5) */
  run_line: number;
  /** Run line home odds */
  run_line_home_odds: number;
  /** Run line away odds */
  run_line_away_odds: number;
  /** Over/under total */
  total: number;
  /** Over odds */
  over_odds: number;
  /** Under odds */
  under_odds: number;
  /** First 5 innings total (if available) */
  f5_total?: number;
  /** Sportsbook source */
  source: string;
  /** Timestamp of odds snapshot */
  snapshot_at_utc: string;
}

export interface PregameContext {
  /** Home team lineup */
  home_lineup: PregameLineup[];
  /** Away team lineup */
  away_lineup: PregameLineup[];
  /** Home starting pitcher */
  home_starter: PregameStartingPitcher;
  /** Away starting pitcher */
  away_starter: PregameStartingPitcher;
  /** Weather forecast for game time */
  weather: PregameWeather | null;
  /** Venue information with park factors */
  venue: VenueInfo;
  /** Pregame betting odds */
  odds: PregameOdds | null;
  /** Day/Night game */
  day_night: 'day' | 'night';
  /** Day of week (0=Sunday, 6=Saturday) */
  day_of_week: number;
  /** Is double header game 1 or 2 */
  double_header_game?: 1 | 2;
}

// ============================================================================
// ROLLING WINDOW FEATURES (COMPUTED FROM HISTORICAL DATA BEFORE GAME)
// ============================================================================

export interface BatterRollingStats {
  /** Player ID */
  player_id: number;
  /** Number of games in window */
  games: number;
  /** Plate appearances */
  pa: number;
  /** At bats */
  ab: number;
  /** Hits */
  h: number;
  /** Doubles */
  doubles: number;
  /** Triples */
  triples: number;
  /** Home runs */
  hr: number;
  /** RBIs */
  rbi: number;
  /** Runs scored */
  runs: number;
  /** Walks */
  bb: number;
  /** Strikeouts */
  k: number;
  /** Stolen bases */
  sb: number;
  /** Caught stealing */
  cs: number;
  /** Batting average */
  avg: number;
  /** On-base percentage */
  obp: number;
  /** Slugging percentage */
  slg: number;
  /** OPS */
  ops: number;
  /** ISO (isolated power) */
  iso: number;
  /** BABIP */
  babip: number;
  /** K rate */
  k_rate: number;
  /** BB rate */
  bb_rate: number;
  /** HR rate (HR/PA) */
  hr_rate: number;
  /** Hard hit rate (if Statcast available) */
  hard_hit_rate?: number;
  /** Barrel rate (if Statcast available) */
  barrel_rate?: number;
  /** Average exit velocity (if Statcast available) */
  avg_exit_velo?: number;
  /** Average launch angle (if Statcast available) */
  avg_launch_angle?: number;
  /** xBA (if Statcast available) */
  xba?: number;
  /** xSLG (if Statcast available) */
  xslg?: number;
  /** xwOBA (if Statcast available) */
  xwoba?: number;
}

export interface BatterRollingWindows {
  /** Last 3 games */
  L3?: BatterRollingStats;
  /** Last 5 games */
  L5?: BatterRollingStats;
  /** Last 10 games */
  L10?: BatterRollingStats;
  /** Last 20 games */
  L20?: BatterRollingStats;
  /** Last 40 games */
  L40?: BatterRollingStats;
  /** Season-to-date */
  STD?: BatterRollingStats;
}

export interface BatterVsHandedness {
  /** vs LHP stats (season-to-date) */
  vs_lhp: BatterRollingStats;
  /** vs RHP stats (season-to-date) */
  vs_rhp: BatterRollingStats;
}

export interface BatterVsOpponent {
  /** Career stats vs this pitcher (if >= 10 PA) */
  vs_pitcher?: BatterRollingStats;
  /** Career stats at this venue (if >= 20 PA) */
  vs_venue?: BatterRollingStats;
  /** Season stats vs this team */
  vs_team_std?: BatterRollingStats;
}

export interface BatterFeaturePack {
  /** Player info */
  player: PlayerInfo;
  /** Batting order position this game */
  batting_order: number;
  /** Rolling window stats */
  rolling: BatterRollingWindows;
  /** Platoon splits */
  splits: BatterVsHandedness;
  /** Matchup-specific stats */
  matchup: BatterVsOpponent;
  /** Days since last game */
  days_rest: number;
  /** Games played in last 7 days */
  games_last_7d: number;
  /** Is player hot? (OPS > 1.000 last 10 games) */
  is_hot: boolean;
  /** Is player cold? (OPS < .500 last 10 games) */
  is_cold: boolean;
}

export interface PitcherRollingStats {
  /** Player ID */
  player_id: number;
  /** Games/starts in window */
  games: number;
  /** Innings pitched */
  ip: number;
  /** Batters faced */
  bf: number;
  /** Hits allowed */
  h: number;
  /** Runs allowed */
  r: number;
  /** Earned runs */
  er: number;
  /** Home runs allowed */
  hr: number;
  /** Walks */
  bb: number;
  /** Strikeouts */
  k: number;
  /** ERA */
  era: number;
  /** WHIP */
  whip: number;
  /** K/9 */
  k_9: number;
  /** BB/9 */
  bb_9: number;
  /** HR/9 */
  hr_9: number;
  /** K rate */
  k_rate: number;
  /** BB rate */
  bb_rate: number;
  /** K-BB rate */
  k_bb: number;
  /** GB rate (if available) */
  gb_rate?: number;
  /** FB rate (if available) */
  fb_rate?: number;
  /** Hard hit rate against (if Statcast available) */
  hard_hit_rate?: number;
  /** Barrel rate against (if Statcast available) */
  barrel_rate?: number;
  /** Average exit velo against (if Statcast available) */
  avg_exit_velo?: number;
  /** xERA (if Statcast available) */
  xera?: number;
  /** xFIP (if available) */
  xfip?: number;
  /** SIERA (if available) */
  siera?: number;
  /** Pitch count in last start */
  last_start_pitches?: number;
  /** Outs recorded in last start */
  last_start_outs?: number;
}

export interface PitcherRollingWindows {
  /** Last 2 starts */
  L2?: PitcherRollingStats;
  /** Last 3 starts */
  L3?: PitcherRollingStats;
  /** Last 5 starts */
  L5?: PitcherRollingStats;
  /** Last 10 starts */
  L10?: PitcherRollingStats;
  /** Last 20 starts */
  L20?: PitcherRollingStats;
  /** Season-to-date */
  STD?: PitcherRollingStats;
}

export interface PitcherVsHandedness {
  /** vs LHB stats (season-to-date) */
  vs_lhb: PitcherRollingStats;
  /** vs RHB stats (season-to-date) */
  vs_rhb: PitcherRollingStats;
}

export interface PitcherVsOpponent {
  /** Career stats vs opposing team (if >= 50 BF) */
  vs_team?: PitcherRollingStats;
  /** Career stats at this venue (if >= 30 BF) */
  vs_venue?: PitcherRollingStats;
}

export interface PitcherFeaturePack {
  /** Player info */
  player: PlayerInfo;
  /** Is home or away starter */
  home_away: 'home' | 'away';
  /** Rolling window stats */
  rolling: PitcherRollingWindows;
  /** Platoon splits */
  splits: PitcherVsHandedness;
  /** Matchup-specific stats */
  matchup: PitcherVsOpponent;
  /** Days since last start */
  days_rest: number;
  /** Average pitches per start (L5) */
  avg_pitches_l5?: number;
  /** Average outs per start (L5) */
  avg_outs_l5?: number;
  /** Lineup handed composition (% LHB in opposing lineup) */
  opp_lineup_lhb_pct: number;
}

export interface TeamFeaturePack {
  /** Team info */
  team: TeamInfo;
  /** Team rolling stats (L10 games) */
  rolling_L10: {
    runs_scored_avg: number;
    runs_allowed_avg: number;
    win_pct: number;
    ops: number;
    era: number;
  };
  /** Bullpen stats (season-to-date) */
  bullpen_std: {
    era: number;
    whip: number;
    k_9: number;
    bb_9: number;
    war?: number;
    usage_last_3d: number; // Innings pitched by bullpen last 3 days
  };
}

export interface FeaturePacks {
  /** All batters in home lineup */
  home_batters: BatterFeaturePack[];
  /** All batters in away lineup */
  away_batters: BatterFeaturePack[];
  /** Home starting pitcher */
  home_pitcher: PitcherFeaturePack;
  /** Away starting pitcher */
  away_pitcher: PitcherFeaturePack;
  /** Home team aggregates */
  home_team: TeamFeaturePack;
  /** Away team aggregates */
  away_team: TeamFeaturePack;
}

// ============================================================================
// OUTCOMES (KNOWN ONLY AFTER GAME COMPLETED)
// ============================================================================

export interface BatterGameOutcome {
  /** Player ID */
  player_id: number;
  /** Plate appearances */
  pa: number;
  /** At bats */
  ab: number;
  /** Hits */
  h: number;
  /** Doubles */
  doubles: number;
  /** Triples */
  triples: number;
  /** Home runs */
  hr: number;
  /** RBI */
  rbi: number;
  /** Runs */
  runs: number;
  /** Walks */
  bb: number;
  /** Strikeouts */
  k: number;
  /** Stolen bases */
  sb: number;
  /** H+R+RBI total */
  h_r_rbi: number;
  /** Total bases */
  total_bases: number;
  /** Did player hit HR? (binary) */
  hit_hr: boolean;
  /** Did player hit 2+ HRs? */
  hit_2_hr: boolean;
  /** Did player get 2+ hits? */
  hits_2_plus: boolean;
  /** Did player get 3+ H+R+RBI? */
  h_r_rbi_3_plus: boolean;
}

export interface PitcherGameOutcome {
  /** Player ID */
  player_id: number;
  /** Innings pitched (as decimal, e.g., 6.2 = 6 2/3) */
  ip: number;
  /** Outs recorded */
  outs_recorded: number;
  /** Batters faced */
  bf: number;
  /** Hits allowed */
  h: number;
  /** Runs allowed */
  r: number;
  /** Earned runs */
  er: number;
  /** Home runs allowed */
  hr: number;
  /** Walks */
  bb: number;
  /** Strikeouts */
  k: number;
  /** Pitches thrown */
  pitches: number;
  /** Strikes thrown */
  strikes: number;
  /** Quality start (6+ IP, 3 or fewer ER) */
  quality_start: boolean;
  /** Win */
  win: boolean;
  /** Loss */
  loss: boolean;
  /** Did pitcher get 5+ Ks? */
  k_5_plus: boolean;
  /** Did pitcher get 6+ Ks? */
  k_6_plus: boolean;
  /** Did pitcher get 7+ Ks? */
  k_7_plus: boolean;
  /** Did pitcher record 15+ outs? */
  outs_15_plus: boolean;
  /** Did pitcher record 18+ outs? */
  outs_18_plus: boolean;
}

export interface GameOutcome {
  /** Final score */
  home_score: number;
  away_score: number;
  /** Innings played (9 for regulation, more for extras) */
  innings: number;
  /** First 5 innings scores */
  home_f5_score: number;
  away_f5_score: number;
  /** Total runs */
  total_runs: number;
  /** F5 total runs */
  f5_total_runs: number;
  /** Did home team win? */
  home_win: boolean;
  /** Did home team cover run line? */
  home_cover_rl?: boolean;
  /** Did game go over total? */
  over?: boolean;
  /** Individual batter outcomes */
  home_batters: BatterGameOutcome[];
  away_batters: BatterGameOutcome[];
  /** Pitcher outcomes */
  home_pitcher: PitcherGameOutcome;
  away_pitcher: PitcherGameOutcome;
  /** Total HRs in game */
  total_hr: number;
  /** Total stolen bases in game */
  total_sb: number;
  /** Game duration in minutes */
  duration_minutes: number;
  /** Was game delayed/postponed? */
  delay_reason?: string;
}

// ============================================================================
// MAIN GAME RECORD
// ============================================================================

export interface MLBResearchGameV1 {
  /** Schema version */
  schema_version: '1.0.0';
  /** Game identification */
  game_id: GameId;
  /** Home team */
  home_team: TeamInfo;
  /** Away team */
  away_team: TeamInfo;
  /** Pregame context - available BEFORE first pitch */
  pregame: PregameContext;
  /** Feature packs - computed from historical data BEFORE game */
  features: FeaturePacks;
  /** Game outcomes - available ONLY AFTER game completed */
  outcome: GameOutcome;
  /** Metadata about this record */
  meta: {
    /** When this record was created */
    created_at_utc: string;
    /** When features were last computed */
    features_computed_at_utc: string;
    /** Data quality flags */
    quality_flags: {
      /** Is lineup confirmed? */
      lineup_confirmed: boolean;
      /** Is weather available? */
      weather_available: boolean;
      /** Is odds data available? */
      odds_available: boolean;
      /** Are Statcast features available? */
      statcast_available: boolean;
      /** Any data quality issues? */
      issues: string[];
    };
  };
}

// ============================================================================
// LEAKAGE GUARD TYPE HELPERS
// ============================================================================

/**
 * Type that represents ONLY pregame data - use this when building features
 * to ensure no outcome data can leak in
 */
export type PregameOnly = Pick<MLBResearchGameV1, 
  'schema_version' | 'game_id' | 'home_team' | 'away_team' | 'pregame' | 'features' | 'meta'
>;

/**
 * Type that represents outcome data - only accessed during evaluation
 */
export type OutcomeOnly = Pick<MLBResearchGameV1, 'outcome'>;

/**
 * Type guard to check if a game record is complete (has outcomes)
 */
export function isCompleteGame(game: Partial<MLBResearchGameV1>): game is MLBResearchGameV1 {
  return game.outcome !== undefined && game.outcome !== null;
}

/**
 * Type guard to ensure we're only accessing pregame data
 */
export function getPregameData(game: MLBResearchGameV1): PregameOnly {
  const { outcome, ...pregame } = game;
  return pregame as PregameOnly;
}
