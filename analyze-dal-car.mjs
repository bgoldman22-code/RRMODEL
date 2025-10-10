// Quick analysis script for DAL @ CAR Week 6
import { loadAdvancedMetrics, getTeamMetrics } from './netlify/functions/_lib/blobs-nfl.js';

async function analyzeDalCar() {
  console.log('\n=== DAL @ CAR WEEK 6 BREAKDOWN ===\n');
  
  try {
    // Load the advanced metrics (R pipeline data)
    const metrics = await loadAdvancedMetrics(2025);
    
    if (!metrics || !metrics.teams) {
      console.log('❌ No metrics data available');
      return;
    }
    
    const dalMetrics = getTeamMetrics(metrics, 'DAL');
    const carMetrics = getTeamMetrics(metrics, 'CAR');
    
    console.log('📊 DALLAS COWBOYS METRICS:');
    console.log(JSON.stringify(dalMetrics, null, 2));
    
    console.log('\n📊 CAROLINA PANTHERS METRICS:');
    console.log(JSON.stringify(carMetrics, null, 2));
    
    // Compare key metrics
    console.log('\n⚖️ KEY COMPARISONS:\n');
    
    if (dalMetrics && carMetrics) {
      console.log(`Offensive EPA:`);
      console.log(`  DAL: ${dalMetrics.off_epa?.toFixed(3) || 'N/A'}`);
      console.log(`  CAR: ${carMetrics.off_epa?.toFixed(3) || 'N/A'}`);
      console.log(`  Advantage: ${dalMetrics.off_epa > carMetrics.off_epa ? 'DAL' : 'CAR'} by ${Math.abs(dalMetrics.off_epa - carMetrics.off_epa).toFixed(3)}`);
      
      console.log(`\nDefensive EPA:`);
      console.log(`  DAL: ${dalMetrics.def_epa?.toFixed(3) || 'N/A'}`);
      console.log(`  CAR: ${carMetrics.def_epa?.toFixed(3) || 'N/A'}`);
      console.log(`  Advantage: ${dalMetrics.def_epa < carMetrics.def_epa ? 'DAL' : 'CAR'} by ${Math.abs(dalMetrics.def_epa - carMetrics.def_epa).toFixed(3)}`);
      
      console.log(`\nSuccess Rate:`);
      console.log(`  DAL: ${(dalMetrics.success_rate * 100).toFixed(1)}%`);
      console.log(`  CAR: ${(carMetrics.success_rate * 100).toFixed(1)}%`);
      
      console.log(`\nExplosive Play Rate:`);
      console.log(`  DAL: ${(dalMetrics.explosive_rate * 100).toFixed(1)}%`);
      console.log(`  CAR: ${(carMetrics.explosive_rate * 100).toFixed(1)}%`);
      
      console.log(`\nRed Zone Efficiency:`);
      console.log(`  DAL: ${(dalMetrics.rz_score_pct * 100).toFixed(1)}%`);
      console.log(`  CAR: ${(carMetrics.rz_score_pct * 100).toFixed(1)}%`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
}

analyzeDalCar();
