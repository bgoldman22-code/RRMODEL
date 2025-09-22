/**
 * NFL TD Predictions Enhanced API Integration
 * React hooks and utilities for consuming R pipeline predictions
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

// API configuration
const API_CONFIG = {
  BASE_URL: '/api/nfl-td-predictions-enhanced',
  DEFAULT_CACHE_TIME: 5 * 60 * 1000, // 5 minutes
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
};

/**
 * Enhanced NFL TD Predictions Hook
 * Provides comprehensive prediction data with caching and error handling
 */
export function useNFLTDPredictionsEnhanced(options = {}) {
  const {
    type = 'lite',
    position = null,
    team = null,
    player_id = null,
    game_id = null,
    top_n = 50,
    min_confidence = 'medium',
    min_value_score = 0.5,
    auto_refresh = true,
    refresh_interval = 5 * 60 * 1000, // 5 minutes
  } = options;

  // State management
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Build query parameters
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    
    params.append('type', type);
    if (position) params.append('position', position);
    if (team) params.append('team', team);
    if (player_id) params.append('player_id', player_id);
    if (game_id) params.append('game_id', game_id);
    if (top_n !== 50) params.append('top_n', top_n.toString());
    if (min_confidence !== 'medium') params.append('min_confidence', min_confidence);
    if (min_value_score !== 0.5) params.append('min_value_score', min_value_score.toString());
    
    return params.toString();
  }, [type, position, team, player_id, game_id, top_n, min_confidence, min_value_score]);

  // Fetch function with retry logic
  const fetchPredictions = useCallback(async (isRetry = false) => {
    if (!isRetry) {
      setLoading(true);
      setError(null);
    }

    try {
      const url = `${API_CONFIG.BASE_URL}?${queryParams}`;
      console.log(`📊 Fetching enhanced predictions: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Validate response structure
      if (!result.predictions) {
        throw new Error('Invalid response format: missing predictions');
      }

      setData(result);
      setLastFetch(Date.now());
      setRetryCount(0);
      setError(null);
      
      console.log(`✅ Loaded ${result.predictions.length} predictions from enhanced pipeline`);
      
    } catch (err) {
      console.error('❌ Enhanced predictions fetch error:', err);
      
      if (retryCount < API_CONFIG.RETRY_ATTEMPTS) {
        console.log(`🔄 Retrying enhanced predictions fetch (${retryCount + 1}/${API_CONFIG.RETRY_ATTEMPTS})`);
        setRetryCount(prev => prev + 1);
        
        setTimeout(() => {
          fetchPredictions(true);
        }, API_CONFIG.RETRY_DELAY * (retryCount + 1));
      } else {
        setError(err.message);
        setRetryCount(0);
      }
    } finally {
      if (!isRetry) {
        setLoading(false);
      }
    }
  }, [queryParams, retryCount]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchPredictions();

    if (auto_refresh && refresh_interval > 0) {
      const interval = setInterval(fetchPredictions, refresh_interval);
      return () => clearInterval(interval);
    }
  }, [fetchPredictions, auto_refresh, refresh_interval]);

  // Manual refresh function
  const refresh = useCallback(() => {
    setRetryCount(0);
    fetchPredictions();
  }, [fetchPredictions]);

  // Data processing helpers
  const processedData = useMemo(() => {
    if (!data?.predictions) return null;

    return {
      ...data,
      // Add convenience accessors
      players: data.predictions,
      playerCount: data.predictions.length,
      
      // Position groups
      byPosition: {
        QB: data.predictions.filter(p => p.position === 'QB'),
        RB: data.predictions.filter(p => p.position === 'RB'),
        WR: data.predictions.filter(p => p.position === 'WR'),
        TE: data.predictions.filter(p => p.position === 'TE'),
      },
      
      // Top candidates by market
      topAnytime: [...data.predictions]
        .sort((a, b) => b.anytime_td_prob - a.anytime_td_prob)
        .slice(0, 10),
      
      topMultiple: [...data.predictions]
        .sort((a, b) => b.multiple_td_prob - a.multiple_td_prob)
        .slice(0, 10),
        
      topFirst: [...data.predictions]
        .sort((a, b) => b.first_td_prob - a.first_td_prob)
        .slice(0, 10),
      
      // Value opportunities
      valueAnytime: [...data.predictions]
        .filter(p => p.anytime_value_score >= 0.6)
        .sort((a, b) => b.anytime_value_score - a.anytime_value_score)
        .slice(0, 10),
        
      valueMultiple: [...data.predictions]
        .filter(p => p.multiple_value_score >= 0.6)
        .sort((a, b) => b.multiple_value_score - a.multiple_value_score)
        .slice(0, 10),
        
      valueFirst: [...data.predictions]
        .filter(p => p.first_value_score >= 0.6)
        .sort((a, b) => b.first_value_score - a.first_value_score)
        .slice(0, 10),
      
      // High confidence picks
      highConfidence: data.predictions.filter(p => 
        p.anytime_confidence === 'high' || 
        p.multiple_confidence === 'high' || 
        p.first_confidence === 'high'
      ),
    };
  }, [data]);

  // Metadata helpers
  const metadata = useMemo(() => {
    if (!data?.metadata) return null;
    
    const generatedAt = new Date(data.metadata.generated_at);
    const now = new Date();
    const ageMinutes = Math.floor((now - generatedAt) / (1000 * 60));
    
    return {
      ...data.metadata,
      dataAge: {
        minutes: ageMinutes,
        hours: Math.floor(ageMinutes / 60),
        isStale: ageMinutes > 30,
        isFresh: ageMinutes < 10,
      },
      pipeline: {
        version: data.metadata.version,
        provider: data.metadata.provider,
        modelType: data.metadata.model_type,
      }
    };
  }, [data]);

  return {
    // Core data
    data: processedData,
    metadata,
    
    // State
    loading,
    error,
    lastFetch,
    
    // Actions
    refresh,
    
    // Helpers
    isStale: metadata?.dataAge.isStale || false,
    isFresh: metadata?.dataAge.isFresh || false,
    hasData: !!processedData,
    isEmpty: processedData?.playerCount === 0,
  };
}

/**
 * Specific hook for top anytime TD candidates
 */
export function useTopAnytimeTD(options = {}) {
  return useNFLTDPredictionsEnhanced({
    ...options,
    type: 'top-anytime',
    top_n: options.top_n || 25,
  });
}

/**
 * Specific hook for multiple TD candidates
 */
export function useTopMultipleTD(options = {}) {
  return useNFLTDPredictionsEnhanced({
    ...options,
    type: 'top-multiple',
    top_n: options.top_n || 25,
  });
}

/**
 * Specific hook for first TD scorer candidates
 */
export function useTopFirstTD(options = {}) {
  return useNFLTDPredictionsEnhanced({
    ...options,
    type: 'top-first',
    top_n: options.top_n || 25,
  });
}

/**
 * Specific hook for value opportunities
 */
export function useValueOpportunities(options = {}) {
  return useNFLTDPredictionsEnhanced({
    ...options,
    type: 'value-picks',
    min_value_score: options.min_value_score || 0.6,
    top_n: options.top_n || 30,
  });
}

/**
 * Hook for position-specific predictions
 */
export function usePositionPredictions(position, options = {}) {
  return useNFLTDPredictionsEnhanced({
    ...options,
    type: 'by-position',
    position: position,
  });
}

/**
 * Utility functions for formatting and display
 */
export const PredictionUtils = {
  // Format probability as percentage
  formatProbability: (prob) => `${Math.round(prob * 100)}%`,
  
  // Format American odds
  formatOdds: (odds) => {
    if (odds > 0) return `+${odds}`;
    return odds.toString();
  },
  
  // Format confidence with color
  formatConfidence: (confidence) => {
    const colors = {
      high: { text: 'High', color: 'green', bgColor: '#e6f4ea' },
      medium: { text: 'Medium', color: 'orange', bgColor: '#fef7e0' },
      low: { text: 'Low', color: 'gray', bgColor: '#f8f9fa' },
      neutral: { text: 'Neutral', color: 'gray', bgColor: '#f8f9fa' },
    };
    return colors[confidence] || colors.neutral;
  },
  
  // Format value score
  formatValueScore: (score) => {
    if (score >= 0.8) return { text: 'Excellent', color: 'green' };
    if (score >= 0.6) return { text: 'Good', color: 'blue' };
    if (score >= 0.4) return { text: 'Fair', color: 'orange' };
    return { text: 'Poor', color: 'red' };
  },
  
  // Get position color
  getPositionColor: (position) => {
    const colors = {
      QB: '#6366f1', // Indigo
      RB: '#10b981', // Emerald  
      WR: '#f59e0b', // Amber
      TE: '#8b5cf6', // Purple
    };
    return colors[position] || '#6b7280';
  },
  
  // Calculate implied probability from American odds
  impliedProbability: (americanOdds) => {
    if (americanOdds > 0) {
      return 100 / (americanOdds + 100);
    } else {
      return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    }
  },
  
  // Check if prediction represents value
  hasValue: (prediction, market = 'anytime') => {
    const valueKey = `${market}_value_score`;
    return prediction[valueKey] >= 0.6;
  },
  
  // Get best market for a player
  getBestMarket: (prediction) => {
    const markets = [
      { name: 'anytime', prob: prediction.anytime_td_prob, value: prediction.anytime_value_score },
      { name: 'multiple', prob: prediction.multiple_td_prob, value: prediction.multiple_value_score },
      { name: 'first', prob: prediction.first_td_prob, value: prediction.first_value_score },
    ];
    
    return markets.reduce((best, current) => 
      current.value > best.value ? current : best
    );
  }
};

/**
 * Enhanced Prediction Card Component
 * Ready-to-use component for displaying predictions
 */
export function EnhancedPredictionCard({ prediction, market = 'anytime', showValue = true, className = '' }) {
  const probKey = `${market}_td_prob`;
  const confidenceKey = `${market}_confidence`;
  const valueKey = `${market}_value_score`;
  const oddsKey = `${market}_odds_american`;
  
  const probability = prediction[probKey];
  const confidence = PredictionUtils.formatConfidence(prediction[confidenceKey]);
  const valueScore = PredictionUtils.formatValueScore(prediction[valueKey]);
  const odds = PredictionUtils.formatOdds(prediction[oddsKey]);
  const hasValue = PredictionUtils.hasValue(prediction, market);
  
  return (
    <div className={`prediction-card enhanced ${className}`}>
      <div className="player-info">
        <div className="player-name">{prediction.player_name}</div>
        <div className="player-details">
          <span className="position" style={{ color: PredictionUtils.getPositionColor(prediction.position) }}>
            {prediction.position}
          </span>
          <span className="team">{prediction.team}</span>
        </div>
      </div>
      
      <div className="prediction-details">
        <div className="probability">
          {PredictionUtils.formatProbability(probability)}
        </div>
        
        <div className="confidence" style={{ color: confidence.color, backgroundColor: confidence.bgColor }}>
          {confidence.text}
        </div>
        
        {showValue && (
          <div className="value-indicator">
            <span className="value-score" style={{ color: valueScore.color }}>
              {valueScore.text}
            </span>
            {hasValue && <span className="value-badge">VALUE</span>}
          </div>
        )}
        
        <div className="odds">{odds}</div>
      </div>
      
      <div className="supporting-metrics">
        <div className="metric">
          <span className="label">Usage:</span>
          <span className="value">{PredictionUtils.formatProbability(prediction.usage_share)}</span>
        </div>
        <div className="metric">
          <span className="label">Recent TD Rate:</span>
          <span className="value">{PredictionUtils.formatProbability(prediction.recent_td_rate)}</span>
        </div>
        <div className="metric">
          <span className="label">Explosiveness:</span>
          <span className="value">{PredictionUtils.formatProbability(prediction.explosiveness)}</span>
        </div>
      </div>
    </div>
  );
}

export default useNFLTDPredictionsEnhanced;