#!/usr/bin/env node
// scripts/generate-current-week-data.js
// Automatically generate CSV files for the current NFL week

import { getCurrentNFLWeek } from '../src/utils/nflWeek.js';
import { handler as advancedHandler } from '../netlify/functions/nfl-td-advanced-predictions/index.mjs';
import { handler as basicHandler } from '../netlify/functions/nfl-td-predictions-enhanced.js';
import fs from 'fs';
import path from 'path';

async function generateCurrentWeekData() {
    const currentWeek = getCurrentNFLWeek();
    console.log(`🏈 Generating Week ${currentWeek} Data Files...\n`);
    
    try {
        // Generate Advanced TD Model Files
        await generateAdvancedFiles(currentWeek);
        
        // Generate Basic TD Model Files  
        await generateBasicFiles(currentWeek);
        
        // Clean up old week files (keep current + last 2 weeks)
        cleanupOldFiles(currentWeek);
        
        console.log(`✅ Week ${currentWeek} data generation complete!`);
        console.log(`📁 Files available for weeks ${currentWeek-2} through ${currentWeek}`);
        
    } catch (error) {
        console.error('❌ Data generation failed:', error);
        process.exit(1);
    }
}

async function generateAdvancedFiles(week) {
    console.log('📊 Generating Advanced TD Model files...');
    
    const mockEvent = { httpMethod: 'GET', headers: {}, queryStringParameters: null };
    const response = await advancedHandler(mockEvent, {});
    
    if (response.statusCode !== 200) {
        throw new Error('Advanced model API failed');
    }

    const data = JSON.parse(response.body);
    
    // Collect all players from all games
    const allPlayers = [];
    data.predictions.forEach(game => {
        game.players.forEach(player => {
            allPlayers.push({
                ...player,
                game: `${game.away_team} @ ${game.home_team}`
            });
        });
    });

    // Helper function to convert to percentage
    const toPercent = (decimal) => (decimal * 100).toFixed(1);

    // Generate Anytime TD Top 150
    const anytimeTop150 = allPlayers
        .sort((a, b) => b.anytime_td.probability - a.anytime_td.probability)
        .slice(0, 150);

    const anytimeCSV = [
        'Rank,Player,Position,Team,Game,Anytime TD Probability (%),Recent TD Rate,Red Zone Opps,Explosiveness,Consistency,Season TDs,Implied Odds',
        ...anytimeTop150.map((player, index) => {
            const odds = player.anytime_td.implied_odds > 0 ? `+${player.anytime_td.implied_odds}` : player.anytime_td.implied_odds;
            return [
                index + 1,
                player.name,
                player.position,
                player.team,
                player.game,
                toPercent(player.anytime_td.probability),
                player.key_factors?.recent_td_rate?.toFixed(2) || '0.00',
                player.key_factors?.red_zone_opportunities || 0,
                player.key_factors?.explosiveness?.toFixed(2) || '0.00',
                player.key_factors?.consistency?.toFixed(2) || '0.00',
                player.season_stats?.touchdowns || 0,
                odds
            ].join(',');
        })
    ].join('\n');

    // Generate Multiple TD Top 50
    const multipleTop50 = allPlayers
        .filter(p => p.multiple_td?.probability > 0.05)
        .sort((a, b) => b.multiple_td.probability - a.multiple_td.probability)
        .slice(0, 50);

    const multipleCSV = [
        'Rank,Player,Position,Team,Game,Multiple TD Probability (%),Recent Form,Goal Line Usage,Workload,Season Multiple TDs,Implied Odds',
        ...multipleTop50.map((player, index) => {
            const odds = player.multiple_td.implied_odds > 0 ? `+${player.multiple_td.implied_odds}` : player.multiple_td.implied_odds;
            return [
                index + 1,
                player.name,
                player.position,
                player.team,
                player.game,
                toPercent(player.multiple_td.probability),
                player.key_factors?.recent_td_rate?.toFixed(2) || '0.00',
                player.key_factors?.goal_line_usage?.toFixed(2) || '0.00',
                player.key_factors?.workload?.toFixed(2) || '0.00',
                player.season_stats?.multiple_td_games || 0,
                odds
            ].join(',');
        })
    ].join('\n');

    // Generate First TD Top 30
    const firstTop30 = allPlayers
        .sort((a, b) => b.first_td.probability - a.first_td.probability)
        .slice(0, 30);

    const firstCSV = [
        'Rank,Player,Position,Team,Game,First TD Probability (%),Early Target Share,Opening Drive Usage,Pace Factor,Season First TDs,Implied Odds',
        ...firstTop30.map((player, index) => {
            const odds = player.first_td.implied_odds > 0 ? `+${player.first_td.implied_odds}` : player.first_td.implied_odds;
            return [
                index + 1,
                player.name,
                player.position,
                player.team,
                player.game,
                toPercent(player.first_td.probability),
                player.key_factors?.early_target_share?.toFixed(2) || '0.00',
                player.key_factors?.opening_drive_usage?.toFixed(2) || '0.00',
                player.key_factors?.pace_factor?.toFixed(2) || '0.00',
                player.season_stats?.first_tds || 0,
                odds
            ].join(',');
        })
    ].join('\n');

    // Write Advanced Files
    fs.writeFileSync(`nfl-week${week}-advanced-top-150-anytime-td.csv`, anytimeCSV);
    fs.writeFileSync(`nfl-week${week}-advanced-top-50-multiple-td.csv`, multipleCSV);
    fs.writeFileSync(`nfl-week${week}-advanced-top-30-first-td.csv`, firstCSV);
    
    console.log(`✅ Advanced files generated for Week ${week}`);
}

