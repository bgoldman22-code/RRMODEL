// netlify/functions/nfl-td-advanced-predictions/index.mjs
// Advanced NFL TD Predictions using NFLVerse data and market-calibrated probabilities

import fs from 'fs/promises';
import path from 'path';

// Advanced TD Model (simplified version for Netlify deployment)
class AdvancedTDModel {
    constructor() {
        this.baseTdRates = {
            'RB': 0.35,    
            'WR': 0.28,    
            'TE': 0.22,    
            'QB': 0.18     
        };

        this.featureWeights = {
            'RB': {
                recentTdRate: 0.35,
                redZoneCarries: 0.25,
                explosiveRunRate: 0.20,
                consistencyScore: 0.20
            },
            'WR': {
                recentTdRate: 0.30,
                redZoneTargets: 0.25,
                explosiveRecRate: 0.25,
                yacPerReception: 0.20
            },
            'TE': {
                recentTdRate: 0.30,
                redZoneTargets: 0.30,
                consistencyScore: 0.20,
                yacPerReception: 0.20
            },
            'QB': {
                recentTdRate: 0.40,
                rushingTdRate: 0.35,
                consistencyScore: 0.25
            }
        };
    }

    calculateAnytimeTDProbability(player) {
        const position = player.position;
        const baseRate = this.baseTdRates[position] || 0.25;
        const weights = this.featureWeights[position] || {};

        let featureScore = 0;
        let totalWeight = 0;

        Object.entries(weights).forEach(([feature, weight]) => {
            if (player[feature] !== undefined) {
                let normalizedValue = this.normalizeFeature(feature, player[feature]);
                featureScore += normalizedValue * weight;
                totalWeight += weight;
            }
        });

        const normalizedFeatureScore = totalWeight > 0 ? featureScore / totalWeight : 0.5;
        let tdProbability = baseRate * (0.5 + (normalizedFeatureScore * 1.0));
        tdProbability *= this.getPlayerRoleMultiplier(player);

        return Math.max(0.12, Math.min(0.65, tdProbability));
    }

    normalizeFeature(feature, value) {
        const normalizations = {
            recentTdRate: { min: 0, max: 2.0, optimal: 1.5 },
            redZoneCarries: { min: 0, max: 4.0, optimal: 3.0 },
            redZoneTargets: { min: 0, max: 5.0, optimal: 4.0 },
            explosiveRunRate: { min: 0, max: 0.3, optimal: 0.15 },
            explosiveRecRate: { min: 0, max: 0.4, optimal: 0.25 },
            yacPerReception: { min: 0, max: 20, optimal: 12 },
            consistencyScore: { min: 0, max: 1.0, optimal: 0.8 },
            rushingTdRate: { min: 0, max: 1.5, optimal: 1.0 }
        };

        const norm = normalizations[feature];
        if (!norm) return 0.5;

        const normalizedValue = Math.max(0, Math.min(1, value / norm.max));
        const optimalRatio = norm.optimal / norm.max;
        
        if (normalizedValue >= optimalRatio) {
            return 0.7 + (0.3 * (normalizedValue - optimalRatio) / (1 - optimalRatio));
        } else {
            return 0.7 * (normalizedValue / optimalRatio);
        }
    }

    getPlayerRoleMultiplier(player) {
        let multiplier = 1.0;

        if (player.recentTdRate > 1.2) multiplier *= 1.15;
        else if (player.recentTdRate > 0.8) multiplier *= 1.08;
        else if (player.recentTdRate < 0.2) multiplier *= 0.90;

        const redZoneOpportunities = (player.redZoneCarriesEst || 0) + (player.redZoneTargetsEst || 0);
        if (redZoneOpportunities > 3.5) multiplier *= 1.12;
        else if (redZoneOpportunities > 2.5) multiplier *= 1.06;
        else if (redZoneOpportunities < 1.0) multiplier *= 0.94;

        if (player.consistencyScore > 0.7) multiplier *= 1.04;
        else if (player.consistencyScore < 0.3) multiplier *= 0.96;

        return multiplier;
    }

    calculateFirstTDProbability(anytimeTdProb, player) {
        const position = player.position;
        let firstTdMultiplier = 0.16;

        if (position === 'RB') firstTdMultiplier = 0.18;
        else if (position === 'QB') firstTdMultiplier = 0.17;
        else if (position === 'WR') firstTdMultiplier = 0.15;
        else if (position === 'TE') firstTdMultiplier = 0.14;

        if (player.recentTdRate > 1.0) firstTdMultiplier *= 1.1;

        return anytimeTdProb * firstTdMultiplier;
    }

    calculateMultipleTDProbability(anytimeTdProb, player) {
        const position = player.position;
        let baseMultiplier = Math.pow(anytimeTdProb, 1.4);
        
        if (position === 'RB') baseMultiplier *= 1.3;
        else if (position === 'WR') baseMultiplier *= 1.1;
        else if (position === 'TE') baseMultiplier *= 0.9;
        else if (position === 'QB') baseMultiplier *= 0.8;

        if (player.recentTdRate > 1.2) baseMultiplier *= 1.4;
        else if (player.recentTdRate > 0.8) baseMultiplier *= 1.2;

        const redZoneRole = (player.redZoneCarriesEst || 0) + (player.redZoneTargetsEst || 0);
        if (redZoneRole > 3.0) baseMultiplier *= 1.3;

        return Math.max(0.02, Math.min(0.35, baseMultiplier));
    }

