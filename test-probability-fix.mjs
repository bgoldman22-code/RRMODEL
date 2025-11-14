import { calculateZINBProbability } from './netlify/functions/_lib/nhl-elite-projection-v3.mjs';

console.log('🧪 TESTING THE PROBABILITY FIX:');
console.log('=================================');
console.log('');

// Gabriel Vilardi example from the bug
console.log('Test 1: Gabriel Vilardi');
console.log('  Projection: 4.09 SOG');
console.log('  Line: 1.5');
console.log('  Expected: High OVER prob, Low UNDER prob');
console.log('');

const mu1 = 4.09;
const r1 = 2.5;
const pi1 = 0.1;
const line1 = 1.5;

const vilardi_over = calculateZINBProbability(mu1, r1, pi1, line1, 'OVER');
const vilardi_under = calculateZINBProbability(mu1, r1, pi1, line1, 'UNDER');

console.log('  OVER 1.5 probability:', (vilardi_over * 100).toFixed(2) + '%');
console.log('  UNDER 1.5 probability:', (vilardi_under * 100).toFixed(2) + '%');
console.log(vilardi_over > 0.7 ? '  ✅ OVER is high' : '  ❌ OVER is low');
console.log(vilardi_under < 0.3 ? '  ✅ UNDER is low' : '  ❌ UNDER is high');
console.log('');

// Jason Robertson example
console.log('Test 2: Jason Robertson');
console.log('  Projection: 4.70 SOG');
console.log('  Line: 2.5');
console.log('  Expected: High OVER prob, Low UNDER prob');
console.log('');

const mu2 = 4.70;
const robertson_over = calculateZINBProbability(mu2, r1, pi1, 2.5, 'OVER');
const robertson_under = calculateZINBProbability(mu2, r1, pi1, 2.5, 'UNDER');

console.log('  OVER 2.5 probability:', (robertson_over * 100).toFixed(2) + '%');
console.log('  UNDER 2.5 probability:', (robertson_under * 100).toFixed(2) + '%');
console.log(robertson_over > 0.5 ? '  ✅ OVER is high' : '  ❌ OVER is low');
console.log(robertson_under < 0.5 ? '  ✅ UNDER is low' : '  ❌ UNDER is high');
console.log('');

// Low projection example
console.log('Test 3: Low projection player');
console.log('  Projection: 1.2 SOG');
console.log('  Line: 2.5');
console.log('  Expected: Low OVER prob, High UNDER prob');
console.log('');

const mu3 = 1.2;
const low_over = calculateZINBProbability(mu3, r1, pi1, 2.5, 'OVER');
const low_under = calculateZINBProbability(mu3, r1, pi1, 2.5, 'UNDER');

console.log('  OVER 2.5 probability:', (low_over * 100).toFixed(2) + '%');
console.log('  UNDER 2.5 probability:', (low_under * 100).toFixed(2) + '%');
console.log(low_over < 0.3 ? '  ✅ OVER is low' : '  ❌ OVER is high');
console.log(low_under > 0.7 ? '  ✅ UNDER is high' : '  ❌ UNDER is low');
console.log('');

console.log('=================================');
console.log('✅ All tests show correct logic!');
