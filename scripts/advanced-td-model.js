// scripts/advanced-td-model.js
// Advanced TD prediction model using NFLVerse data and market-calibrated probabilities

const fs = require('fs').promises;
const path = require('path');

class AdvancedTDModel {
    constructor() {
        this.playerFeatures = null;
        
        // Market-calibrated base TD rates by position (reflecting real betting markets)
        this.baseTdRates = {
            'RB': 0.35,    // Top RBs often -120 to -150 odds (54-60%) but average much lower
            'WR': 0.28,    // Elite WRs often -130 to -160 odds (52-57%) but most are role players
            'TE': 0.22,    // Top TEs often -140 to -180 odds (45-53%) but limited weekly upside
            'QB': 0.18     // Rushing QBs often -150 to -200 odds (38-50%) but very situational
        };

        // Situational multipliers based on game context
        this.gameContextMultipliers = {
            highTotal: 1.15,      // Games with O/U > 48
            lowTotal: 0.88,       // Games with O/U < 42
            roadFavorite: 1.08,   // Road favorites tend to run more
            homeUnderdog: 0.95,   // Home underdogs may throw more
            primetime: 1.05       // Primetime games slightly higher scoring
        };

        // Position-specific feature weights
        this.featureWeights = {
            'RB': {
                recentTdRate: 0.35,
                redZoneCarries: 0.25,
                goalLineRole: 0.20,
                explosiveRunRate: 0.10,
                consistencyScore: 0.10
            },
            'WR': {
                recentTdRate: 0.30,
                redZoneTargets: 0.25,
                explosiveRecRate: 0.15,
                yacPerReception: 0.15,
                endZoneTargets: 0.15
            },
            'TE': {
                recentTdRate: 0.30,
                redZoneTargets: 0.30,
                redZoneTargetShare: 0.20,
                consistencyScore: 0.10,
                yacPerReception: 0.10
            },
            'QB': {
                recentTdRate: 0.40,
                rushingTdRate: 0.25,
                goalLineSnaps: 0.20,
                consistencyScore: 0.15
            }
        };
    }

    async loadPlayerFeatures() {
        try {
            const dataPath = path.join(__dirname, '..', 'data', 'nfl-player-features-2025.json');
            const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
            this.playerFeatures = data.players;
            console.log(`✅ Loaded advanced features for ${Object.keys(this.playerFeatures).length} players`);
            return true;
        } catch (error) {
            console.error('❌ Could not load player features:', error.message);
            return false;
        }
    }

    // Calculate TD probability using advanced features
    calculateAnytimeTDProbability(playerKey, gameContext = {}) {
        const player = this.playerFeatures[playerKey];
        if (!player) return 0;

        const position = player.position;
        const baseRate = this.baseTdRates[position] || 0.25;
        const weights = this.featureWeights[position] || {};

        // Calculate feature score
        let featureScore = 0;
        let totalWeight = 0;

        Object.entries(weights).forEach(([feature, weight]) => {
            if (player[feature] !== undefined) {
                let normalizedValue = this.normalizeFeature(feature, player[feature], position);
                featureScore += normalizedValue * weight;
                totalWeight += weight;
            }
        });

        // Normalize feature score (0-1 scale)
        const normalizedFeatureScore = totalWeight > 0 ? featureScore / totalWeight : 0.5;
        
        // Combine base rate with feature score
        let tdProbability = baseRate * (0.5 + (normalizedFeatureScore * 1.0)); // Range: 0.5x to 1.5x base rate

        // Apply game context multipliers
        tdProbability *= this.getGameContextMultiplier(gameContext);
        
        // Apply elite player bonuses and role clarity
        tdProbability *= this.getPlayerRoleMultiplier(player);

        // Cap probabilities to realistic ranges based on actual market data
        return Math.max(0.12, Math.min(0.65, tdProbability));
    }

    // Normalize features to 0-1 scale based on position-specific distributions
    normalizeFeature(feature, value, position) {
        const normalizations = {
            recentTdRate: { min: 0, max: 2.0, optimal: 1.5 },
            redZoneCarries: { min: 0, max: 4.0, optimal: 3.0 },
            redZoneTargets: { min: 0, max: 5.0, optimal: 4.0 },
            explosiveRunRate: { min: 0, max: 0.3, optimal: 0.15 },
            explosiveRecRate: { min: 0, max: 0.4, optimal: 0.25 },
            yacPerReception: { min: 0, max: 20, optimal: 12 },
            consistencyScore: { min: 0, max: 1.0, optimal: 0.8 },
            goalLineRole: { min: 0, max: 1.0, optimal: 0.7 },
            rushingTdRate: { min: 0, max: 1.5, optimal: 1.0 }
        };

        const norm = normalizations[feature];
        if (!norm) return 0.5; // Default middle value

        // Sigmoid-like normalization favoring optimal values
        const normalizedValue = Math.max(0, Math.min(1, value / norm.max));
        const optimalRatio = norm.optimal / norm.max;
        
        // Boost values near optimal
        if (normalizedValue >= optimalRatio) {
            return 0.7 + (0.3 * (normalizedValue - optimalRatio) / (1 - optimalRatio));
        } else {
            return 0.7 * (normalizedValue / optimalRatio);
        }
    }

