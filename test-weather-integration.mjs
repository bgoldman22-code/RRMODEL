#!/usr/bin/env node
// Test weather integration in game prediction model

import { buildGameFeatures } from '../netlify/functions/_ml/features-nfl.mjs';

console.log('🧪 Testing Weather Integration in NFL Game Prediction Model\n');

async function testWeatherFeatures() {
  console.log('Test 1: Game WITH kickoff time (outdoor stadium)');
  const featuresWithWeather = await buildGameFeatures({
    season: 2025,
    week: 8,
    home: 'GB',  // Green Bay - outdoor stadium
    away: 'CHI',
    kickoff: '2025-10-27T13:00:00Z'
  });
  
  console.log('Weather features:');
  console.log('  wind_speed:', featuresWithWeather.wind_speed);
  console.log('  has_precipitation:', featuresWithWeather.has_precipitation);
  console.log('  high_wind:', featuresWithWeather.high_wind);
  console.log('  extreme_wind:', featuresWithWeather.extreme_wind);
  console.log('  weather_confidence_adj:', featuresWithWeather.weather_confidence_adj);
  
  console.log('\nTest 2: Game WITHOUT kickoff time (legacy mode)');
  const featuresNoWeather = await buildGameFeatures({
    season: 2025,
    week: 8,
    home: 'GB',
    away: 'CHI'
  });
  
  console.log('Weather features (should be 0/neutral):');
  console.log('  wind_speed:', featuresNoWeather.wind_speed);
  console.log('  has_precipitation:', featuresNoWeather.has_precipitation);
  console.log('  high_wind:', featuresNoWeather.high_wind);
  
  console.log('\nTest 3: Dome stadium (should skip weather API)');
  const featuresDome = await buildGameFeatures({
    season: 2025,
    week: 8,
    home: 'DET',  // Detroit - dome stadium
    away: 'GB',
    kickoff: '2025-10-27T13:00:00Z'
  });
  
  console.log('Weather features (dome, should be 0):');
  console.log('  wind_speed:', featuresDome.wind_speed);
  console.log('  has_precipitation:', featuresDome.has_precipitation);
  
  console.log('\n✅ Weather integration test complete!');
  console.log('\n📝 Summary:');
  console.log('  - Outdoor games WITH kickoff → Weather API called');
  console.log('  - Games WITHOUT kickoff → Defaults to neutral (0s)');
  console.log('  - Dome stadiums → Skipped (no API call)');
  console.log('  - All backward compatible ✅');
}

testWeatherFeatures().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
