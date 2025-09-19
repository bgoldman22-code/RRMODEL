// src/hooks/useNFLData.js
// Custom hook for loading NFL data with fallbacks

import { useState, useEffect } from 'react';

export function useNFLData(week = 4, season = 2025) {
  const [data, setData] = useState({
    players: [],
    schedule: [],
    predictions: [],
    odds: {},
    loading: true,
    error: null
  });

  useEffect(() => {
    async function loadAllData() {
      try {
        setData(prev => ({ ...prev, loading: true, error: null }));

        // Load player data (multiple fallback paths)
        const playerData = await loadWithFallback([
          '/nfl-anytime-td-player-data.json',
          '/data/nfl-anytime-td-player-data.json',
          '/.netlify/functions/nfl-td-comprehensive-predictions/data'
        ]);

        // Load schedule data
        const scheduleData = await loadWithFallback([
          `/data/nfl-schedule-${season}.json`,
          `/.netlify/functions/nfl-bootstrap?season=${season}&week=${week}`,
          '/data/nfl-schedule-2025.json'
        ]);

        // Load live predictions
        const predictionsData = await loadWithFallback([
          '/data/nfl-td-comprehensive-latest.json',
          `/.netlify/functions/nfl-td-comprehensive-predictions?week=${week}`,
          '/data/nfl-predictions-fallback.json'
        ]);

        // Load live odds
        const oddsData = await loadWithFallback([
          '/data/nfl-player-prop-odds-latest.json',
          '/.netlify/functions/nfl-odds-get',
          '/data/odds-fallback.json'
        ]);

        setData({
          players: playerData?.players || [],
          schedule: scheduleData?.weeks?.[week]?.matchups || scheduleData?.games || [],
          predictions: predictionsData?.predictions || [],
          odds: oddsData?.odds || {},
          metadata: {
            player_count: Object.keys(playerData?.players || {}).length,
            games_count: (scheduleData?.weeks?.[week]?.matchups || []).length,
            predictions_count: (predictionsData?.predictions || []).length,
            odds_count: Object.keys(oddsData?.odds || {}).length,
            last_updated: predictionsData?.metadata?.generated_at
          },
          loading: false,
          error: null
        });

      } catch (error) {
        console.error('NFL data loading failed:', error);
        setData(prev => ({ 
          ...prev, 
          loading: false, 
          error: error.message 
        }));
      }
    }

    loadAllData();
  }, [week, season]);

  return data;
}

// Helper function to try multiple data sources
async function loadWithFallback(urls) {
  for (const url of urls) {
    try {
      console.log(`🔍 Trying to load data from: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`✅ Successfully loaded from: ${url}`);
      return data;
      
    } catch (error) {
      console.warn(`❌ Failed to load from ${url}:`, error.message);
      continue;
    }
  }
  
  throw new Error(`All data sources failed: ${urls.join(', ')}`);
}

// Hook for just TD predictions (optimized)
export function useTDPredictions(week = 4, season = 2025) {
  const [predictions, setPredictions] = useState({
    data: [],
    loading: true,
    error: null,
    metadata: null
  });

  useEffect(() => {
    async function loadPredictions() {
      try {
        setPredictions(prev => ({ ...prev, loading: true }));

        // Try committed JSON first, then live function
        const data = await loadWithFallback([
          '/data/nfl-td-comprehensive-latest.json',
          `/.netlify/functions/nfl-td-comprehensive-predictions?week=${week}&season=${season}`
        ]);

        setPredictions({
          data: data.predictions || [],
          loading: false,
          error: null,
          metadata: data.metadata || null
        });

      } catch (error) {
        setPredictions(prev => ({
          ...prev,
          loading: false,
          error: error.message
        }));
      }
    }

    loadPredictions();
  }, [week, season]);

  return predictions;
}