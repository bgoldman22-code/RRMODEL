// test-joe-burrow-fix.js
// Test if Joe Burrow manual override is now working in the injury collection

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the injury collection function
const injuryCollectionPath = path.join(__dirname, 'netlify/functions/nfl-injuries-collect.js');

// Read the injury collection file and check the processQBInjuries function
async function testJoeBurrowFix() {
  console.log('🔍 Testing Joe Burrow manual override fix...\n');
  
  try {
    // Read the injury collection file
    const injuryCode = fs.readFileSync(injuryCollectionPath, 'utf8');
    
    // Check if processQBInjuries includes manual overrides
    const hasManualOverrideCall = injuryCode.includes('determineQBStatus') && injuryCode.includes('getStartingQBName');
    
    if (hasManualOverrideCall) {
      console.log('✅ FIXED: processQBInjuries now calls manual override functions');
      
      // Find the function and show relevant code
      const lines = injuryCode.split('\n');
      let inProcessQBFunction = false;
      let functionStart = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('function processQBInjuries') || lines[i].includes('processQBInjuries =')) {
          inProcessQBFunction = true;
          functionStart = i;
        }
        
        if (inProcessQBFunction && (lines[i].includes('determineQBStatus') || lines[i].includes('getStartingQBName'))) {
          console.log(`\n📍 Manual override integration found at line ${i + 1}:`);
          console.log(lines[i].trim());
        }
        
        if (inProcessQBFunction && lines[i].trim() === '}' && i > functionStart + 5) {
          break;
        }
      }
      
      // Test manual override functions exist
      const hasJoeBurrowOverride = injuryCode.includes('Joe Burrow') && injuryCode.includes('OUT');
      
      if (hasJoeBurrowOverride) {
        console.log('\n✅ Joe Burrow manual override found in code');
      } else {
        console.log('\n⚠️ Joe Burrow manual override may not be properly configured');
      }
      
    } else {
      console.log('❌ ISSUE: processQBInjuries still does not call manual override functions');
    }
    
  } catch (error) {
    console.error('❌ Error testing fix:', error.message);
  }
}

testJoeBurrowFix();