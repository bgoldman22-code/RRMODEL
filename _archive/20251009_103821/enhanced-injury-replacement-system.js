// Enhanced Injury Impact System - Player Value vs Replacement  
// Fixed all bugs identified by GPT analysis + integrated live depth charts

const PLAYER_VALUES = {
  // QB Values (EPA contribution above replacement)
  QB: {
    'Jayden Daniels': { value: 6.2, backup_value: -2.1 },
    'Joe Burrow': { value: 8.1, backup_value: -1.8 },
    'Josh Allen': { value: 9.4, backup_value: -0.9 },
    'Lamar Jackson': { value: 8.8, backup_value: -2.3 },
    'Patrick Mahomes': { value: 9.2, backup_value: 0.1 },
    'Dak Prescott': { value: 4.1, backup_value: -1.4 },
    'Tua Tagovailoa': { value: 5.2, backup_value: -3.1 },
    'Aaron Rodgers': { value: 6.8, backup_value: -1.2 },
    'Brock Purdy': { value: 5.9, backup_value: -0.7 },
    'Jalen Hurts': { value: 7.3, backup_value: -1.6 },
    'Baker Mayfield': { value: 4.3, backup_value: -2.2 }
  },
  
  // WR Values (Target share and efficiency above replacement)
  WR: {
    'Tyreek Hill': { value: 4.2, backup_value: 2.1 },
    'Davante Adams': { value: 4.0, backup_value: 1.2 },
    'Cooper Kupp': { value: 3.8, backup_value: 2.8 },
    'Mike Evans': { value: 3.6, backup_value: 2.4 },
    'Stefon Diggs': { value: 3.9, backup_value: 0.8 },
    'DeAndre Hopkins': { value: 3.2, backup_value: 1.1 },
    'A.J. Brown': { value: 3.7, backup_value: 2.2 },
    'Ja\'Marr Chase': { value: 4.1, backup_value: 2.6 },
    'CeeDee Lamb': { value: 3.9, backup_value: 1.4 },
    'DK Metcalf': { value: 3.3, backup_value: 1.8 },
    'Terry McLaurin': { value: 2.8, backup_value: 1.1 },
    'Chris Godwin': { value: 2.4, backup_value: 0.8 }
  },
  
  // RB Values (Rushing/receiving efficiency above replacement)
  RB: {
    'Christian McCaffrey': { value: 4.8, backup_value: 1.2 },
    'Saquon Barkley': { value: 4.1, backup_value: 0.6 },
    'Josh Jacobs': { value: 3.6, backup_value: 0.8 },
    'Derrick Henry': { value: 3.2, backup_value: 0.4 },
    'Jonathan Taylor': { value: 3.8, backup_value: 0.3 },
    'Austin Ekeler': { value: 3.4, backup_value: 1.1 },
    'Nick Chubb': { value: 3.7, backup_value: 0.9 },
    'Alvin Kamara': { value: 4.0, backup_value: 0.7 },
    'Joe Mixon': { value: 3.3, backup_value: 0.5 },
    'Tony Pollard': { value: 2.9, backup_value: 1.0 }
  },
  
  // TE Values
  TE: {
    'Travis Kelce': { value: 3.8, backup_value: 0.2 },
    'Mark Andrews': { value: 3.2, backup_value: 1.1 },
    'George Kittle': { value: 3.1, backup_value: 0.1 },
    'T.J. Hockenson': { value: 2.8, backup_value: 0.3 },
    'Kyle Pitts': { value: 2.6, backup_value: 0.1 },
    'Evan Engram': { value: 2.4, backup_value: 0.4 },
    'Dallas Goedert': { value: 2.7, backup_value: 0.2 },
    'David Njoku': { value: 2.3, backup_value: 0.3 }
  }
};

// Load depth charts from system (async function for live loading)
let TEAM_DEPTH_CHARTS = null;

