/**
 * Web Console Debug: Injury Impact Only - FIXED VERSION
 * Purpose: Display clean injury impact data with proper names and formatting
 * Usage: Copy/paste into browser console on any page
 */

(async function debugInjuryImpactFixed() {
    console.log('🏈 NFL INJURY IMPACT DEBUG - CLEAN VIEW (FIXED)');
    console.log('=============================================');
    
    try {
        // Fetch predictions data
        const response = await fetch('https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate');
        const data = await response.json();
        
        if (!data.predictions || !Array.isArray(data.predictions)) {
            console.error('❌ No predictions data found');
            return;
        }
        
        console.log(`📊 Found ${data.predictions.length} games with prediction data\n`);
        
        // Filter and display games with injury impacts
        let gamesWithInjuries = 0;
        
        data.predictions.forEach((game, index) => {
            const gameTitle = `${game.away_team} @ ${game.home_team}`;
            
            // Check if game has any injury impacts
            const homeAdjustments = game.teamStats?.home?.injuryImpact?.adjustments || [];
            const awayAdjustments = game.teamStats?.away?.injuryImpact?.adjustments || [];
            const totalAdjustments = homeAdjustments.length + awayAdjustments.length;
            
            if (totalAdjustments > 0) {
                gamesWithInjuries++;
                
                console.log(`🎯 GAME ${index + 1}: ${gameTitle}`);
                console.log('─'.repeat(50));
                
                // Away team injuries
                if (awayAdjustments.length > 0) {
                    console.log(`📍 ${game.away_team} (Away) Injuries:`);
                    awayAdjustments.forEach(adj => {
                        // Fix undefined names and status
                        const playerName = adj.name || adj.player || 'Unknown Player';
                        const status = adj.status || 'unknown';
                        const position = adj.position || 'UNK';
                        const impact = Math.round(adj.impact * 100) / 100; // Fix decimal precision
                        const impactStr = impact > 0 ? `+${impact}` : `${impact}`;
                        
                        console.log(`   ${position} ${playerName}: ${status.toUpperCase()} (${impactStr} pts)`);
                        if (adj.details) {
                            console.log(`      └─ ${adj.details}`);
                        }
                    });
                    
                    const awayTotal = Math.round((game.teamStats.away.injuryImpact.totalImpact || 0) * 100) / 100;
                    const awayTotalStr = awayTotal > 0 ? `+${awayTotal}` : `${awayTotal}`;
                    console.log(`   📊 TOTAL AWAY IMPACT: ${awayTotalStr} points\n`);
                }
                
                // Home team injuries
                if (homeAdjustments.length > 0) {
                    console.log(`🏠 ${game.home_team} (Home) Injuries:`);
                    homeAdjustments.forEach(adj => {
                        // Fix undefined names and status
                        const playerName = adj.name || adj.player || 'Unknown Player';
                        const status = adj.status || 'unknown';
                        const position = adj.position || 'UNK';
                        const impact = Math.round(adj.impact * 100) / 100; // Fix decimal precision
                        const impactStr = impact > 0 ? `+${impact}` : `${impact}`;
                        
                        console.log(`   ${position} ${playerName}: ${status.toUpperCase()} (${impactStr} pts)`);
                        if (adj.details) {
                            console.log(`      └─ ${adj.details}`);
                        }
                    });
                    
                    const homeTotal = Math.round((game.teamStats.home.injuryImpact.totalImpact || 0) * 100) / 100;
                    const homeTotalStr = homeTotal > 0 ? `+${homeTotal}` : `${homeTotal}`;
                    console.log(`   📊 TOTAL HOME IMPACT: ${homeTotalStr} points\n`);
                }
                
                // Net impact calculation
                const netImpact = Math.round(((game.teamStats.away.injuryImpact.totalImpact || 0) - 
                                            (game.teamStats.home.injuryImpact.totalImpact || 0)) * 100) / 100;
                const netStr = netImpact > 0 ? `+${netImpact}` : `${netImpact}`;
                
                if (Math.abs(netImpact) >= 1) {
                    const favoredTeam = netImpact > 0 ? game.home_team : game.away_team;
                    console.log(`⚖️  NET IMPACT: ${netStr} points favoring ${favoredTeam}`);
                }
                
                console.log('\n' + '='.repeat(60) + '\n');
            }
        });
        
        // Summary
        console.log(`📋 SUMMARY:`);
        console.log(`   Total Games: ${data.predictions.length}`);
        console.log(`   Games with Injuries: ${gamesWithInjuries}`);
        console.log(`   Games without Injuries: ${data.predictions.length - gamesWithInjuries}`);
        
        // Debug: Check if new dynamic system working
        console.log('\n🔧 SYSTEM DEPLOYMENT CHECK:');
        data.predictions.forEach(game => {
            const awayAdjustments = game.teamStats?.away?.injuryImpact?.adjustments || [];
            const homeAdjustments = game.teamStats?.home?.injuryImpact?.adjustments || [];
            
            [...awayAdjustments, ...homeAdjustments].forEach(adj => {
                if (adj.reason && adj.reason.includes('Dynamic')) {
                    console.log(`✅ DYNAMIC SYSTEM WORKING: ${adj.name} (${adj.position}) - ${adj.reason}`);
                } else if (adj.reason && adj.reason.includes('Fallback')) {
                    console.log(`⚠️  FALLBACK USED: ${adj.name} (${adj.position}) - ${adj.reason}`);
                } else {
                    console.log(`❓ OLD SYSTEM?: ${adj.name} (${adj.position}) - ${adj.reason || 'no reason'}`);
                }
            });
        });

        // Market alignment check for major injuries
        console.log('\n🎯 MARKET ALIGNMENT CHECK:');
        data.predictions.forEach(game => {
            const awayImpact = Math.abs(game.teamStats?.away?.injuryImpact?.totalImpact || 0);
            const homeImpact = Math.abs(game.teamStats?.home?.injuryImpact?.totalImpact || 0);
            const maxImpact = Math.max(awayImpact, homeImpact);
            
            if (maxImpact >= 5) {
                const impactedTeam = awayImpact > homeImpact ? game.away_team : game.home_team;
                const gameStr = `${game.away_team} @ ${game.home_team}`;
                
                console.log(`📊 ${gameStr}: ${impactedTeam} impacted by ${maxImpact.toFixed(1)} pts`);
                
                // Market reality check
                if (maxImpact > 10) {
                    console.log(`   ⚠️  ${maxImpact.toFixed(1)} pts seems HIGH - typical QB injury = 4-8 pts`);
                } else if (maxImpact > 6) {
                    console.log(`   💡 ${maxImpact.toFixed(1)} pts is reasonable for major injury`);
                } else {
                    console.log(`   ✅ ${maxImpact.toFixed(1)} pts seems market-appropriate`);
                }
            }
        });
        
        // Also display raw data sample for debugging
        console.log('\n🔍 RAW DATA SAMPLE (First injury adjustment):');
        const firstGameWithInjury = data.predictions.find(game => 
            (game.teamStats?.home?.injuryImpact?.adjustments || []).length > 0 || 
            (game.teamStats?.away?.injuryImpact?.adjustments || []).length > 0
        );
        
        if (firstGameWithInjury) {
            const allAdj = [
                ...(firstGameWithInjury.teamStats?.home?.injuryImpact?.adjustments || []),
                ...(firstGameWithInjury.teamStats?.away?.injuryImpact?.adjustments || [])
            ];
            if (allAdj.length > 0) {
                console.log('Raw adjustment object:', allAdj[0]);
            }
        }
        
        if (gamesWithInjuries === 0) {
            console.log('\n⚠️  No injury impacts found in any games');
            console.log('   This could mean:');
            console.log('   - No major injuries this week');
            console.log('   - Injury system not activated');
            console.log('   - Data collection issue');
        }
        
    } catch (error) {
        console.error('❌ Error fetching injury data:', error);
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Check if API endpoint is accessible');
        console.log('2. Verify CORS settings');
        console.log('3. Check network connectivity');
    }
})();

console.log('🚀 Injury Impact Debug script (FIXED VERSION) loaded - executing now...');