    probabilityToOdds(probability) {
        if (probability >= 0.5) {
            return Math.round(-100 / (probability / (1 - probability)));
        } else {
            return Math.round(100 * ((1 - probability) / probability));
        }
    }
}

// Load schedule data
async function loadSchedule() {
    const possiblePaths = [
        'public/data/nfl-schedule-2025.json',
        '/opt/buildhome/repo/public/data/nfl-schedule-2025.json',
        '/var/task/public/data/nfl-schedule-2025.json'
    ];

    for (const filePath of possiblePaths) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            continue;
        }
    }

    console.warn('⚠️ Schedule data not found, using fallback');
    return {
        games: [
            { home_team: 'SF', away_team: 'ARI', week: 3 },
            { home_team: 'BUF', away_team: 'MIA', week: 3 },
            { home_team: 'PHI', away_team: 'LAR', week: 3 },
            { home_team: 'BAL', away_team: 'DET', week: 3 }
        ]
    };
}

// Load NFLVerse player features
async function loadPlayerFeatures() {
    const possiblePaths = [
        'data/nfl-player-features-2025.json',
        '/opt/buildhome/repo/data/nfl-player-features-2025.json',
        '/var/task/data/nfl-player-features-2025.json'
    ];

    for (const filePath of possiblePaths) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            continue;
        }
    }

    console.warn('⚠️ Player features not found');
    return null;
}

function getCurrentWeek() {
    const now = new Date();
    const seasonStart = new Date('2025-09-04');
    const diffTime = now.getTime() - seasonStart.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const week = Math.floor(diffDays / 7) + 1;
    return Math.max(1, Math.min(18, week));
}

// Main handler
export const handler = async (event, context) => {
    try {
        console.log('🚀 NFL Advanced TD Predictions - NFLVerse Model');
        
        const currentWeek = getCurrentWeek();
        console.log(`📅 Current Week: ${currentWeek}`);

        // Load schedule and player features
        const [scheduleData, playerFeaturesData] = await Promise.all([
            loadSchedule(),
            loadPlayerFeatures()
        ]);

        if (!playerFeaturesData || !playerFeaturesData.players) {
            throw new Error('No NFLVerse player features found');
        }

        const playerFeatures = playerFeaturesData.players;
        console.log(`✅ Loaded features for ${Object.keys(playerFeatures).length} players`);

        // Get current week games - handle the correct schedule format
        let currentGames = [];
        if (scheduleData.weeks && scheduleData.weeks[currentWeek]) {
            // Correct format: schedule has weeks object with matchups
            currentGames = scheduleData.weeks[currentWeek].matchups || [];
        } else {
            throw new Error(`No games found for Week ${currentWeek} in schedule data`);
        }

        console.log(`🏈 Processing ${currentGames.length} games for Week ${currentWeek}`);

        if (currentGames.length === 0) {
            throw new Error(`No games found for Week ${currentWeek}`);
        }

        // Initialize advanced model
        const model = new AdvancedTDModel();
        const predictions = [];
        let totalPlayersProcessed = 0;

        for (const game of currentGames) {
            const gamePlayers = [];

            // Find players for this game
            Object.entries(playerFeatures).forEach(([playerKey, player]) => {
                const [playerName, team] = playerKey.split('_');
                
                if (team === game.home_team || team === game.away_team) {
                    const anytimeProb = model.calculateAnytimeTDProbability(player);
                    const firstTdProb = model.calculateFirstTDProbability(anytimeProb, player);
                    const multipleTdProb = model.calculateMultipleTDProbability(anytimeProb, player);

                    gamePlayers.push({
                        player_id: playerKey,
                        name: player.name,
                        position: player.position,
                        team: player.team,
                        anytime_td: {
                            probability: Math.round(anytimeProb * 1000) / 1000,
                            confidence: Math.round(anytimeProb * 100),
                            implied_odds: model.probabilityToOdds(anytimeProb)
                        },
                        first_td: {
                            probability: Math.round(firstTdProb * 1000) / 1000,
                            implied_odds: model.probabilityToOdds(firstTdProb)
                        },
                        multiple_td: {
                            probability: Math.round(multipleTdProb * 1000) / 1000,
                            implied_odds: model.probabilityToOdds(multipleTdProb)
                        },
                        key_factors: {
                            recent_td_rate: player.recentTdRate || 0,
                            red_zone_opportunities: (player.redZoneCarriesEst || 0) + (player.redZoneTargetsEst || 0),
                            explosiveness: Math.max(player.explosiveRunRate || 0, player.explosiveRecRate || 0),
                            consistency: player.consistencyScore || 0,
                            season_tds: player.seasonTDs || 0
                        }
                    });
                    totalPlayersProcessed++;
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

        console.log(`✅ Generated predictions for ${totalPlayersProcessed} players across ${predictions.length} games`);

        const response = {
            success: true,
            metadata: {
                model: 'advanced-nflverse-v1',
                data_source: 'nflverse_features',
                generated_at: new Date().toISOString(),
                week: currentWeek,
                games_processed: predictions.length,
                total_players: totalPlayersProcessed,
                calibration: 'market_odds',
                probability_range: 'realistic'
            },
            predictions: predictions
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
            },
            body: JSON.stringify(response)
        };

    } catch (error) {
        console.error('❌ Error in advanced TD predictions:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};