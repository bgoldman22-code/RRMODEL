-- MLB Round Robin Model - Database Schema
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Players table
CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    mlb_id INTEGER UNIQUE,
    name VARCHAR(255) NOT NULL,
    team VARCHAR(10),
    position VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player stats table (by season)
CREATE TABLE player_stats (
    id SERIAL PRIMARY KEY,
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    games INTEGER,
    at_bats INTEGER,
    plate_appearances INTEGER,
    home_runs INTEGER,
    iso DECIMAL(5, 3),
    hr_fb_rate DECIMAL(5, 3),
    hard_contact_pct DECIMAL(5, 3),
    hr_rate DECIMAL(5, 4),
    hr_score DECIMAL(6, 2),
    avg DECIMAL(4, 3),
    obp DECIMAL(4, 3),
    slg DECIMAL(4, 3),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, season)
);

-- Odds snapshots table
CREATE TABLE odds_snapshots (
    id SERIAL PRIMARY KEY,
    game_date DATE NOT NULL,
    player_id INTEGER REFERENCES players(id),
    player_name VARCHAR(255) NOT NULL,
    bookmaker VARCHAR(50) DEFAULT 'fanduel',
    market VARCHAR(50) DEFAULT 'batter_home_runs',
    odds_decimal DECIMAL(6, 2),
    odds_american INTEGER,
    point DECIMAL(3, 1) DEFAULT 0.5,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_closing_odds BOOLEAN DEFAULT FALSE,
    INDEX idx_odds_date (game_date),
    INDEX idx_odds_player (player_id, game_date)
);

-- Daily picks table
CREATE TABLE daily_picks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pick_date DATE NOT NULL,
    player_id INTEGER REFERENCES players(id),
    player_name VARCHAR(255) NOT NULL,
    rank_position INTEGER NOT NULL,
    hr_score DECIMAL(6, 2),
    opening_odds DECIMAL(6, 2),
    closing_odds DECIMAL(6, 2),
    unit_size DECIMAL(6, 2) DEFAULT 10.00,
    kelly_stake DECIMAL(6, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_picks_date (pick_date),
    UNIQUE(pick_date, player_id)
);

-- Round Robin structures table
CREATE TABLE rr_structures (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    num_picks INTEGER NOT NULL,
    num_parlays INTEGER NOT NULL,
    daily_cost DECIMAL(8, 2) NOT NULL,
    description TEXT
);

-- Insert RR structures
INSERT INTO rr_structures (name, num_picks, num_parlays, daily_cost, description) VALUES
('3-Pick RR', 3, 3, 30.00, '3 two-team parlays from 3 players'),
('4-Pick RR', 4, 6, 60.00, '6 two-team parlays from 4 players'),
('5-Pick RR', 5, 10, 100.00, '10 two-team parlays from 5 players'),
('6-Pick RR', 6, 15, 150.00, '15 two-team parlays from 6 players');

-- Parlays table
CREATE TABLE parlays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    structure_id INTEGER REFERENCES rr_structures(id),
    parlay_date DATE NOT NULL,
    player1_id INTEGER REFERENCES players(id),
    player2_id INTEGER REFERENCES players(id),
    player1_odds DECIMAL(6, 2),
    player2_odds DECIMAL(6, 2),
    stake DECIMAL(6, 2) DEFAULT 10.00,
    potential_payout DECIMAL(8, 2),
    actual_payout DECIMAL(8, 2) DEFAULT 0.00,
    is_winner BOOLEAN DEFAULT FALSE,
    settled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_parlays_date (parlay_date),
    INDEX idx_parlays_structure (structure_id, parlay_date)
);

-- Game results table
CREATE TABLE game_results (
    id SERIAL PRIMARY KEY,
    game_date DATE NOT NULL,
    game_pk INTEGER UNIQUE,
    home_team VARCHAR(50),
    away_team VARCHAR(50),
    venue VARCHAR(255),
    home_score INTEGER,
    away_score INTEGER,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_results_date (game_date)
);

-- Home runs table
CREATE TABLE home_runs (
    id SERIAL PRIMARY KEY,
    game_result_id INTEGER REFERENCES game_results(id) ON DELETE CASCADE,
    game_date DATE NOT NULL,
    batter_id INTEGER,
    batter_name VARCHAR(255) NOT NULL,
    pitcher_id INTEGER,
    pitcher_name VARCHAR(255),
    inning INTEGER,
    half_inning VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_hrs_date (game_date),
    INDEX idx_hrs_batter (batter_name, game_date)
);

-- Bankroll tracking table
CREATE TABLE bankroll_log (
    id SERIAL PRIMARY KEY,
    transaction_date DATE NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- 'deposit', 'withdrawal', 'bet', 'win', 'loss'
    amount DECIMAL(10, 2) NOT NULL,
    balance_after DECIMAL(10, 2) NOT NULL,
    structure_id INTEGER REFERENCES rr_structures(id),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_bankroll_date (transaction_date)
);

-- Initialize starting bankroll
INSERT INTO bankroll_log (transaction_date, transaction_type, amount, balance_after, description)
VALUES (CURRENT_DATE, 'deposit', 10000.00, 10000.00, 'Initial bankroll');

