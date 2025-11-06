import React, { useState, useEffect } from 'react';

/**
 * Fantasy Sit/Start Component
 * 
 * Displays sit/start recommendations from Yahoo Fantasy + TheOddsAPI.
 * 
 * Flow:
 * 1. User clicks "Authenticate with Yahoo" → Redirected to OAuth
 * 2. After auth, user clicks "Get Recommendations" → Calls /ff-run
 * 3. Display starters, bench, tiers, reasons, FLEX swaps
 */

export default function FantasySitStart() {
  const [loading, setLoading] = useState(false);
  const [roastLoading, setRoastLoading] = useState(false);
  const [data, setData] = useState(null);
  const [roastData, setRoastData] = useState(null);
  const [error, setError] = useState(null);
  const [roastError, setRoastError] = useState(null);
  const [season, setSeason] = useState(''); // Empty = auto-detect current season
  const [week, setWeek] = useState('');
  const [apiKey, setApiKey] = useState('');

  // Generate season options (2001 to current year)
  const currentYear = new Date().getFullYear();
  const seasonOptions = [];
  for (let year = currentYear; year >= 2001; year--) {
    seasonOptions.push(year);
  }

  // Check if user is authenticated on load
  useEffect(() => {
    // Could add a /ff-check-auth endpoint to verify tokens exist
  }, []);

  const handleAuth = () => {
    // Redirect to OAuth start endpoint
    window.location.href = '/.netlify/functions/ff-auth-start';
  };

  const handleFetchRecommendations = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const params = new URLSearchParams();
      if (season) params.append('season', season);
      if (week) params.append('week', week);
      params.append('format', 'json');
      params.append('explain', 'all');

      const headers = {};
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }

      const response = await fetch(`/.netlify/functions/ff-run?${params.toString()}`, {
        headers
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch recommendations');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getTierColor = (tier) => {
    switch (tier) {
      case 'S': return 'bg-green-500 text-white';
      case 'A': return 'bg-cyan-500 text-white';
      case 'B': return 'bg-gray-200 text-gray-900';
      case 'C': return 'bg-yellow-500 text-gray-900';
      case 'D': return 'bg-red-500 text-white';
      default: return 'bg-gray-400 text-white';
    }
  };

  const getTierLabel = (tier) => {
    switch (tier) {
      case 'S': return 'Elite';
      case 'A': return 'Good';
      case 'B': return 'Solid';
      case 'C': return 'Risky';
      case 'D': return 'Sit';
      default: return tier;
    }
  };

  const renderPlayer = (player) => (
    <div key={player.name} className="border rounded-lg p-4 mb-3 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="font-bold text-lg">{player.name}</h3>
          <div className="text-sm text-gray-600">
            {player.position} • {player.team} vs {player.opponent}
            {player.status && <span className="ml-2 text-red-600">({player.status})</span>}
            {player.bye_week && <span className="ml-2 text-red-600">(BYE WEEK {player.bye_week})</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full font-bold ${getTierColor(player.tier)}`}>
            {player.tier}
          </span>
          <span className="text-sm text-gray-500">{getTierLabel(player.tier)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-2">
        <div>
          <span className="text-sm text-gray-600">Expected Points:</span>
          <span className="ml-2 font-semibold text-lg">{player.efp}</span>
        </div>
        <div>
          <span className="text-sm text-gray-600">Sit/Start Score:</span>
          <span className="ml-2 font-semibold text-lg">{player.score}</span>
        </div>
      </div>

      {player.reasons && player.reasons.length > 0 && (
        <div className="mt-3 space-y-1">
          {player.reasons.map((reason, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm">
              <span className="text-blue-600">•</span>
              <span className="text-gray-700">{reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Fantasy Football Sit/Start Tool</h1>
      <p className="text-gray-600 mb-6">
        Get AI-powered sit/start recommendations using Vegas lines, player props, and your league's scoring settings.
      </p>

      {/* Controls */}
      <div className="bg-white border rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Setup</h2>
        
        <div className="space-y-4">
          {/* Step 1: Authenticate */}
          <div>
            <h3 className="font-medium mb-2">Step 1: Link Yahoo Fantasy Account</h3>
            <button
              onClick={handleAuth}
              className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 transition-colors"
            >
              Authenticate with Yahoo
            </button>
            <p className="text-xs text-gray-500 mt-1">
              You'll be redirected to Yahoo to approve access. This is required only once.
            </p>
          </div>

          {/* Step 2: Configure */}
          <div className="border-t pt-4">
            <h3 className="font-medium mb-2">Step 2: Configure (Optional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  NFL Season
                </label>
                <select
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 bg-white"
                >
                  <option value="">Auto-detect current season</option>
                  {seasonOptions.map(year => (
                    <option key={year} value={year}>{year} Season</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Default: {currentYear} (current season)
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  NFL Week (leave blank for current)
                </label>
                <input
                  type="number"
                  min="1"
                  max="18"
                  value={week}
                  onChange={(e) => setWeek(e.target.value)}
                  placeholder="Auto-detect current week"
                  className="w-full border rounded-md px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Detects the current week for selected season
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  API Key (if required)
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Leave blank if not needed"
                  className="w-full border rounded-md px-3 py-2"
                />
              </div>
            </div>
          </div>

          {/* Step 3: Generate */}
          <div className="border-t pt-4">
            <h3 className="font-medium mb-2">Step 3: Get Recommendations</h3>
            <button
              onClick={handleFetchRecommendations}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Get Sit/Start Recommendations'}
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800 mb-1">Error</h3>
          <p className="text-red-700">{error}</p>
          {error.includes('Authentication required') && (
            <p className="text-sm text-red-600 mt-2">
              Please click "Authenticate with Yahoo" above to link your account.
            </p>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Fetching your recommendations...</p>
          </div>
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="space-y-6">
          {/* Meta Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h2 className="font-semibold text-blue-900 mb-2">League Info</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-blue-600">League:</span>
                <span className="ml-2 font-medium">{data.meta.league_name}</span>
              </div>
              <div>
                <span className="text-blue-600">Week:</span>
                <span className="ml-2 font-medium">{data.meta.week}</span>
              </div>
              <div>
                <span className="text-blue-600">Scoring:</span>
                <span className="ml-2 font-medium">{data.meta.scoring}</span>
              </div>
              <div>
                <span className="text-blue-600">Generated:</span>
                <span className="ml-2 font-medium">
                  {new Date(data.meta.generated_at).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>

          {/* Warnings/Notes */}
          {data.notes && data.notes.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-900 mb-2">⚠️ Notes</h3>
              <ul className="space-y-1">
                {data.notes.map((note, idx) => (
                  <li key={idx} className="text-sm text-yellow-800">• {note}</li>
                ))}
              </ul>
            </div>
          )}

          {/* FLEX Swap Suggestions */}
          {data.flex_options && data.flex_options.length > 0 && (
            <div className="bg-green-50 border border-green-300 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-3">💡 FLEX Swap Suggestions</h3>
              <div className="space-y-2">
                {data.flex_options.map((swap, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-sm">
                    <span className="text-red-600 font-medium">OUT: {swap.out}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-green-600 font-medium">IN: {swap.in}</span>
                    <span className="ml-auto bg-green-100 text-green-800 px-2 py-1 rounded">
                      +{swap.improvement} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Starters */}
          <div>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-green-600">✓</span>
              Starting Lineup ({data.starters.length})
            </h2>
            <div className="space-y-3">
              {data.starters.map(renderPlayer)}
            </div>
          </div>

          {/* Bench */}
          <div>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-gray-400">○</span>
              Bench ({data.bench.length})
            </h2>
            <div className="space-y-3">
              {data.bench.map(renderPlayer)}
            </div>
          </div>

          {/* Export Options */}
          <div className="border-t pt-6">
            <h3 className="font-semibold mb-3">Export Data</h3>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const json = JSON.stringify(data, null, 2);
                  const blob = new Blob([json], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `sitstart-week${data.meta.week}.json`;
                  a.click();
                }}
                className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors text-sm"
              >
                Download JSON
              </button>
              <a
                href={`/.netlify/functions/ff-run?week=${data.meta.week}&format=csv${apiKey ? `&x-api-key=${apiKey}` : ''}`}
                download
                className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors text-sm inline-block"
              >
                Download CSV
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Info Section */}
      {!data && !loading && !error && (
        <div className="bg-gray-50 border rounded-lg p-6 mt-6">
          <h3 className="font-semibold mb-3">How It Works</h3>
          <ol className="space-y-2 text-sm text-gray-700">
            <li>
              <strong>1. Expected Fantasy Points (EFP):</strong> Uses Vegas player props (passing yards, rushing yards, receiving yards, TDs) converted to your league's scoring system
            </li>
            <li>
              <strong>2. Game Context:</strong> Factors in implied totals, game script (pass-heavy underdogs, run-heavy favorites), and injury status
            </li>
            <li>
              <strong>3. Ceiling Bonus:</strong> Adds extra value for players with high 2+ TD probability (especially RBs and TEs)
            </li>
            <li>
              <strong>4. Sit/Start Score:</strong> Combines EFP with z-scores (relative to position) and context modifiers
            </li>
            <li>
              <strong>5. Tiers:</strong> S = Elite, A = Good, B = Solid, C = Risky, D = Sit
            </li>
            <li>
              <strong>6. FLEX Optimization:</strong> Suggests bench players who score significantly higher than current FLEX starters
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
