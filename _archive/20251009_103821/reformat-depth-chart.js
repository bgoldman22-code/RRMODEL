// Script to reformat depth chart JSON to compact single-line arrays
import fs from 'fs';

function reformatDepthChart() {
  try {
    // Read the current depth chart
    const filePath = '/Users/brentgoldman/Desktop/REPO33/RRMODEL/public/history/2025/week5/depth-charts.json';
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    console.log('🔧 Reformatting depth chart to compact format...');
    
    // Create custom JSON formatter for compact arrays
    const compactJson = JSON.stringify(data, null, 2)
      .replace(/\[\s*\n\s*"/g, '["')           // Start arrays on same line
      .replace(/",\s*\n\s*"/g, '", "')         // Single line array items
      .replace(/"\s*\n\s*\]/g, '"]');          // End arrays on same line
    
    // Write the reformatted file
    fs.writeFileSync(filePath, compactJson);
    
    console.log('✅ Depth chart reformatted successfully!');
    console.log('📁 File format now matches expected compact style');
    
    // Show a sample of the new format
    console.log('\n📋 Sample of new format:');
    const sample = compactJson.split('\n').slice(0, 15).join('\n');
    console.log(sample + '...');
    
  } catch (error) {
    console.error('❌ Error reformatting depth chart:', error);
  }
}

reformatDepthChart();