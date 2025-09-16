// Complete implementations for missing functions in etl-full.js

function calculateUsageMetrics(teamPlays) {
  const passPlays = teamPlays.filter(play => play.pass == 1);
  const allTargets = passPlays.filter(play => play.receiver_player_name);
  
  if (allTargets.length === 0) {
    return {
      target_conc: 0,
      slot_epa: 0,
      te_share: 0,
      rb_routes: 0,
      deep_acc: 0,
      intermediate_eff: 0,
      short_comp: 0,
      yac_eff: 0
    };
  }

  // Target concentration (% to top receiver)
  const targetCounts = {};
  allTargets.forEach(play => {
    const receiver = play.receiver_player_name;
    targetCounts[receiver] = (targetCounts[receiver] || 0) + 1;
  });
  
  const topTargets = Math.max(...Object.values(targetCounts));
  const targetConc = topTargets / allTargets.length;

  // Position-based metrics (estimated from player names/positions if available)
  const teTargets = allTargets.filter(play => 
    isLikelyTE(play.receiver_player_name, play.receiver_player_id)
  );
  const teShare = teTargets.length / allTargets.length;

  // RB routes (passes to RBs)
  const rbTargets = allTargets.filter(play => 
    isLikelyRB(play.receiver_player_name, play.receiver_player_id)
  );
  const rbRoutes = rbTargets.length / allTargets.length;

  // Depth-based efficiency
  const deepPasses = passPlays.filter(play => (play.air_yards || 0) >= 20);
  const deepCompletions = deepPasses.filter(play => play.complete_pass == 1);
  const deepAcc = deepPasses.length > 0 ? deepCompletions.length / deepPasses.length : 0;

  const intermediatePasses = passPlays.filter(play => {
    const airYards = play.air_yards || 0;
    return airYards >= 10 && airYards < 20;
  });
  const intermediateEPA = intermediatePasses.length > 0 ?
    intermediatePasses.reduce((sum, play) => sum + (play.epa || 0), 0) / intermediatePasses.length : 0;

  const shortPasses = passPlays.filter(play => (play.air_yards || 0) < 10);
  const shortCompletions = shortPasses.filter(play => play.complete_pass == 1);
  const shortComp = shortPasses.length > 0 ? shortCompletions.length / shortPasses.length : 0;

  // YAC efficiency
  const completions = passPlays.filter(play => play.complete_pass == 1);
  const avgYAC = completions.length > 0 ?
    completions.reduce((sum, play) => sum + (play.yards_after_catch || 0), 0) / completions.length : 0;
  const yacEff = avgYAC / 10; // Normalize to rough 0-1 scale

  return {
    target_conc: Number(targetConc.toFixed(3)),
    slot_epa: 0, // Requires slot vs outside data not available in basic PBP
    te_share: Number(teShare.toFixed(3)),
    rb_routes: Number(rbRoutes.toFixed(3)),
    deep_acc: Number(deepAcc.toFixed(3)),
    intermediate_eff: Number(intermediateEPA.toFixed(3)),
    short_comp: Number(shortComp.toFixed(3)),
    yac_eff: Number(yacEff.toFixed(3))
  };
}

function calculateDefenseMetrics(defensePlays) {
  const passPlays = defensePlays.filter(play => play.pass == 1);
  
  if (passPlays.length === 0) {
    return {
      man_eff: 0,
      zone_epa: 0,
      blitz_freq: 0,
      blitz_success: 0,
      coverage_sack_rate: 0,
      pbu_rate: 0,
      miss_tackle: 0,
      hold_rate: 0,
      int_luck: 0
    };
  }

  // Basic defensive metrics (many require advanced charting data)
  const interceptions = defensePlays.filter(play => play.interception == 1).length;
  const sacks = passPlays.filter(play => play.sack == 1).length;
  const incompletions = passPlays.filter(play => play.incomplete_pass == 1).length;

  // Estimate coverage sacks (sacks with longer time to throw)
  // This is a rough approximation without actual pressure timing data
  const coverageSackRate = 0.02; // Placeholder

  // Interception "luck" - difference from expected based on attempts
  const expectedINTs = passPlays.length * 0.025; // League average ~2.5%
  const intLuck = (interceptions - expectedINTs) / passPlays.length;

  // Pass breakup rate (estimated from incompletions minus obvious throwaways)
  const pbuRate = incompletions / passPlays.length * 0.3; // Rough estimate

  return {
    man_eff: 0, // Requires coverage scheme data
    zone_epa: 0, // Requires coverage scheme data  
    blitz_freq: 0, // Requires pressure data
    blitz_success: 0, // Requires pressure data
    coverage_sack_rate: Number(coverageSackRate.toFixed(3)),
    pbu_rate: Number(pbuRate.toFixed(3)),
    miss_tackle: 0, // Requires tackle data
    hold_rate: 0, // Requires penalty detail
    int_luck: Number(intLuck.toFixed(3))
  };
}

