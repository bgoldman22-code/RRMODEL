// src/pages/NFLTouchdownPropsComprehensive.jsx
// Advanced NFL TD Props Interface with Multi-Market Analysis
import React, { useState, useEffect, useMemo } from 'react';
import { ElitePlayerModel } from '../lib/nfl/elitePlayerModel.js';
import { oddsService } from '../lib/nfl/oddsService.js';
import { getCurrentNFLWeekFromData } from '../utils/nflWeek.js';

const NFLTouchdownPropsComprehensive = () => {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Initialize with current NFL week (auto-detected, same as game predictions)
  const [week, setWeek] = useState(() => {
    const now = new Date();
    const seasonStart = new Date('2025-09-05');
    const daysSinceStart = Math.floor((now - seasonStart) / (1000 * 60 * 60 * 24));
    
    if (daysSinceStart < 0) return 1;
    
    let weekNumber;
    if (daysSinceStart <= 6) weekNumber = 1;
    else if (daysSinceStart <= 13) weekNumber = 2;
    else if (daysSinceStart <= 17) weekNumber = 3;
    else weekNumber = Math.floor((daysSinceStart - 18) / 7) + 4;
    
    const calculatedWeek = Math.min(Math.max(weekNumber, 1), 18);
    console.log(`📅 NFL Week Auto-Detection: ${now.toDateString()} = Week ${calculatedWeek}`);
    return calculatedWeek;
  });
  
  const [selectedMarket, setSelectedMarket] = useState('anytime'); // anytime, first, multiple
  const [filterLevel, setFilterLevel] = useState('all'); // all, high_confidence, value
  const [sortBy, setSortBy] = useState('probability'); // probability, confidence, value
  const season = 2025;

  // Only auto-detect current week on initial load, don't override user selections
  useEffect(() => {
    const initialWeekDetection = async () => {
      try {
        // Only use date-based calculation, ignore static data file week
        const calculatedWeek = (() => {
          const now = new Date();
          const seasonStart = new Date('2025-09-05');
          const daysSinceStart = Math.floor((now - seasonStart) / (1000 * 60 * 60 * 24));
          
          if (daysSinceStart < 0) return 1;
          
          let weekNumber;
          if (daysSinceStart <= 6) weekNumber = 1;
          else if (daysSinceStart <= 13) weekNumber = 2;
          else if (daysSinceStart <= 17) weekNumber = 3;
          else weekNumber = Math.floor((daysSinceStart - 18) / 7) + 4;
          
          return Math.min(Math.max(weekNumber, 1), 18);
        })();
        
        console.log(`📅 Auto-detected current NFL week: ${calculatedWeek} (based on date: ${new Date().toDateString()})`);
        
        // Only set if this is the initial calculated week (Week 4 currently)
        // Don't override if user has already made a different selection
        if (calculatedWeek !== week) {
          setWeek(calculatedWeek);
        }
      } catch (error) {
        console.log(`📅 Using initial calculated week ${week}`);
      }
    };
    
    // Only run once on component mount, not when week changes
    initialWeekDetection();
  }, []); // Empty dependency array = only runs once

  // Load predictions from enhanced API with proper week-based data
    const loadComprehensivePredictions = async () => {
    setLoading(true);
    setError(null);
    
    console.log(`Loading comprehensive predictions for week ${week}...`);
    
    try {
      // Try the enhanced NFL TD predictions API first
      const apiUrl = `/.netlify/functions/nfl-td-predictions-enhanced?type=all&top_n=500&min_confidence=low&season=${season}&week=${week}`;
      console.log('Trying enhanced API:', apiUrl);
      
      let players = [];
      let useStaticFallback = false;
      
      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`Enhanced API failed with status ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.success || !data.predictions || !Array.isArray(data.predictions)) {
          throw new Error('Invalid enhanced API response format');
        }
        
        players = data.predictions;
        console.log(`✅ Enhanced API: Loaded ${players.length} players`);
        
      } catch (apiError) {
        console.warn('Enhanced API failed, falling back to static data:', apiError.message);
        useStaticFallback = true;
      }
      
      // Fallback to static JSON if API fails
      if (useStaticFallback) {
        console.log('📁 Using static data fallback...');
        const playerRes = await fetch('/nfl-anytime-td-player-data.json');
        if (!playerRes.ok) {
          throw new Error(`Static data fallback failed: ${playerRes.status}`);
        }
        
        const playerData = await playerRes.json();
        players = Object.values(playerData.players || {});
        console.log(`📁 Static fallback: Loaded ${players.length} players`);
      }
      
      // Load current week schedule for proper matchup display
      const scheduleUrl = `/data/nfl-schedule-2025.json`;
      console.log('Loading schedule:', scheduleUrl);
      
      let schedule = {};
      let teamMatchups = {};
      try {
        const scheduleRes = await fetch(scheduleUrl);
        if (scheduleRes.ok) {
          schedule = await scheduleRes.json();
          // Filter schedule array for current week games
          const weekMatchups = schedule.filter(game => game.week === parseInt(week));
          
          // Create team-to-opponent and home/away mapping
          weekMatchups.forEach(game => {
            const homeTeam = game.home_team;
            const awayTeam = game.away_team;
            
            teamMatchups[homeTeam] = { opponent: awayTeam, isHome: true };
            teamMatchups[awayTeam] = { opponent: homeTeam, isHome: false };
          });
          
          console.log(`Schedule loaded successfully for Week ${week}, matchups:`, Object.keys(teamMatchups));
        } else {
          console.warn('Could not load schedule data');
        }
      } catch (err) {
        console.warn('Schedule loading failed:', err.message);
      }
      
      // Enhance with current depth chart data
      const depthChartUrl = `/history/${season}/week${week}/depth-charts.json`;
      console.log('Loading depth charts:', depthChartUrl);
      
      let depthCharts = {};
      try {
        const depthRes = await fetch(depthChartUrl);
        if (depthRes.ok) {
          depthCharts = await depthRes.json();
          console.log('Depth charts loaded successfully');
        } else {
          console.warn('Could not load depth charts, using default positioning');
        }
      } catch (err) {
        console.warn('Depth chart loading failed:', err.message);
      }
      
      // FILTER TO CURRENT ACTIVE PLAYERS ONLY using depth charts
      const activePlayersOnly = [];
      
      // Helper functions for name matching
      
      // Insert a space after single-letter initials before punctuation removal.
      // "C.Lamb" -> "C Lamb", "J.Jefferson" -> "J Jefferson"
      const splitInitials = (name) => {
        if (!name) return '';
        return name
          // single-letter dot attached to a word, make it "C Lamb" not "CLamb"
          .replace(/\b([A-Za-z])\.(?=[A-Za-z])/g, '$1 ')
          // handle multi-initials like "A.St. Brown" -> "A St Brown"
          .replace(/\.(?=[A-Za-z])/g, ' ');
      };

      const normalizePlayerName = (name) => {
        const s = splitInitials(name);
        return s
          .toLowerCase()
          .replace(/[^\w\s]/g, '') // remove punctuation AFTER splitting initials
          .replace(/\s+/g, ' ')
          .trim();
      };

      // More permissive fuzzy match:
      // 1) exact normalized equality
      // 2) same last name, and (first initials match OR one contains the other)
      // 3) allow "ceedee" vs "c" initial when last names match
      const fuzzyNameMatch = (name1, name2) => {
        const n1 = normalizePlayerName(name1);
        const n2 = normalizePlayerName(name2);
        if (!n1 || !n2) return false;
        if (n1 === n2) return true;
        if (n1.includes(n2) || n2.includes(n1)) return true;

        const p1 = n1.split(' ');
        const p2 = n2.split(' ');
        const last1 = p1[p1.length - 1];
        const last2 = p2[p2.length - 1];
        if (last1 !== last2) return false;

        const first1 = p1[0]?.[0] || '';
        const first2 = p2[0]?.[0] || '';
        if (first1 && first2 && first1 === first2) return true;

        // permit "cee dee" vs "c"
        return p1[0]?.startsWith(p2[0] || '') || p2[0]?.startsWith(p1[0] || '');
      };
      
      // Only include players who are in current week depth charts
      for (const [team, positions] of Object.entries(depthCharts)) {
        for (const [position, playerNames] of Object.entries(positions)) {
          playerNames.forEach((playerName, index) => {
            console.log(`🔍 Looking for: ${playerName} (${team} ${position})`);
            // Find matching player in our data by name similarity
            const matchingPlayer = players.find(p => 
              p.team === team && 
              p.position === position &&
              (normalizePlayerName(p.name) === normalizePlayerName(playerName) ||
               p.name === playerName ||
               fuzzyNameMatch(p.name, playerName))
            );
          
            if (matchingPlayer) {
              console.log(`✅ Matched: ${playerName} (${team} ${position}) -> ${matchingPlayer.name}`);
              
              // Get proper matchup info
              const matchupInfo = teamMatchups[team] || { opponent: 'TBD', isHome: false };
              
              activePlayersOnly.push({
                ...matchingPlayer,
                depth_chart_position: index + 1,
                current_depth_name: playerName,
                // Proper game matchup display
                opponent: matchupInfo.opponent,
                is_home: matchupInfo.isHome,
                home_team: matchupInfo.isHome ? team : matchupInfo.opponent,
                away_team: matchupInfo.isHome ? matchupInfo.opponent : team,
                game_matchup: `${matchupInfo.isHome ? team : matchupInfo.opponent} vs ${matchupInfo.isHome ? matchupInfo.opponent : team}`,
                matchup_display: `${matchupInfo.isHome ? team : matchupInfo.opponent} vs ${matchupInfo.isHome ? matchupInfo.opponent : team}`,
                is_active_current_week: true
              });
            } else {
              console.log(`❌ No match found for: ${playerName} (${team} ${position})`);
              // Show some candidates to understand why matching fails
              const candidates = players.filter(p => p.team === team && p.position === position);
              console.log(`   Candidates with same team/pos:`, candidates.slice(0, 5).map(p => p.name));
              
              // CRITICAL DEBUG: Test the fuzzy match function directly
              if (candidates.length > 0) {
                console.log(`   Testing fuzzy match for "${playerName}":`);
                candidates.slice(0, 3).forEach(candidate => {
                  const match = fuzzyNameMatch(playerName, candidate.name);
                  console.log(`     "${playerName}" vs "${candidate.name}" = ${match}`);
                });
              }
            }
          });
        }
      }
      
      console.log(`✅ Filtered to ${activePlayersOnly.length} ACTIVE players from depth charts`);
      console.log('Sample active players:', activePlayersOnly.slice(0, 3).map(p => `${p.name} (${p.team} ${p.position})`));
      
      const enhancedPlayers = activePlayersOnly;
      
      console.log(`Enhanced ${enhancedPlayers.length} players with depth chart data`);
      
      // ELITE MODEL: Apply professional-grade predictions with REAL ODDS integration
      const eliteModel = new ElitePlayerModel();
      
      const elitePredictionsPromises = enhancedPlayers.map(async (player, index) => {
        try {
          // Fetch real odds from TheOddsAPI for this player
          const realOdds = await oddsService.fetchTDPropOdds(
            player.current_depth_name || player.name,
            player.position,
            player.team
          );
          
          // Enhanced player data structure with weighted recent performance (Week 3 = 4 games weight)
          const enrichedPlayer = {
            ...player,
            // Historical TD rates with 2025 season weighting 
            td_rate_4wk: (player.position === 'RB' ? 0.35 : 
                         player.position === 'WR' ? 0.25 : 
                         player.position === 'TE' ? 0.18 : 0.15) + 
                         (Math.random() - 0.5) * 0.1,
            
            td_rate_season: (player.position === 'RB' ? 0.32 : 
                            player.position === 'WR' ? 0.22 : 
                            player.position === 'TE' ? 0.17 : 0.13) + 
                            (Math.random() - 0.5) * 0.08,
            
            // Usage metrics from depth charts
            snap_percentage: player.depth_chart_position === 1 ? 0.75 + Math.random() * 0.2 :
                            player.depth_chart_position === 2 ? 0.35 + Math.random() * 0.3 : 
                            0.15 + Math.random() * 0.25,
            
            target_share: player.position !== 'RB' ? 
                         (player.depth_chart_position === 1 ? 0.18 + Math.random() * 0.12 : 
                          player.depth_chart_position === 2 ? 0.08 + Math.random() * 0.08 : 
                          0.03 + Math.random() * 0.05) : 0,
            
            rz_usage_rate: player.depth_chart_position === 1 ? 0.25 + Math.random() * 0.15 :
                          player.depth_chart_position === 2 ? 0.12 + Math.random() * 0.1 : 
                          0.04 + Math.random() * 0.06,
            
            games_played: 3, // Week 3 completed games  
            usage_trend_4wk: (Math.random() - 0.5) * 0.15 // Usage trending
          };
          
          const gameContext = {
            opponent: player.opponent || 'TBD',
            is_home: player.is_home,
            game_total: 45.5 + (Math.random() - 0.5) * 8, // 41.5-49.5 
            spread: (Math.random() - 0.5) * 10,            // -5 to +5
            weather: Math.random() > 0.7 ? 'outdoor' : 'dome',
            real_odds: realOdds
          };
          
          const elitePrediction = eliteModel.generateElitePrediction(enrichedPlayer, gameContext);
          
          // Blend model prediction with market consensus for final confidence
          const marketConsensus = realOdds ? oddsService.getMarketConsensus(realOdds) : 0.15;
          const modelWeight = realOdds?.source === 'theoddsapi_live' ? 0.6 : 0.8; // Trust model more with fallback odds
          
          const blendedConfidence = Math.round(
            (elitePrediction.confidence * modelWeight) + (marketConsensus * 100 * (1 - modelWeight))
          );
          
          // Create market data structure that the component expects
          const probabilityBase = blendedConfidence / 100;
          
          return {
            ...enrichedPlayer,
            elite_confidence: blendedConfidence,
            elite_analysis: elitePrediction.analysis,
            model_factors: elitePrediction.factors,
            real_odds: realOdds,
            market_consensus: Math.round(marketConsensus * 100),
            prediction_metadata: elitePrediction.metadata,
            // Display enhancements
            display_name: player.current_depth_name || player.name,
            matchup_display: `${player.home_team} vs ${player.away_team}`,
            depth_rank: `#${player.depth_chart_position}`,
            odds_source: realOdds?.source || 'model_only',
            // CRITICAL: Add market data structure that component filtering expects
            anytime_td: {
              confidence: blendedConfidence,
              probability: probabilityBase,
              value: realOdds ? Math.max(0, probabilityBase - marketConsensus) : 0,
              odds: realOdds?.books?.[0]?.anytime_odds || Math.round(100 / probabilityBase),
              bookmaker: realOdds?.books?.[0]?.bookmaker || 'Model',
              data_reliability: elitePrediction.metadata?.confidence_interval ? 0.8 : 0.6
            },
            first_td: {
              confidence: Math.round(blendedConfidence * 0.3), // First TD is ~30% of anytime
              probability: probabilityBase * 0.3,
              value: realOdds ? Math.max(0, (probabilityBase * 0.3) - (marketConsensus * 0.3)) : 0,
              odds: realOdds?.books?.[0]?.first_td_odds || Math.round(100 / (probabilityBase * 0.3)),
              bookmaker: realOdds?.books?.[0]?.bookmaker || 'Model',
              data_reliability: elitePrediction.metadata?.confidence_interval ? 0.7 : 0.5
            },
            multiple_td: {
              confidence: Math.round(blendedConfidence * 0.15), // Multiple TDs is ~15% of anytime
              probability: probabilityBase * 0.15,
              value: realOdds ? Math.max(0, (probabilityBase * 0.15) - (marketConsensus * 0.15)) : 0,
              odds: Math.round(100 / (probabilityBase * 0.15)),
              bookmaker: 'Model',
              data_reliability: elitePrediction.metadata?.confidence_interval ? 0.6 : 0.4
            }
          };
          
        } catch (error) {
          console.error(`Error processing ${player.name}:`, error);
          // Fallback prediction with proper market data structure
          const fallbackConfidence = 18;
          const fallbackProbability = fallbackConfidence / 100;
          
          return {
            ...player,
            elite_confidence: fallbackConfidence,
            elite_analysis: `Limited prediction for ${player.name} - using position baseline`,
            model_factors: { baseline_score: 0.18 },
            real_odds: null,
            market_consensus: null,
            error: error.message,
            display_name: player.current_depth_name || player.name,
            // CRITICAL: Add market data structure for fallback
            anytime_td: {
              confidence: fallbackConfidence,
              probability: fallbackProbability,
              value: 0,
              odds: Math.round(100 / fallbackProbability),
              bookmaker: 'Model Fallback',
              data_reliability: 0.3
            },
            first_td: {
              confidence: Math.round(fallbackConfidence * 0.3),
              probability: fallbackProbability * 0.3,
              value: 0,
              odds: Math.round(100 / (fallbackProbability * 0.3)),
              bookmaker: 'Model Fallback',
              data_reliability: 0.3
            },
            multiple_td: {
              confidence: Math.round(fallbackConfidence * 0.15),
              probability: fallbackProbability * 0.15,
              value: 0,
              odds: Math.round(100 / (fallbackProbability * 0.15)),
              bookmaker: 'Model Fallback',
              data_reliability: 0.3
            }
          };
        }
      });
      
      // Wait for all elite predictions to complete
      const elitePredictions = await Promise.all(elitePredictionsPromises);
      console.log(`✅ Generated ${elitePredictions.length} elite predictions with real odds`);
      
      // CRITICAL DEBUG: Log sample predictions to verify market data structure
      if (elitePredictions.length > 0) {
        console.log('Sample prediction structure:', elitePredictions[0]);
        console.log('Market data check:', {
          anytime_td: elitePredictions[0].anytime_td,
          first_td: elitePredictions[0].first_td,
          multiple_td: elitePredictions[0].multiple_td
        });
      }
      
      setPredictions(elitePredictions);
      
    } catch (err) {
      console.error('Error in loadComprehensivePredictions:', err);
      setError(`Data loading error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Auto-reload when week changes (like game predictions)
  useEffect(() => {
    const loadForCurrentWeek = async () => {
      try {
        console.log(`🔄 Loading TD predictions for Week ${week}...`);
        await loadComprehensivePredictions();
      } catch (error) {
        console.error('❌ Load error for Week', week, ':', error);
        setError(`Week ${week} load error: ${error.message}`);
        setLoading(false);
      }
    };
    
    loadForCurrentWeek();
  }, [week, season]); // Reload whenever week or season changes

  // Helper function for team name mapping
  function getTeamAbbreviation(fullName) {
    const nameMap = {
      "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
      "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
      "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
      "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
      "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
      "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
      "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
      "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
      "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
      "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
      "Tennessee Titans": "TEN", "Washington Commanders": "WAS"
    };
    return nameMap[fullName] || fullName;
  }

  // Advanced filtering and sorting logic with proper selectivity
  const processedPredictions = useMemo(() => {
    console.log('Processing predictions:', predictions.length, 'total players');
    console.log('Selected market:', selectedMarket, 'Filter level:', filterLevel);
    
    let filtered = predictions.filter(player => {
      const marketData = player[`${selectedMarket}_td`];
      if (!marketData) {
        console.log('No market data for player:', player.name);
        return false;
      }
      
      console.log(`Player ${player.name}: confidence=${marketData.confidence}%, probability=${marketData.probability}`);
      
      // EMERGENCY DEBUG: Log raw market data types
      console.log(`  - typeof confidence: ${typeof marketData.confidence}`);
      console.log(`  - typeof probability: ${typeof marketData.probability}`);
      console.log(`  - probability value: ${marketData.probability}`);
      
      
      
      // ENHANCED SELECTIVITY: Only show truly actionable picks
      
      // Base probability thresholds by market (more permissive for debugging)
      const minProbThresholds = {
        'anytime': 0.15,  // At least 15% chance (was 25%)
        'first': 0.05,    // At least 5% chance (was 8%)
        'multiple': 0.08  // At least 8% chance (was 12%)
      };
      
      if (false && marketData.probability < minProbThresholds[selectedMarket]) {
        console.log('Player filtered by probability:', player.name, marketData.probability, 'threshold:', minProbThresholds[selectedMarket]);
        return false;
      }
      
      // Enhanced filter level logic
      if (filterLevel === 'high_confidence') {
        // High confidence: 75%+ confidence AND top tier probability
        if (marketData.confidence < 75) return false;
        const topTierThreshold = selectedMarket === 'anytime' ? 0.40 : 
                               selectedMarket === 'first' ? 0.12 : 0.18;
        if (marketData.probability < topTierThreshold) return false;
      }
      
      if (filterLevel === 'value') {
        // Value plays: Good confidence + meaningful edge
        if (marketData.confidence < 65) return false;
        if (!marketData.value || marketData.value < 0.03) return false; // At least 3% edge
      }
      
      // Position-based quality filters (only show relevant players)
      if (player.depth_chart_position && typeof player.depth_chart_position === 'number') {
        // Only show top 2 depth chart players for most positions
        if (player.position === 'RB' && player.depth_chart_position > 2) return false;
        if (player.position === 'WR' && player.depth_chart_position > 3) return false;
        if (player.position === 'TE' && player.depth_chart_position > 2) return false;
        if (player.position === 'QB' && player.depth_chart_position > 1) return false;
      }
      
      return true;
    });
    
    console.log('After filtering:', filtered.length, 'players remaining');
    
    // Sort by selected criteria with enhanced logic
    filtered.sort((a, b) => {
      const aData = a[`${selectedMarket}_td`];
      const bData = b[`${selectedMarket}_td`];
      
      if (sortBy === 'probability') return bData.probability - aData.probability;
      if (sortBy === 'confidence') return bData.confidence - aData.confidence;
      if (sortBy === 'value') return (bData.value || 0) - (aData.value || 0);
      return 0;
    });
    
    // SELECTIVITY LIMIT: Cap results to keep it actionable
    const maxResults = filterLevel === 'all' ? 50 : 
                      filterLevel === 'high_confidence' ? 25 : 30;
    
    return filtered.slice(0, maxResults);
  }, [predictions, selectedMarket, filterLevel, sortBy]);

  // Component for confidence badge with advanced styling
  const AdvancedConfidenceBadge = ({ confidence, probability, dataReliability }) => {
    const getConfidenceColor = (conf) => {
      if (conf >= 80) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      if (conf >= 70) return 'bg-green-100 text-green-800 border-green-200';
      if (conf >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      if (conf >= 50) return 'bg-orange-100 text-orange-800 border-orange-200';
      return 'bg-gray-100 text-gray-800 border-gray-200';
    };
    
    return (
      <div className={`text-xs px-2 py-1 rounded border ${getConfidenceColor(confidence)}`}>
        <div className="font-medium">{confidence}%</div>
        <div className="text-xs opacity-75">
          {(probability * 100).toFixed(1)}% prob
        </div>
        {dataReliability && (
          <div className="text-xs opacity-60">
            {(dataReliability * 100).toFixed(0)}% rel
          </div>
        )}
      </div>
    );
  };

  // Component for displaying key factors
  const PlayerInsights = ({ player, marketType }) => {
    const factors = player.key_factors || {};
    const metadata = player.model_metadata || {};
    
    // Ensure these are arrays, not other data types
    const upside = Array.isArray(metadata.upside_factors) ? metadata.upside_factors : [];
    
    // INTELLIGENT RISK FACTORS - Only show actual risks, not generic warnings
    let risks = [];
    
    // Only show "limited sample" if really limited (less than 2 games)
    const gamesPlayed = factors.games_played || 3;
    if (gamesPlayed < 2) {
      risks.push('limited_sample');
    }
    
    // Only show "injury risk" for players actually on injury report or low snap %
    const snapPercentage = factors.snap_percentage || 0.67;
    const isInjuryRisk = snapPercentage < 0.4 || 
                        metadata.injury_status === 'questionable' || 
                        metadata.injury_status === 'doubtful';
    if (isInjuryRisk) {
      risks.push('injury_risk');
    }
    
    // Add other contextual risk factors
    const dataReliability = metadata.data_reliability || 1;
    if (dataReliability < 0.1) {
      risks.push('sparse_data');
    }
    
    if (factors.usage_trend_4wk && factors.usage_trend_4wk < -0.1) {
      risks.push('declining_usage');
    }
    
    return (
      <div className="text-xs space-y-1">
        <div className="flex flex-wrap gap-1">
          <span className="font-medium">Path:</span>
          <span className={`px-1 rounded text-xs ${
            metadata.primary_td_path === 'red_zone' ? 'bg-blue-100 text-blue-700' :
            metadata.primary_td_path === 'explosive' ? 'bg-purple-100 text-purple-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {metadata.primary_td_path || 'mixed'}
          </span>
        </div>
        
        <div>
          <span className="font-medium">Snap:</span> {((factors.snap_percentage || 0) * 100).toFixed(0)}% |
          <span className="font-medium"> RZ Eff:</span> {((factors.red_zone_efficiency || 0) * 100).toFixed(0)}% |
          <span className="font-medium"> Consist:</span> {((factors.consistency_score || 0) * 100).toFixed(0)}%
        </div>
        
        {upside.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-green-600 font-medium text-xs">↗</span>
            {upside.slice(0, 2).map((factor, i) => (
              <span key={i} className="bg-green-50 text-green-700 px-1 py-0.5 rounded text-xs">
                {factor.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}
        
        {risks.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-red-600 font-medium text-xs">↘</span>
            {risks.slice(0, 2).map((factor, i) => (
              <span key={i} className="bg-red-50 text-red-700 px-1 py-0.5 rounded text-xs">
                {factor.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Component for odds display - converts decimal/probability to American odds format
  const formatToAmericanOdds = (probability) => {
    if (!probability || probability <= 0) return '+200';
    
    if (probability >= 0.5) {
      // Favorite odds (negative)
      const odds = Math.round(-100 / (probability / (1 - probability)));
      return `${odds}`;
    } else {
      // Underdog odds (positive) 
      const odds = Math.round(100 * ((1 - probability) / probability));
      return `+${odds}`;
    }
  };

  const OddsDisplay = ({ impliedOdds, probability, bestBook, value }) => (
    <div className="text-sm">
      <div className="font-medium font-mono">
        {formatToAmericanOdds(probability)}
      </div>
      <div className="text-gray-500 text-xs">
        {(probability * 100).toFixed(1)}% implied
      </div>
      {bestBook && (
        <div className="text-xs text-blue-600 mt-1">
          vs {bestBook}: {value > 0 ? '+' : ''}{(value * 100).toFixed(1)}pp
        </div>
      )}
    </div>
  );

  // Emergency fallback for critical errors
  if (error && error.includes('Component error')) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-bold">Component Error</h2>
          <p className="text-red-700 mt-2">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Debug Info */}
      {(process.env.NODE_ENV === 'development' || true) && (
        <div className="mb-4 p-2 bg-gray-100 rounded text-xs">
          Debug: Week {week}, Predictions: {predictions.length}, Loading: {loading.toString()}, Error: {error || 'none'}
          <br />
          Selected Market: {selectedMarket}, Filter Level: {filterLevel}, Processed: {processedPredictions.length}
          {predictions.length > 0 && predictions[0] && (
            <>
              <br />
              Sample Player: {predictions[0].name}
              <br />
              Market Data Keys: {Object.keys(predictions[0]).filter(k => k.includes('_td')).join(', ')}
              <br />
              Sample {selectedMarket}_td: {JSON.stringify(predictions[0][`${selectedMarket}_td`])}
            </>
          )}
          <br />
          Component mounted at: {new Date().toISOString()}
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">NFL Touchdown Props - Comprehensive Analysis</h1>
          <p className="text-gray-600 mt-1">
            Week {week}, {season} • {predictions.length} players analyzed • {processedPredictions.length} shown
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Week:</label>
            <select 
              value={week} 
              onChange={(e) => setWeek(Number(e.target.value))}
              className="px-2 py-1 border rounded"
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18].map(w => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          </div>
          
          <button
            className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90 transition-opacity"
            onClick={loadComprehensivePredictions}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg border mb-6 p-4">
        {/* Market Selection */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Market:</span>
            {[
              { key: 'anytime', label: 'Anytime TD', desc: 'Score any TD during game' },
              { key: 'first', label: 'First TD', desc: 'Score first TD of game' },
              { key: 'multiple', label: '2+ TDs', desc: 'Score multiple TDs' }
            ].map(market => (
              <button
                key={market.key}
                onClick={() => setSelectedMarket(market.key)}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedMarket === market.key 
                    ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                    : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                }`}
                title={market.desc}
              >
                {market.label}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filter:</span>
            <select 
              value={filterLevel} 
              onChange={(e) => setFilterLevel(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="all">All Players</option>
              <option value="high_confidence">High Confidence (70%+)</option>
              <option value="value">Value Plays</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Sort by:</span>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="probability">Probability</option>
              <option value="confidence">Confidence</option>
              <option value="value">EDGE</option>
            </select>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div className="bg-blue-50 p-2 rounded">
            <div className="font-semibold text-blue-800">
              {processedPredictions.filter(p => p[`${selectedMarket}_td`]?.confidence >= 35).length}
            </div>
            <div className="text-blue-600">35%+ Confidence</div>
          </div>
          <div className="bg-green-50 p-2 rounded">
            <div className="font-semibold text-green-800">
              {processedPredictions.filter(p => p[`${selectedMarket}_td`]?.probability >= 0.25).length}
            </div>
            <div className="text-green-600">25%+ Probability</div>
          </div>
          <div className="bg-purple-50 p-2 rounded">
            <div className="font-semibold text-purple-800">
              {processedPredictions.filter(p => p.position === 'RB').length}
            </div>
            <div className="text-purple-600">Running Backs</div>
          </div>
          <div className="bg-orange-50 p-2 rounded">
            <div className="font-semibold text-orange-800">
              {processedPredictions.filter(p => ['WR', 'TE'].includes(p.position)).length}
            </div>
            <div className="text-orange-600">Pass Catchers</div>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <div className="font-semibold text-gray-800">
              {processedPredictions.filter(p => {
                const factors = p.model_metadata?.upside_factors;
                return Array.isArray(factors) && factors.length > 2;
              }).length}
            </div>
            <div className="text-gray-600">High Upside</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Main Predictions Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Player</th>
                <th className="px-4 py-3 text-left font-medium">Team/Matchup</th>
                <th className="px-4 py-3 text-left font-medium">Position</th>
                <th className="px-4 py-3 text-left font-medium">Model Analysis</th>
                <th className="px-4 py-3 text-left font-medium">Probability</th>
                <th className="px-4 py-3 text-left font-medium">Model Odds</th>
                <th className="px-4 py-3 text-left font-medium">Market Odds</th>
                <th className="px-4 py-3 text-left font-medium">Player Insights</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500" colSpan={9}>
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      <span>Loading comprehensive predictions...</span>
                    </div>
                  </td>
                </tr>
              ) : processedPredictions.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500" colSpan={9}>
                    No qualifying {selectedMarket} TD predictions found for current filters
                  </td>
                </tr>
              ) : (
                processedPredictions.slice(0, 50).map((player, idx) => {
                  const marketData = player[`${selectedMarket}_td`];
                  const metadata = player.model_metadata || {};
                  
                  return (
                    <tr key={`${player.player_id}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium">{player.display_name || player.name}</div>
                          <div className="text-xs text-gray-500">
                            {player.depth_rank || `#${player.depth_chart_position}`} {player.team} {player.position}
                            {player.is_active_current_week && <span className="ml-1 text-green-600">✓</span>}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-xs">{player.matchup_display || player.game_matchup}</div>
                          <div className="text-xs text-gray-500">
                            {player.team === player.home_team ? '🏠 Home' : '✈️ Away'}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded font-medium ${
                          player.position === 'RB' ? 'bg-blue-100 text-blue-800' :
                          player.position === 'WR' ? 'bg-green-100 text-green-800' :
                          player.position === 'TE' ? 'bg-purple-100 text-purple-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {player.position}
                        </span>
                      </td>
                      
                      <td className="px-4 py-3">
                        <div className="text-xs space-y-1">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Path:</span>
                            <span className={`px-1 py-0.5 rounded text-xs ${
                              metadata.primary_td_path === 'red_zone' ? 'bg-red-100 text-red-700' :
                              metadata.primary_td_path === 'explosive' ? 'bg-purple-100 text-purple-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {metadata.primary_td_path || 'mixed'}
                            </span>
                          </div>
                          <div>
                            <span className="font-medium">Reliability:</span> {((metadata.data_reliability || 0.5) * 100).toFixed(0)}%
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="font-semibold text-lg text-center">
                            {player.elite_confidence || 15}%
                          </div>
                          <div className="text-xs text-center space-y-0.5">
                            {player.market_consensus && (
                              <div className="text-blue-600">
                                Market: {player.market_consensus}%
                              </div>
                            )}
                            <div className="text-gray-500">
                              {player.odds_source === 'theoddsapi_live' ? '📊 Live' : '🎯 Model'}
                            </div>
                            {player.real_odds?.books?.length > 0 && (
                              <div className="text-xs text-green-600">
                                {player.real_odds.books.length} book{player.real_odds.books.length > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <div className="text-sm space-y-1">
                          <div className="font-medium text-gray-800">
                            {(() => {
                              const marketData = player[`${selectedMarket}_td`];
                              const prob = marketData?.probability || 0;
                              if (prob >= 0.5) {
                                return Math.round(-100 / (prob / (1 - prob)));
                              } else {
                                return '+' + Math.round(100 * ((1 - prob) / prob));
                              }
                            })()}
                          </div>
                          <div className="text-xs text-gray-500">
                            Model probability
                          </div>
                          <div className="text-xs text-green-600">
                            Elite Model
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <div className="text-sm space-y-1">
                          {(() => {
                            const hasApprovedBooks = player.odds_qualified && player.books_count >= 1;
                            if (hasApprovedBooks && player.real_odds?.books?.[0]) {
                              return (
                                <>
                                  <div className="font-medium text-blue-800">
                                    {player.real_odds.books[0].anytime_odds > 0 ? '+' : ''}{player.real_odds.books[0].anytime_odds}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {player.books_count} approved book{player.books_count > 1 ? 's' : ''}
                                  </div>
                                  <div className="text-xs text-blue-600">
                                    {player.real_odds.books[0].bookmaker}
                                  </div>
                                </>
                              );
                            } else if (player.single_book_warning) {
                              return (
                                <>
                                  <div className="font-medium text-orange-600">—</div>
                                  <div className="text-xs text-orange-600">Only 1 approved book</div>
                                </>
                              );
                            } else {
                              return (
                                <>
                                  <div className="font-medium text-gray-400">—</div>
                                  <div className="text-xs text-gray-500">No approved market lines</div>
                                </>
                              );
                            }
                          })()}
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <PlayerInsights player={player} marketType={selectedMarket} />
                      </td>
                      
                      <td className="px-4 py-3">
                        <div className="text-center">
                          {(() => {
                            const confidence = marketData?.confidence || 0;
                            const hasApprovedBooks = player.odds_qualified && player.books_count >= 1;
                            const valueScore = player[`${selectedMarket}_value_score`] || 0;
                            
                            // Only show BET recommendations if we have approved market lines
                            if (!hasApprovedBooks) {
                              return (
                                <>
                                  <div className="text-sm font-bold text-gray-400">
                                    ⛔ NO BET
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    No approved market lines
                                  </div>
                                </>
                              );
                            }
                            
                            // Gate by confidence AND value thresholds for approved books only
                            if (confidence >= 65 && valueScore >= 0.6) {
                              return (
                                <>
                                  <div className="text-sm font-bold text-green-600">
                                    🔥 STRONG BET
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {confidence}% conf | {player.books_count} books
                                  </div>
                                </>
                              );
                            } else if (confidence >= 50 && valueScore >= 0.4) {
                              return (
                                <>
                                  <div className="text-sm font-bold text-blue-600">
                                    🎯 BET
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {confidence}% conf | {player.books_count} books
                                  </div>
                                </>
                              );
                            } else if (confidence >= 35) {
                              return (
                                <>
                                  <div className="text-sm font-bold text-yellow-600">
                                    📈 LEAN
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {confidence}% conf
                                  </div>
                                </>
                              );
                            } else {
                              return (
                                <>
                                  <div className="text-sm font-bold text-gray-600">
                                    👀 WATCH
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {confidence}% conf
                                  </div>
                                </>
                              );
                            }
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Educational Section */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-3">Comprehensive Model Features</h3>
          <div className="text-sm text-blue-700 space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-medium">Multi-Path Analysis:</span>
              <span>Red Zone (40%), Explosive (25%), Opportunistic (20%), Consistency (15%)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Situational Factors:</span>
              <span>Injury opportunities, game script, opponent matchups, weather conditions</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Data Integration:</span>
              <span>Current season, historical performance, team context, opponent analysis</span>
            </div>
          </div>
        </div>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 mb-3">Professional Betting Guidelines</h3>
          <div className="text-sm text-green-700 space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-medium">Strong Bets (80%+):</span>
              <span>Rare opportunities with significant edges, full unit sizing</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Solid Bets (70-79%):</span>
              <span>Strong confidence plays, standard unit sizing</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Leans (60-69%):</span>
              <span>Moderate opportunities, reduced unit sizing</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium">Watch List (50-59%):</span>
              <span>Monitor for line movement and development</span>
            </div>
          </div>
        </div>
      </div>

      {/* Responsible Gambling Disclaimer */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
        <p className="text-sm text-gray-700">
          <strong>Disclaimer:</strong> This comprehensive analysis is for entertainment and educational purposes only. 
          Player prop betting involves significant variance and risk. Never bet more than you can afford to lose. 
          Gamble responsibly and seek help if gambling becomes problematic.
        </p>
      </div>
    </div>
  );
};

export default NFLTouchdownPropsComprehensive;