async function loadDepthCharts() {
  if (TEAM_DEPTH_CHARTS) return TEAM_DEPTH_CHARTS;
  
  try {
    // Try multiple potential paths for depth charts
    const endpoints = [
      '/public/history/2025/week4/depth-charts.json',
      '/history/2025/week4/depth-charts.json', 
      '/data/nfl-td/depth-charts.json',
      './public/history/2025/week4/depth-charts.json'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          TEAM_DEPTH_CHARTS = await response.json();
          console.log(`✅ Loaded depth charts from: ${endpoint}`);
          return TEAM_DEPTH_CHARTS;
        }
      } catch (e) {
        console.log(`❌ Failed to load depth charts from: ${endpoint}`);
      }
    }
    
    throw new Error('No depth chart endpoints available');
    
  } catch (error) {
    console.warn('⚠️ Using fallback depth chart data');
    // Fallback minimal depth charts
    TEAM_DEPTH_CHARTS = {
      'WAS': {
        QB: ['Jayden Daniels', 'Marcus Mariota'],
        RB: ['Brian Robinson Jr.', 'Austin Ekeler'],
        WR: ['Terry McLaurin', 'Jahan Dotson', 'Noah Brown'],
        TE: ['Zach Ertz', 'John Bates']
      },
      'CIN': {
        QB: ['Joe Burrow', 'Jake Browning'],
        RB: ['Chase Brown', 'Trayveon Williams'],
        WR: ['Ja\'Marr Chase', 'Tee Higgins', 'Tyler Boyd'],
        TE: ['Mike Gesicki', 'Drew Sample']
      }
    };
    return TEAM_DEPTH_CHARTS;
  }
}