async function generateBasicFiles(week) {
    console.log('📈 Generating Basic TD Model files...');
    
    const mockEvent = { 
        httpMethod: 'GET', 
        headers: {}, 
        queryStringParameters: { format: 'detailed' }
    };
    const response = await basicHandler(mockEvent, {});
    
    if (response.statusCode !== 200) {
        throw new Error('Basic model API failed');
    }

    const data = JSON.parse(response.body);
    
    if (!data.predictions || !Array.isArray(data.predictions)) {
        throw new Error('Invalid basic model response format');
    }

    // Collect all players
    const allPlayers = [];
    data.predictions.forEach(game => {
        if (game.players && Array.isArray(game.players)) {
            game.players.forEach(player => {
                allPlayers.push({
                    ...player,
                    game: `${game.away_team || game.awayTeam} @ ${game.home_team || game.homeTeam}`
                });
            });
        }
    });

    const toPercent = (decimal) => (decimal * 100).toFixed(1);

    // Basic Anytime TD Top 150
    const basicAnytimeTop150 = allPlayers
        .sort((a, b) => (b.anytime_td_prob || 0) - (a.anytime_td_prob || 0))
        .slice(0, 150);

    const basicAnytimeCSV = [
        'Rank,Player,Position,Team,Game,Anytime TD Probability (%)',
        ...basicAnytimeTop150.map((player, index) => [
            index + 1,
            player.name,
            player.position,
            player.team,
            player.game,
            toPercent(player.anytime_td_prob || 0)
        ].join(','))
    ].join('\n');

    // Basic Multiple TD Top 50
    const basicMultipleTop50 = allPlayers
        .filter(p => (p.multiple_td_prob || 0) > 0.02)
        .sort((a, b) => (b.multiple_td_prob || 0) - (a.multiple_td_prob || 0))
        .slice(0, 50);

    const basicMultipleCSV = [
        'Rank,Player,Position,Team,Game,Multiple TD Probability (%)',
        ...basicMultipleTop50.map((player, index) => [
            index + 1,
            player.name,
            player.position,
            player.team,
            player.game,
            toPercent(player.multiple_td_prob || 0)
        ].join(','))
    ].join('\n');

    // Basic First TD Top 30
    const basicFirstTop30 = allPlayers
        .sort((a, b) => (b.first_td_prob || 0) - (a.first_td_prob || 0))
        .slice(0, 30);

    const basicFirstCSV = [
        'Rank,Player,Position,Team,Game,First TD Probability (%)',
        ...basicFirstTop30.map((player, index) => [
            index + 1,
            player.name,
            player.position,
            player.team,
            player.game,
            toPercent(player.first_td_prob || 0)
        ].join(','))
    ].join('\n');

    // Write Basic Files
    fs.writeFileSync(`nfl-week${week}-top-150-anytime-td.csv`, basicAnytimeCSV);
    fs.writeFileSync(`nfl-week${week}-top-50-multiple-td.csv`, basicMultipleCSV);
    fs.writeFileSync(`nfl-week${week}-top-30-first-td.csv`, basicFirstCSV);
    
    console.log(`✅ Basic files generated for Week ${week}`);
}

function cleanupOldFiles(currentWeek) {
    console.log('🧹 Cleaning up old week files...');
    
    const keepWeeks = [currentWeek - 2, currentWeek - 1, currentWeek];
    const allFiles = fs.readdirSync('.');
    
    let cleanedCount = 0;
    
    allFiles.forEach(file => {
        const weekMatch = file.match(/nfl-week(\d+)-/);
        if (weekMatch) {
            const fileWeek = parseInt(weekMatch[1]);
            if (!keepWeeks.includes(fileWeek)) {
                fs.unlinkSync(file);
                cleanedCount++;
                console.log(`🗑️  Removed old file: ${file}`);
            }
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`✅ Cleaned up ${cleanedCount} old week files`);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    generateCurrentWeekData();
}

export { generateCurrentWeekData };