    getGameContextMultiplier(gameContext) {
        let multiplier = 1.0;

        if (gameContext.overUnder > 48) multiplier *= this.gameContextMultipliers.highTotal;
        if (gameContext.overUnder < 42) multiplier *= this.gameContextMultipliers.lowTotal;
        if (gameContext.isRoadFavorite) multiplier *= this.gameContextMultipliers.roadFavorite;
        if (gameContext.isHomeUnderdog) multiplier *= this.gameContextMultipliers.homeUnderdog;
        if (gameContext.isPrimetime) multiplier *= this.gameContextMultipliers.primetime;

        return multiplier;
    }

    getPlayerRoleMultiplier(player) {
        let multiplier = 1.0;

        // Elite performers get boost, but not extreme
        if (player.recentTdRate > 1.2) multiplier *= 1.15;
        else if (player.recentTdRate > 0.8) multiplier *= 1.08;
        else if (player.recentTdRate < 0.2) multiplier *= 0.90;

        // Red zone specialists get moderate boost
        const redZoneOpportunities = (player.redZoneCarriesEst || 0) + (player.redZoneTargetsEst || 0);
        if (redZoneOpportunities > 3.5) multiplier *= 1.12;
        else if (redZoneOpportunities > 2.5) multiplier *= 1.06;
        else if (redZoneOpportunities < 1.0) multiplier *= 0.94;

        // Consistency matters but not overwhelming
        if (player.consistencyScore > 0.7) multiplier *= 1.04;
        else if (player.consistencyScore < 0.3) multiplier *= 0.96;

        return multiplier;
    }

    // Calculate first TD probability (typically 15-18% of anytime TD)
    calculateFirstTDProbability(anytimeTdProb, player) {
        const position = player.position;
        let firstTdMultiplier = 0.16; // Base 16% of anytime TD

        // RBs more likely for first TD due to early drives
        if (position === 'RB') firstTdMultiplier = 0.18;
        else if (position === 'QB') firstTdMultiplier = 0.17; // QB sneaks
        else if (position === 'WR') firstTdMultiplier = 0.15;
        else if (position === 'TE') firstTdMultiplier = 0.14;

        // Elite players get slight boost
        if (player.recentTdRate > 1.0) firstTdMultiplier *= 1.1;

        return anytimeTdProb * firstTdMultiplier;
    }

    // Calculate multiple TD probability
    calculateMultipleTDProbability(anytimeTdProb, player) {
        const position = player.position;
        
        // Non-linear relationship: higher base probability = exponentially higher multiple TD chance
        let baseMultiplier = Math.pow(anytimeTdProb, 1.4); // Exponential scaling
        
        // Position adjustments
        if (position === 'RB') baseMultiplier *= 1.3;      // RBs most likely for multiples
        else if (position === 'WR') baseMultiplier *= 1.1; // Elite WRs can get multiples
        else if (position === 'TE') baseMultiplier *= 0.9; // TEs rarely get multiples
        else if (position === 'QB') baseMultiplier *= 0.8; // QBs occasionally get multiple rushing

        // Elite player bonus
        if (player.recentTdRate > 1.2) baseMultiplier *= 1.4;
        else if (player.recentTdRate > 0.8) baseMultiplier *= 1.2;

        // Red zone role bonus
        const redZoneRole = (player.redZoneCarriesEst || 0) + (player.redZoneTargetsEst || 0);
        if (redZoneRole > 3.0) baseMultiplier *= 1.3;

        return Math.max(0.02, Math.min(0.35, baseMultiplier));
    }

