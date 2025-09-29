// Test QB lookup in PLAYER_EPA_DATABASE
const PLAYER_EPA_DATABASE = {
  QB: {
    'Josh Allen': [0.31, 0.08, 1.0],
    'Patrick Mahomes II': [0.29, 0.12, 1.0],
    'Lamar Jackson': [0.28, 0.06, 1.0],
    'Kyler Murray': [0.24, 0.05, 1.0],
    'Jayden Daniels': [0.26, 0.04, 1.0], // Strong rookie season, big dropoff to Mariota
  }
};

const testQBName = 'Jayden Daniels';
const playerData = PLAYER_EPA_DATABASE['QB']?.[testQBName];
console.log('QB Lookup Test:');
console.log('Player Name:', testQBName);
console.log('Player Data:', playerData);
console.log('Found in database:', !!playerData);

if (playerData) {
  const [starterEPA, replacementEPA, usageShare] = playerData;
  const baseImpact = -(starterEPA - replacementEPA) * usageShare;
  console.log('Base Impact:', baseImpact);
  console.log('Expected Game Impact (x65 plays):', baseImpact * 65);
}

// Test injury data structure
const testInjuryData = {
  "qb_status": "out",
  "qb_name": "Jayden Daniels"
};

console.log('\nInjury Data Test:');
console.log('QB Status:', testInjuryData.qb_status);
console.log('QB Name:', testInjuryData.qb_name);
console.log('Status !== active:', testInjuryData.qb_status !== 'active');
console.log('Condition should trigger:', !!(testInjuryData.qb_status && testInjuryData.qb_status !== 'active'));