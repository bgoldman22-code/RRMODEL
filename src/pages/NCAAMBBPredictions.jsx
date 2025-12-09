import React, { useState, useEffect } from 'react';

const NCAAMBBPredictions = () => {
  const [predictions, setPredictions] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    loadPredictions();
  }, []);

  const loadPredictions = async () => {
    try {
      setLoading(true);
      const timestamp = Date.now();
      const response = await fetch(`/.netlify/functions/ncaa-mbb-predictions-github?_t=${timestamp}`);
      const data = await response.json();

      if (!data.ok || !data.predictions || data.predictions.length === 0) {
        setError(data.message || 'No games available today');
        return;
      }

      setPredictions(data.predictions);
      setMetadata(data.metadata);
      setLastUpdated(data.generated);
      setError(null);
    } catch (err) {
      setError(`Error loading predictions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading NCAA MBB predictions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
        <button 
          onClick={loadPredictions}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const formatOdds = (odds) => {
    return odds > 0 ? `+${odds}` : odds;
  };

  const getConfidenceBadge = (edge) => {
    const edgePercent = edge * 100;
    if (edgePercent >= 20) return { label: 'ELITE', color: 'bg-purple-600' };
    if (edgePercent >= 15) return { label: 'HIGH', color: 'bg-green-600' };
    if (edgePercent >= 10) return { label: 'MEDIUM', color: 'bg-yellow-600' };
    return { label: 'LOW', color: 'bg-gray-600' };
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">🏀 NCAA Men's Basketball Predictions</h1>
        <p className="text-gray-600">Moneyline picks powered by Variant B Model</p>
        {lastUpdated && (
          <p className="text-sm text-gray-500 mt-1">
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </p>
        )}
      </div>

      {/* Metadata Summary */}
      {metadata && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium">Total Picks</div>
            <div className="text-2xl font-bold text-blue-900">{metadata.totalPicks}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-sm text-green-600 font-medium">Total Stake</div>
            <div className="text-2xl font-bold text-green-900">${metadata.totalStake?.toFixed(0)}</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="text-sm text-purple-600 font-medium">Avg Edge</div>
            <div className="text-2xl font-bold text-purple-900">{(metadata.avgEdge * 100).toFixed(1)}%</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="text-sm text-orange-600 font-medium">Max Edge</div>
            <div className="text-2xl font-bold text-orange-900">{(metadata.maxEdge * 100).toFixed(1)}%</div>
          </div>
        </div>
      )}

      {/* Picks Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Game
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pick
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Odds
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Model Win %
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Edge
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stake
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {predictions.map((pred, idx) => {
                const badge = getConfidenceBadge(pred.betting.edge);
                const isHomePick = pred.prediction.side === 'home';
                
                return (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {pred.awayTeam} @ {pred.homeTeam}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-3 py-1 text-sm font-bold rounded-full ${
                        isHomePick ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {pred.prediction.pick}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm font-semibold text-gray-900">
                        {formatOdds(pred.vegasLines.moneyline.favorite)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm font-semibold text-gray-900">
                        {pred.prediction.winProbability.favoritePercent.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">
                        vs {pred.prediction.winProbability.underdogPercent.toFixed(1)}%
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm font-bold text-green-600">
                        +{(pred.betting.edge * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-bold text-white rounded ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm font-bold text-gray-900">
                        ${pred.betting.recommendedStake.toFixed(0)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Model Info */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Model Information</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• <strong>Model:</strong> NCAA Variant B (KenPom-style efficiency model)</li>
          <li>• <strong>Bet Type:</strong> Moneyline only</li>
          <li>• <strong>Min Edge:</strong> 15% (only bets with 15%+ edge shown)</li>
          <li>• <strong>Kelly Fraction:</strong> 25% (conservative sizing)</li>
          <li>• <strong>Bankroll:</strong> $10,000 (for stake calculations)</li>
          <li>• <strong>Data Sources:</strong> Live odds from TheOddsAPI, efficiency ratings from KenPom</li>
        </ul>
      </div>

      {/* Refresh Button */}
      <div className="mt-6 text-center">
        <button
          onClick={loadPredictions}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading...' : 'Refresh Predictions'}
        </button>
      </div>
    </div>
  );
};

export default NCAAMBBPredictions;
