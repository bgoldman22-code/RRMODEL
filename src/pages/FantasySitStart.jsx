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
  const [tone, setTone] = useState('default'); // Roast character/tone

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

  const handleFetchRoast = async () => {
    setRoastLoading(true);
    setRoastError(null);
    setRoastData(null);

    try {
      const params = new URLSearchParams();
      if (season) params.append('season', season);
      if (week) params.append('week', week);
      if (tone) params.append('tone', tone); // Add tone parameter

      const headers = {};
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }

      const response = await fetch(`/.netlify/functions/ff-weekly-roast?${params.toString()}`, {
        headers
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate weekly roast');
      }

      const result = await response.json();
      setRoastData(result);
    } catch (err) {
      setRoastError(err.message);
    } finally {
      setRoastLoading(false);
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
            <h3 className="font-medium mb-2">Step 3: Get Recommendations or League Summary</h3>
            
            {/* Tone selector for roast */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Roast Style / Character:
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="px-3 py-2 border rounded-md w-full max-w-md"
              >
                <option value="default">Default (Savage NFL Analyst)</option>
                <option value="ramsay">🔥 Gordon Ramsay (Kitchen Nightmares)</option>
                <option value="cartman">😈 Eric Cartman (South Park)</option>
                <option value="chappelle">🎤 Dave Chappelle (Stand-up)</option>
                <option value="burr">🎙️ Bill Burr (Boston Rant)</option>
                <option value="madden">🏈 John Madden (Boom! Turducken!)</option>
                <option value="soprano">🤌 Tony Soprano (Mob Boss)</option>
                <option value="trump">🇺🇸 Donald Trump (Rally Speech)</option>
                <option value="theoffice">📹 The Office (Talking Heads)</option>
                <option value="creed">🎸 Creed Bratton (The Office - Unhinged)</option>
                <option value="rickandmorty">🧪 Rick Sanchez (Nihilistic Genius)</option>
                <option value="timrobinson">🤯 Tim Robinson (I Think You Should Leave)</option>
                <option value="larrydavid">😤 Larry David (Curb Your Enthusiasm)</option>
                <option value="mulaney">🎭 John Mulaney (Stand-up Comedy)</option>
                <option value="shakespeare">🎪 Shakespeare (Elizabethan Drama)</option>
                <option value="ronswanson">🥩 Ron Swanson (Parks & Rec - Libertarian)</option>
                <option value="stefon">🎉 Stefon (SNL - This League Has EVERYTHING)</option>
                <option value="philosopher">🥃 Drunk Philosopher (Existential)</option>
                <option value="herzog">🎬 Werner Herzog (Pessimistic Documentary)</option>
                <option value="noiretective">🕵️ Film Noir Detective (1940s)</option>
                <option value="bane">😷 Bane (The Dark Knight)</option>
                <option value="fieri">🔥 Guy Fieri (Welcome to Flavortown!)</option>
                <option value="taylorswift">💔 Taylor Swift (Betrayal Songs)</option>
                <option value="hungergames">🏹 Hunger Games Announcer (Caesar)</option>
                <option value="zoolander">💁 Derek Zoolander (Really Really Ridiculously)</option>
                <option value="sparrow">🏴‍☠️ Captain Jack Sparrow (Pirates)</option>
                <option value="motivational">✨ Toxic Positivity Coach (Aggressive Enthusiasm)</option>
                <option value="valleygirl">💅 Valley Girl (Like, Literally the Worst)</option>
                <option value="viking">⚔️ Viking Warrior (Honor and Glory)</option>
                <option value="tarot">🔮 Sarcastic Tarot Reader (Dark Predictions)</option>
                <option value="yoda">🟢 Yoda (Backwards Wisdom)</option>
                <option value="gandalf">🧙 Gandalf (Middle-earth Wizard)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Choose who delivers your league roast. They'll stay fully in character.
              </p>
            </div>
            
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleFetchRecommendations}
                disabled={loading}
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : 'Get Sit/Start Recommendations'}
              </button>
              <button
                onClick={handleFetchRoast}
                disabled={roastLoading}
                className="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {roastLoading ? 'Generating Roast...' : '🔥 Generate Weekly League Summary'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Sit/Start: Your personal recommendations • League Summary: Roasts for the entire league
            </p>
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

          {/* Summary: Actual vs Optimal */}
          {data.summary && (
            <div className="bg-gradient-to-r from-blue-50 to-green-50 border-2 border-blue-300 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-4">📊 Lineup Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-white rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Your Current Lineup</div>
                  <div className="text-3xl font-bold text-blue-600">{data.summary.actual_projected}</div>
                  <div className="text-xs text-gray-500">Projected Points</div>
                </div>
                <div className="text-center p-4 bg-white rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Optimal Lineup</div>
                  <div className="text-3xl font-bold text-green-600">{data.summary.optimal_projected}</div>
                  <div className="text-xs text-gray-500">Projected Points</div>
                </div>
                <div className="text-center p-4 bg-white rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Potential Gain</div>
                  <div className={`text-3xl font-bold ${parseFloat(data.summary.potential_improvement) > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                    {parseFloat(data.summary.potential_improvement) > 0 ? '+' : ''}{data.summary.potential_improvement}
                  </div>
                  <div className="text-xs text-gray-500">Points if optimized</div>
                </div>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations && data.recommendations.length > 0 && (
            <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
              <h3 className="font-semibold text-orange-900 mb-3">⚠️ Lineup Recommendations</h3>
              <div className="space-y-2">
                {data.recommendations.map((rec, idx) => (
                  <div key={idx} className="bg-white p-3 rounded border border-orange-200">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded font-medium">
                        {rec.action}
                      </span>
                      <span className="font-semibold text-green-700">{rec.player}</span>
                      <span className="text-gray-500">instead of</span>
                      <span className="font-semibold text-red-700">{rec.instead_of}</span>
                      <span className="ml-auto bg-green-100 text-green-800 px-2 py-1 rounded font-bold">
                        {rec.improvement}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1 ml-2">{rec.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* YOUR ACTUAL LINEUP */}
          <div className="bg-white border-2 border-blue-400 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-blue-600">👤</span>
              Your Current Lineup
            </h2>
            
            <h3 className="font-semibold text-lg mb-3">Starters ({data.actual_lineup.starters.length})</h3>
            <div className="space-y-3 mb-6">
              {data.actual_lineup.starters.map(renderPlayer)}
            </div>

            <h3 className="font-semibold text-lg mb-3 border-t pt-4">Bench ({data.actual_lineup.bench.length})</h3>
            <div className="space-y-3">
              {data.actual_lineup.bench.map(renderPlayer)}
            </div>
          </div>

          {/* OPTIMAL LINEUP */}
          <div className="bg-white border-2 border-green-400 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-green-600">⭐</span>
              Optimal Lineup (AI Recommended)
            </h2>
            
            <h3 className="font-semibold text-lg mb-3">Suggested Starters ({data.optimal_lineup.starters.length})</h3>
            <div className="space-y-3 mb-6">
              {data.optimal_lineup.starters.map(renderPlayer)}
            </div>

            <h3 className="font-semibold text-lg mb-3 border-t pt-4">Bench ({data.optimal_lineup.bench.length})</h3>
            <div className="space-y-3">
              {data.optimal_lineup.bench.map(renderPlayer)}
            </div>

            {/* Optimal FLEX options */}
            {data.optimal_lineup.flex_options && data.optimal_lineup.flex_options.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold text-lg mb-3">💡 Additional FLEX Swaps</h3>
                <div className="space-y-2">
                  {data.optimal_lineup.flex_options.map((swap, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-sm bg-green-50 p-2 rounded">
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

      {/* Weekly Roast Error Display */}
      {roastError && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800 mb-1">Roast Generation Error</h3>
          <p className="text-red-700">{roastError}</p>
          {roastError.includes('Authentication required') && (
            <p className="text-sm text-red-600 mt-2">
              Please click "Authenticate with Yahoo" above to link your account.
            </p>
          )}
        </div>
      )}

      {/* Weekly Roast Loading State */}
      {roastLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Generating savage weekly roast...</p>
            <p className="text-sm text-gray-500 mt-2">This takes ~10-15 seconds</p>
          </div>
        </div>
      )}

      {/* Weekly Roast Results */}
      {roastData && (
        <div className="space-y-6">
          {/* Roast Meta Info */}
          <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-300 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-red-900 flex items-center gap-2">
                🔥 Weekly League Roast
              </h2>
              <button
                onClick={() => {
                  const shareText = `${roastData.league.name} - Week ${roastData.week} Power Rankings\n\nGenerated by bgroundrobin.com/fantasy-sitstart`;
                  navigator.clipboard.writeText(shareText);
                  alert('Link copied to clipboard!');
                }}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors text-sm"
              >
                📋 Share
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-red-700 font-medium">League:</span>
                <span className="ml-2">{roastData.league.name}</span>
              </div>
              <div>
                <span className="text-red-700 font-medium">Week:</span>
                <span className="ml-2">{roastData.week}</span>
              </div>
              <div>
                <span className="text-red-700 font-medium">Teams Analyzed:</span>
                <span className="ml-2">{roastData.teams?.length || 0}</span>
              </div>
            </div>
          </div>

          {/* AI-Generated Roast Content */}
          <div className="bg-white border-2 border-red-300 rounded-lg p-6 shadow-lg">
            <div 
              className="prose prose-lg max-w-none
                prose-headings:text-red-900 
                prose-h1:text-3xl prose-h1:font-bold prose-h1:mb-4
                prose-h2:text-2xl prose-h2:font-semibold prose-h2:mt-6 prose-h2:mb-3
                prose-p:text-gray-800 prose-p:leading-relaxed
                prose-strong:text-red-800
                prose-ul:my-2 prose-li:text-gray-700"
              dangerouslySetInnerHTML={{ __html: roastData.roast }}
            />
          </div>

          {/* Matchup Details */}
          {roastData.matchups && roastData.matchups.length > 0 && (
            <div className="bg-gray-50 border rounded-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">📊 Week {roastData.week} Matchup Results</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {roastData.matchups.map((matchup, idx) => (
                  <div key={idx} className="bg-white border rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex-1">
                        <div className={`font-semibold ${matchup.winner === matchup.team1.team_key ? 'text-green-700' : 'text-gray-600'}`}>
                          {matchup.team1.name}
                          {matchup.winner === matchup.team1.team_key && <span className="ml-2">👑</span>}
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{matchup.team1.points}</div>
                        <div className="text-xs text-gray-500">proj: {matchup.team1.projected}</div>
                      </div>
                      <div className="text-gray-400 font-bold text-xl px-3">vs</div>
                      <div className="flex-1 text-right">
                        <div className={`font-semibold ${matchup.winner === matchup.team2.team_key ? 'text-green-700' : 'text-gray-600'}`}>
                          {matchup.team2.name}
                          {matchup.winner === matchup.team2.team_key && <span className="ml-2">👑</span>}
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{matchup.team2.points}</div>
                        <div className="text-xs text-gray-500">proj: {matchup.team2.projected}</div>
                      </div>
                    </div>
                    {/* Point differential */}
                    <div className="text-center text-sm text-gray-600 mt-2 pt-2 border-t">
                      Margin: <span className="font-semibold">{Math.abs(matchup.team1.points - matchup.team2.points).toFixed(1)}</span> pts
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Details (Expandable) */}
          {roastData.teams && roastData.teams.length > 0 && (
            <details className="bg-gray-50 border rounded-lg p-6">
              <summary className="text-lg font-bold text-gray-900 cursor-pointer hover:text-red-600">
                📋 View All Team Details (Starters, Bench, Transactions)
              </summary>
              <div className="mt-4 space-y-6">
                {roastData.teams.map((team, idx) => (
                  <div key={idx} className="bg-white border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="text-lg font-bold text-gray-900">{team.name}</h4>
                        <p className="text-sm text-gray-600">Record: {team.record} • Rank: #{team.rank}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-900">{team.points}</div>
                        <div className="text-xs text-gray-500">projected: {team.projected}</div>
                      </div>
                    </div>

                    {/* Starters */}
                    <div className="mb-3">
                      <h5 className="font-semibold text-sm text-gray-700 mb-2">Starting Lineup:</h5>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {team.starters.slice(0, 8).map((player, pidx) => (
                          <div key={pidx} className="flex justify-between text-gray-700">
                            <span>{player.name} ({player.position})</span>
                            <span className="text-gray-500">{player.team}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Transactions */}
                    {team.transactions && team.transactions.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <h5 className="font-semibold text-sm text-red-700 mb-1">Moves This Week:</h5>
                        <div className="text-xs text-gray-600 space-y-1">
                          {team.transactions.map((tx, tidx) => (
                            <div key={tidx}>• {tx.players}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Info Section */}
      {!data && !loading && !error && !roastData && !roastLoading && !roastError && (
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