    // Generate predictions for all players in active games
    async generatePredictions(games = []) {
        if (!this.playerFeatures) {
            const loaded = await this.loadPlayerFeatures();
            if (!loaded) {
                throw new Error('Could not load player features');
            }
        }

        const predictions = [];
        let totalProcessed = 0;

        for (const game of games) {
            const gameContext = this.extractGameContext(game);
            const gamePlayers = [];

            // Find players for this game
            Object.entries(this.playerFeatures).forEach(([playerKey, player]) => {
                const [playerName, team] = playerKey.split('_');
                
                // Match team to game
                if (team === game.home_team || team === game.away_team) {
                    const anytimeProb = this.calculateAnytimeTDProbability(playerKey, gameContext);
                    const firstTdProb = this.calculateFirstTDProbability(anytimeProb, player);
                    const multipleTdProb = this.calculateMultipleTDProbability(anytimeProb, player);

                    gamePlayers.push({
                        player_id: playerKey,
                        name: player.name,
                        position: player.position,
                        team: player.team,
                        anytime_td: {
                            probability: Math.round(anytimeProb * 1000) / 1000,
                            confidence: Math.round(anytimeProb * 100),
                            implied_odds: this.probabilityToOdds(anytimeProb)
                        },
                        first_td: {
                            probability: Math.round(firstTdProb * 1000) / 1000,
                            implied_odds: this.probabilityToOdds(firstTdProb)
                        },
                        multiple_td: {
                            probability: Math.round(multipleTdProb * 1000) / 1000,
                            implied_odds: this.probabilityToOdds(multipleTdProb)
                        },
                        key_factors: {
                            recent_td_rate: player.recentTdRate || 0,
                            red_zone_opportunities: (player.redZoneCarriesEst || 0) + (player.redZoneTargetsEst || 0),
                            explosiveness: Math.max(player.explosiveRunRate || 0, player.explosiveRecRate || 0),
                            consistency: player.consistencyScore || 0,
                            season_tds: player.seasonTDs || 0
                        }
                    });
                    totalProcessed++;
                }
            });

            if (gamePlayers.length > 0) {
                predictions.push({
                    game_id: `${game.away_team}_${game.home_team}`,
                    home_team: game.home_team,
                    away_team: game.away_team,
                    players: gamePlayers.sort((a, b) => b.anytime_td.probability - a.anytime_td.probability)
                });
            }
        }

        console.log(`✅ Generated advanced TD predictions for ${totalProcessed} players across ${predictions.length} games`);
        
        return {
            success: true,
            metadata: {
                model: 'advanced-nflverse-v1',
                generated_at: new Date().toISOString(),
                games_processed: predictions.length,
                total_players: totalProcessed,
                data_source: 'nflverse_features',
                calibration: 'market_odds'
            },
            predictions: predictions
        };
    }

    extractGameContext(game) {
        // Extract available game context (would be enhanced with real data)
        return {
            overUnder: game.total || 47.5,
            spread: game.spread || 0,
            isRoadFavorite: false,
            isHomeUnderdog: false,
            isPrimetime: false
        };
    }

    probabilityToOdds(probability) {
        if (probability >= 0.5) {
            return Math.round(-100 / (probability / (1 - probability)));
        } else {
            return Math.round(100 * ((1 - probability) / probability));
        }
    }

    // Validation against known market ranges
    validatePredictions(predictions) {
        console.log('\n🎯 ADVANCED MODEL VALIDATION:');
        
        const allPlayers = [];
        predictions.predictions.forEach(game => {
            allPlayers.push(...game.players);
        });

        // Sort by anytime TD probability
        allPlayers.sort((a, b) => b.anytime_td.probability - a.anytime_td.probability);

        console.log('\n📊 TOP 10 ANYTIME TD PREDICTIONS:');
        allPlayers.slice(0, 10).forEach((player, index) => {
            const prob = (player.anytime_td.probability * 100).toFixed(1);
            const odds = player.anytime_td.implied_odds > 0 ? `+${player.anytime_td.implied_odds}` : player.anytime_td.implied_odds;
            console.log(`${index + 1}. ${player.name} (${player.position}, ${player.team}) - ${prob}% (${odds})`);
        });

        // Probability range analysis
        const probabilities = allPlayers.map(p => p.anytime_td.probability);
        const avgProb = probabilities.reduce((sum, p) => sum + p, 0) / probabilities.length;
        const maxProb = Math.max(...probabilities);
        const minProb = Math.min(...probabilities);

        console.log(`\n📈 PROBABILITY DISTRIBUTION:`);
        console.log(`Average: ${(avgProb * 100).toFixed(1)}%`);
        console.log(`Range: ${(minProb * 100).toFixed(1)}% - ${(maxProb * 100).toFixed(1)}%`);
        console.log(`Elite players (>50%): ${probabilities.filter(p => p > 0.5).length}`);
        console.log(`Strong plays (>40%): ${probabilities.filter(p => p > 0.4).length}`);
        console.log(`Playable range (30-65%): ${probabilities.filter(p => p >= 0.3 && p <= 0.65).length}`);

        return {
            avgProbability: avgProb,
            maxProbability: maxProb,
            elitePlayers: probabilities.filter(p => p > 0.5).length,
            marketRealistic: maxProb <= 0.75 && avgProb >= 0.25 && avgProb <= 0.45
        };
    }
}

module.exports = AdvancedTDModel;

// Run if called directly
if (require.main === module) {
    const model = new AdvancedTDModel();
    
    // Test with mock games
    const mockGames = [
        { home_team: 'SF', away_team: 'ARI', total: 49.5 },
        { home_team: 'BUF', away_team: 'MIA', total: 48.0 },
        { home_team: 'PHI', away_team: 'LAR', total: 47.5 },
        { home_team: 'BAL', away_team: 'DET', total: 46.5 }
    ];

    model.generatePredictions(mockGames)
        .then(predictions => {
            console.log('\n🚀 ADVANCED TD MODEL RESULTS:');
            model.validatePredictions(predictions);
            
            // Save results
            return fs.writeFile(
                path.join(__dirname, '..', 'data', 'advanced-td-predictions.json'),
                JSON.stringify(predictions, null, 2)
            );
        })
        .then(() => {
            console.log('\n💾 Advanced predictions saved to data/advanced-td-predictions.json');
        })
        .catch(error => {
            console.error('❌ Error:', error.message);
        });
}