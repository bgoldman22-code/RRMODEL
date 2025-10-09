#!/usr/bin/env node

// Test script to verify soccer BTTS team form fixes
import { readFileSync } from 'fs';

// Read the soccer predictions file
const filePath = './netlify/functions/soccer-btts-predictions.js';
const content = readFileSync(filePath, 'utf8');

console.log('🔍 Testing Soccer BTTS Fixes...\n');

// Test 1: Check if hardcoded fallbacks are removed
const hardcodedFallbacks = content.match(/['"]75['"].*ATT.*['"]70['"].*DEF/);
if (!hardcodedFallbacks) {
  console.log('✅ No hardcoded "75% ATT | 70% DEF" fallbacks found');
} else {
  console.log('❌ Still has hardcoded fallbacks:', hardcodedFallbacks[0]);
}

// Test 2: Check if new teams were added
const hasFC_Koln = content.includes("'FC Köln'") || content.includes("'1. FC Köln'");
const hasStPauli = content.includes("'St Pauli'");
const hasMonchengladbach = content.includes("'Borussia Mönchengladbach'");

console.log(`✅ FC Köln added: ${hasFC_Koln}`);
console.log(`✅ St Pauli variation added: ${hasStPauli}`);  
console.log(`✅ Mönchengladbach variation added: ${hasMonchengladbach}`);

// Test 3: Check if recent_form_attack/defense were added to teams
const recentFormMatches = content.match(/recent_form_attack.*recent_form_defense/g);
const recentFormCount = recentFormMatches ? recentFormMatches.length : 0;

console.log(`✅ Teams with recent_form data: ${recentFormCount}`);

// Test 4: Check if new logic calculates from goal stats
const hasCalculationLogic = content.includes('totalGoalsScored / totalGames');
console.log(`✅ Goal-based calculation logic added: ${hasCalculationLogic}`);

// Test 5: Show sample team data
console.log('\n📊 Sample team data:');
const teamDataMatch = content.match(/'Bayern Munich':\s*{[^}]+}/);
if (teamDataMatch) {
  console.log(teamDataMatch[0]);
}

console.log('\n🏁 Test completed!');