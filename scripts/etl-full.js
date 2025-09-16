// Temporary simple etl-full.js for testing
import { writeToBlobStorage } from './lib/blob_io.js';

async function generateAdvancedMetrics(season = 2024) {
  console.log(`Generating test metrics for ${season} season...`);
  
  const output = {
    version: "adv_v1",
    asOf: new Date().toISOString(),
    league: { means: { third_down_off: 0.5 }, stds: { third_down_off: 0.1 } },
    teams: {
      BUF: { 
        core: { off_epa: 0.1, def_epa: -0.05 },
        situational: { third_down_off: 0.45, rz_td_off: 0.6 }
      }
    }
  };
  
  await writeToBlobStorage('nfl/epa/latest.json', output);
  console.log('Test metrics generated successfully');
  return output;
}

export { generateAdvancedMetrics };

if (import.meta.url === `file://${process.argv[1]}`) {
  generateAdvancedMetrics(2024).catch(console.error);
}