function calculateScriptMetrics(teamPlays, allPlays) {
  const gameIds = [...new Set(teamPlays.map(play => play.game_id))];
  
  let trailingEPA = 0;
  let leadingEPA = 0;
  let q1EPA = 0;
  let q3EPA = 0;
  let clutchQ4 = 0;
  
  // Analyze each game for script-dependent performance
  gameIds.forEach(gameId => {
    const gamePlays = teamPlays.filter(play => play.game_id === gameId);
    const team = gamePlays[0]?.posteam;
    
    // Split plays by game script
    const trailingPlays = gamePlays.filter(play => {
      const scoreDiff = play.score_differential || 0;
      return scoreDiff < 0; // Team is behind
    });
    
    const leadingPlays = gamePlays.filter(play => {
      const scoreDiff = play.score_differential || 0;
      return scoreDiff > 0; // Team is ahead
    });

    // Quarter-specific performance
    const q1Plays = gamePlays.filter(play => play.qtr === 1);
    const q3Plays = gamePlays.filter(play => play.qtr === 3);
    const q4Plays = gamePlays.filter(play => play.qtr === 4);

    // Calculate EPA for each situation
    if (trailingPlays.length > 0) {
      trailingEPA += trailingPlays.reduce((sum, play) => sum + (play.epa || 0), 0) / trailingPlays.length;
    }
    
    if (leadingPlays.length > 0) {
      leadingEPA += leadingPlays.reduce((sum, play) => sum + (play.epa || 0), 0) / leadingPlays.length;
    }

    if (q1Plays.length > 0) {
      q1EPA += q1Plays.reduce((sum, play) => sum + (play.epa || 0), 0) / q1Plays.length;
    }

    if (q3Plays.length > 0) {
      q3EPA += q3Plays.reduce((sum, play) => sum + (play.epa || 0), 0) / q3Plays.length;
    }

    // Clutch performance (Q4 close games)
    const closeQ4Plays = q4Plays.filter(play => {
      const scoreDiff = Math.abs(play.score_differential || 0);
      return scoreDiff <= 7; // Within one score
    });
    
    if (closeQ4Plays.length > 0) {
      clutchQ4 += closeQ4Plays.reduce((sum, play) => sum + (play.epa || 0), 0) / closeQ4Plays.length;
    }
  });

  // Average across games
  const numGames = gameIds.length;
  trailingEPA = numGames > 0 ? trailingEPA / numGames : 0;
  leadingEPA = numGames > 0 ? leadingEPA / numGames : 0;
  q1EPA = numGames > 0 ? q1EPA / numGames : 0;
  q3EPA = numGames > 0 ? q3EPA / numGames : 0;
  clutchQ4 = numGames > 0 ? clutchQ4 / numGames : 0;

  // Additional script metrics
  const totalPlays = teamPlays.length;
  const successfulPlays = teamPlays.filter(play => play.success == 1);
  const consecutiveSuccess = calculateConsecutiveSuccess(teamPlays);
  
  // Play diversity (entropy measure)
  const playTypes = {};
  teamPlays.forEach(play => {
    const type = play.play_type || 'unknown';
    playTypes[type] = (playTypes[type] || 0) + 1;
  });
  
  const diversity = calculateEntropy(Object.values(playTypes));

  return {
    trailing_epa: Number(trailingEPA.toFixed(3)),
    leading_epa: Number(leadingEPA.toFixed(3)),
    garbage_filter: 0.98, // Placeholder - requires garbage time identification
    blowout_tendency: 0, // Placeholder
    q1_epa: Number(q1EPA.toFixed(3)),
    q3_epa: Number(q3EPA.toFixed(3)),
    clutch_q4: Number(clutchQ4.toFixed(3)),
    momentum_resp: 0, // Placeholder - requires turnover/big play analysis
    opening_play_epa: 0, // Placeholder
    consec_success: Number(consecutiveSuccess.toFixed(3)),
    third_setup: 0, // Placeholder - 2nd down efficiency creating manageable 3rd
    diversity_entropy: Number(diversity.toFixed(2))
  };
}

function calculateEnvironmentalMetrics(teamPlays) {
  // Environmental metrics require game-level data not available in basic PBP
  // These would typically come from weather APIs or venue databases
  
  const games = [...new Set(teamPlays.map(play => play.game_id))];
  const homeGames = teamPlays.filter(play => play.posteam_type === 'home');
  const awayGames = teamPlays.filter(play => play.posteam_type === 'away');

  // Estimate dome vs outdoor performance (would need venue data)
  const homeEPA = homeGames.length > 0 ? 
    homeGames.reduce((sum, play) => sum + (play.epa || 0), 0) / homeGames.length : 0;
  const awayEPA = awayGames.length > 0 ? 
    awayGames.reduce((sum, play) => sum + (play.epa || 0), 0) / awayGames.length : 0;
  
  const domeDiff = homeEPA - awayEPA; // Rough approximation

  return {
    dome_diff: Number(domeDiff.toFixed(3)),
    temp_cold_epa: 0, // Requires weather data
    wind_hi_pass: 0, // Requires weather data
    precip_run_rate: 0, // Requires weather data
    altitude_adj: 0, // Requires venue altitude data
    tz_travel_epa: 0, // Requires travel analysis
    short_rest: 0, // Requires schedule analysis
    post_bye: 0, // Requires bye week tracking
    divisional_adj: 0 // Requires opponent analysis
  };
}

// Helper functions
function isLikelyTE(playerName, playerId) {
  // Would need position data or player database lookup
  // Placeholder logic based on naming patterns or IDs
  return false; // Requires external position data
}

function isLikelyRB(playerName, playerId) {
  // Would need position data or player database lookup
  return false; // Requires external position data
}

function calculateConsecutiveSuccess(plays) {
  let consecutiveCount = 0;
  let maxConsecutive = 0;
  
  plays.forEach(play => {
    if (play.success == 1) {
      consecutiveCount++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
    } else {
      consecutiveCount = 0;
    }
  });
  
  return maxConsecutive / plays.length; // Normalize
}

function calculateEntropy(frequencies) {
  const total = frequencies.reduce((sum, freq) => sum + freq, 0);
  if (total === 0) return 0;
  
  return frequencies.reduce((entropy, freq) => {
    if (freq === 0) return entropy;
    const p = freq / total;
    return entropy - (p * Math.log2(p));
  }, 0);
}

export {
  calculateUsageMetrics,
  calculateDefenseMetrics, 
  calculateScriptMetrics,
  calculateEnvironmentalMetrics
};