-- Performance metrics table (aggregated daily)
CREATE TABLE daily_performance (
    id SERIAL PRIMARY KEY,
    performance_date DATE UNIQUE NOT NULL,
    structure_id INTEGER REFERENCES rr_structures(id),
    total_cost DECIMAL(8, 2),
    total_payout DECIMAL(8, 2),
    net_profit DECIMAL(8, 2),
    roi_pct DECIMAL(6, 2),
    winning_parlays INTEGER DEFAULT 0,
    total_parlays INTEGER,
    win_rate_pct DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_perf_date (performance_date),
    INDEX idx_perf_structure (structure_id)
);

-- CLV tracking table
CREATE TABLE clv_tracking (
    id SERIAL PRIMARY KEY,
    pick_id UUID REFERENCES daily_picks(id) ON DELETE CASCADE,
    pick_date DATE NOT NULL,
    player_name VARCHAR(255),
    opening_odds DECIMAL(6, 2),
    closing_odds DECIMAL(6, 2),
    clv_pct DECIMAL(6, 3), -- (closing - opening) / opening * 100
    is_positive BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_clv_date (pick_date)
);

-- Injury tracking table
CREATE TABLE player_injuries (
    id SERIAL PRIMARY KEY,
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    player_name VARCHAR(255),
    injury_date DATE NOT NULL,
    injury_type VARCHAR(255),
    status VARCHAR(50), -- 'day-to-day', 'IL-10', 'IL-60', 'out', 'questionable'
    return_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    source VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_injury_player (player_id),
    INDEX idx_injury_date (injury_date)
);

-- User settings table (for future multi-user support)
CREATE TABLE user_settings (
    id SERIAL PRIMARY KEY,
    user_id UUID DEFAULT uuid_generate_v4(),
    starting_bankroll DECIMAL(10, 2) DEFAULT 10000.00,
    kelly_fraction DECIMAL(3, 2) DEFAULT 0.25,
    max_daily_risk_pct DECIMAL(3, 2) DEFAULT 0.10,
    max_bet_size_pct DECIMAL(3, 2) DEFAULT 0.05,
    default_structure VARCHAR(50) DEFAULT '5-Pick RR',
    auto_exclude_injured BOOLEAN DEFAULT TRUE,
    email_notifications BOOLEAN DEFAULT FALSE,
    email_address VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO user_settings (user_id) VALUES (uuid_generate_v4());

-- Create views for common queries

-- Current bankroll view
CREATE VIEW v_current_bankroll AS
SELECT 
    balance_after as current_balance,
    transaction_date as last_updated
FROM bankroll_log
ORDER BY id DESC
LIMIT 1;

-- Today's picks view
CREATE VIEW v_todays_picks AS
SELECT 
    dp.id,
    dp.pick_date,
    dp.player_name,
    p.team,
    dp.rank_position,
    dp.hr_score,
    dp.opening_odds,
    dp.closing_odds,
    dp.kelly_stake,
    COALESCE(pi.status, 'healthy') as injury_status
FROM daily_picks dp
LEFT JOIN players p ON dp.player_id = p.id
LEFT JOIN player_injuries pi ON dp.player_id = pi.player_id AND pi.is_active = TRUE
WHERE dp.pick_date = CURRENT_DATE
ORDER BY dp.rank_position;

-- Overall performance view
CREATE VIEW v_overall_performance AS
SELECT 
    rs.name as structure_name,
    COUNT(DISTINCT dp.performance_date) as days_traded,
    SUM(dp.total_cost) as total_investment,
    SUM(dp.total_payout) as total_payout,
    SUM(dp.net_profit) as net_profit,
    AVG(dp.roi_pct) as avg_roi_pct,
    AVG(dp.win_rate_pct) as avg_win_rate_pct
FROM daily_performance dp
JOIN rr_structures rs ON dp.structure_id = rs.id
GROUP BY rs.id, rs.name;

-- Create functions

-- Function to calculate parlay payout
CREATE OR REPLACE FUNCTION calculate_parlay_payout(
    p_odds1 DECIMAL,
    p_odds2 DECIMAL,
    p_stake DECIMAL
) RETURNS DECIMAL AS $$
BEGIN
    RETURN p_stake * p_odds1 * p_odds2;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update player stats timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER update_players_updated_at
    BEFORE UPDATE ON players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_player_stats_updated_at
    BEFORE UPDATE ON player_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_players_name ON players(name);
CREATE INDEX idx_player_stats_season ON player_stats(season);
CREATE INDEX idx_player_stats_hr_score ON player_stats(hr_score DESC);

-- Grant permissions (adjust for your user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;

-- Add comments for documentation
COMMENT ON TABLE players IS 'Master table for MLB players';
COMMENT ON TABLE player_stats IS 'Seasonal statistics for each player';
COMMENT ON TABLE odds_snapshots IS 'Historical odds data from bookmakers';
COMMENT ON TABLE daily_picks IS 'Daily player selections from the model';
COMMENT ON TABLE parlays IS 'Individual two-team parlays with results';
COMMENT ON TABLE bankroll_log IS 'Complete transaction history for bankroll tracking';
COMMENT ON TABLE clv_tracking IS 'Closing Line Value analysis for picks';
COMMENT ON TABLE player_injuries IS 'Player injury status and history';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'MLB Round Robin database schema created successfully!';
    RAISE NOTICE 'Tables: %, Views: %, Functions: %', 
        (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'),
        (SELECT count(*) FROM information_schema.views WHERE table_schema = 'public'),
        (SELECT count(*) FROM information_schema.routines WHERE routine_schema = 'public');
END $$;