// GPT's fixes - robust name matching and consistent return types
function normName(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Build value index for robust lookup (fixes position key mismatch bug)
function makeValueIndex() {
  const idx = { QB: new Map(), WR: new Map(), RB: new Map(), TE: new Map() };
  for (const [posKey, table] of Object.entries(PLAYER_VALUES)) {
    const pos = posKey; // Already normalized to QB, WR, RB, TE
    for (const [name, v] of Object.entries(table)) {
      idx[pos].set(normName(name), v);
    }
  }
  return idx;
}

const VALUE_IDX = makeValueIndex();

function getPlayerValue(position, playerName) {
  const rec = VALUE_IDX[position]?.get(normName(playerName));
  return rec || null;
}

// Robust depth lookup (full-name match, fallback to startsWith)
function findOnDepth(list, player) {
  const target = normName(player);
  let i = list.findIndex(p => normName(p) === target);
  if (i === -1) i = list.findIndex(p => normName(p).startsWith(target));
  return i;
}

// Modern NFL injury status mapping
const STATUS_MULT = {
  out: 1.0, doubtful: 0.8, questionable: 0.35,
  ir: 1.0, pup: 1.0, nfi: 1.0,
  probable: 0.1, // Legacy status
  active: 0.0
};

function statusMult(s) {
  if (!s) return 0;
  const k = s.toLowerCase();
  return STATUS_MULT[k] ?? 0;
}

// Generic impacts (always return consistent object structure)
function getGenericImpact(position, injuryStatus) {
  const generic = {
    QB: { out: -6.0, doubtful: -4.0, questionable: -1.5 },
    WR: { out: -2.0, doubtful: -1.2, questionable: -0.5 },
    RB: { out: -1.5, doubtful: -1.0, questionable: -0.4 },
    TE: { out: -1.0, doubtful: -0.6, questionable: -0.3 }
  };
  
  const mult = statusMult(injuryStatus);
  const base = generic[position]?.out ?? -1.0;
  
  return { 
    impact: base * mult, 
    generic: true, 
    injuryStatus,
    reasoning: `Generic ${position} impact: ${base} × ${mult} = ${(base * mult).toFixed(2)}`
  };
}

// Fixed replacement calculation with backup_value fallback
async function calculateReplacementImpact(team, position, injuredPlayer, injuryStatus) {
  // Ensure depth charts are loaded
  const depthCharts = await loadDepthCharts();
  const depth = depthCharts[team];
  
  if (!depth || !depth[position]) {
    console.log(`⚠️ No depth chart data for ${team} ${position}`);
    return getGenericImpact(position, injuryStatus);
  }

  const idx = findOnDepth(depth[position], injuredPlayer);
  if (idx === -1) {
    console.log(`⚠️ ${injuredPlayer} not found in ${team} ${position} depth chart`);
    return getGenericImpact(position, injuryStatus);
  }

  const replIdx = idx + 1;
  const replacementPlayer = depth[position][replIdx];

  if (!replacementPlayer) {
    const base = getGenericImpact(position, injuryStatus);
    return { 
      ...base, 
      impact: base.impact * 1.5, 
      note: 'no-backup',
      reasoning: `${base.reasoning} × 1.5 (no backup) = ${(base.impact * 1.5).toFixed(2)}`
    };
  }

  const injuredRec = getPlayerValue(position, injuredPlayer);
  let replacementRec = getPlayerValue(position, replacementPlayer);

  // CRITICAL FIX: fallback to starter's backup_value if replacement not in table
  if (!replacementRec && injuredRec?.backup_value !== undefined) {
    replacementRec = { value: injuredRec.backup_value };
    console.log(`📊 Using backup_value ${injuredRec.backup_value} for ${replacementPlayer}`);
  }

  const mult = statusMult(injuryStatus);
  if (!injuredRec) {
    console.log(`📊 Using generic values for ${injuredPlayer}`);
    return getGenericImpact(position, injuryStatus);
  }

  const injuredValue = injuredRec.value ?? 0;
  const replacementValue = (replacementRec?.value ?? 0);
  const valueDrop = (injuredValue - replacementValue) * mult;

  console.log(`🔄 ${team} ${position}: ${injuredPlayer} (${injuredValue}) → ${replacementPlayer} (${replacementValue})`);
  console.log(`📉 Value drop: ${valueDrop.toFixed(2)} points (${injuryStatus})`);

  return {
    impact: -valueDrop, // Negative because it hurts the team
    injuredPlayer,
    replacementPlayer,
    injuredValue,
    replacementValue,
    injuryStatus,
    mult,
    breakdown: `${injuredPlayer} (${injuredValue}) → ${replacementPlayer} (${replacementValue}) × ${mult} = ${valueDrop.toFixed(2)} drop`
  };
}

// Fixed game analysis with proper async handling and complete team analysis
async function analyzeGameWithReplacements(homeTeam, awayTeam, injuries) {
  console.log(`\n🏈 ENHANCED INJURY ANALYSIS: ${awayTeam} @ ${homeTeam}`);
  console.log('='.repeat(50));
  
  let homeImpact = 0;
  let awayImpact = 0;
  const homeBreakdown = [];
  const awayBreakdown = [];
  
  // Helper function to analyze team injuries
  const analyzeTeam = async (team, isHome) => {
    const T = injuries[team]; 
    if (!T) return;
    
    console.log(`\n${isHome ? '🏠' : '✈️'} ${team} INJURY ANALYSIS:`);
    
    // QB Analysis
    if (T.qb_status && T.qb_status.toLowerCase() !== 'active') {
      const res = await calculateReplacementImpact(team, 'QB', T.qb_name, T.qb_status);
      if (isHome) {
        homeImpact += res.impact;
        homeBreakdown.push({ position: 'QB', ...res });
      } else {
        awayImpact += res.impact;
        awayBreakdown.push({ position: 'QB', ...res });
      }
    }
    
    // RB/WR/TE analysis with proper async handling
    const positionMappings = [['RB','rb_injuries'], ['WR','wr_injuries'], ['TE','te_injuries']];
    
    for (const [pos, key] of positionMappings) {
      const injuries = T[key] || [];
      for (const inj of injuries) {
        if (!inj.status || inj.status.toLowerCase() === 'active') continue;
        
        const res = await calculateReplacementImpact(team, pos, inj.name, inj.status);
        if (isHome) {
          homeImpact += res.impact;
          homeBreakdown.push({ position: pos, ...res });
        } else {
          awayImpact += res.impact;
          awayBreakdown.push({ position: pos, ...res });
        }
      }
    }
  };
  
  // Analyze both teams
  await analyzeTeam(homeTeam, true);
  await analyzeTeam(awayTeam, false);
  
  // Calculate prediction adjustments with improved logic
  const netImpact = homeImpact - awayImpact;             // negative = home hurt more
  const spreadAdjustment = -netImpact;                   // + means toward HOME
  const totalAdjustment = -(Math.abs(homeImpact) + Math.abs(awayImpact)) * 0.35; // Reduced coefficient per GPT
  
  console.log(`\n📊 FINAL IMPACT ANALYSIS:`);
  console.log(`🏠 ${homeTeam} total impact: ${homeImpact.toFixed(2)}`);
  console.log(`✈️ ${awayTeam} total impact: ${awayImpact.toFixed(2)}`);
  console.log(`📏 Spread adjustment: ${spreadAdjustment > 0 ? '+' : ''}${spreadAdjustment.toFixed(1)} (toward ${spreadAdjustment > 0 ? homeTeam : awayTeam})`);
  console.log(`🎲 Total adjustment: ${totalAdjustment.toFixed(1)} points`);
  
  return {
    homeImpact,
    awayImpact,
    netImpact,
    spreadAdjustment,
    totalAdjustment,
    spreadDirection: spreadAdjustment >= 0 ? homeTeam : awayTeam,
    homeBreakdown,
    awayBreakdown,
    significantImpact: Math.abs(spreadAdjustment) >= 2.0 || Math.abs(totalAdjustment) >= 3.0
  };
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateReplacementImpact,
    analyzeGameWithReplacements,
    PLAYER_VALUES,
    TEAM_DEPTH_CHARTS
  };
}

console.log('🎯 Enhanced replacement-based injury impact system loaded!');
console.log('📊 Use analyzeGameWithReplacements("ATL", "WAS", injuryData) for full analysis');