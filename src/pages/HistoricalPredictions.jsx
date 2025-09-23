// src/pages/HistoricalPredictions.jsx
// View historical predictions and performance analysis
import React, { useState, useEffect } from 'react';

const HistoricalPredictions = () => {
  const [historicalData, setHistoricalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState('2025');
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [viewMode, setViewMode] = useState('season'); // season, week, game

  useEffect(() => {
    loadHistoricalData();
  }, [selectedSeason, selectedWeek, selectedGame]);

  const loadHistoricalData = async () => {
    setLoading(true);
    try {
      let url = `/.netlify/functions/historical-predictions?season=${selectedSeason}`;
      if (selectedGame) {
        url += `&week=${selectedWeek}&gameId=${selectedGame}`;
      } else if (selectedWeek) {
        url += `&week=${selectedWeek}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      setHistoricalData(data);
    } catch (error) {
      console.error('Failed to load historical data:', error);
    }
    setLoading(false);
  };

  const getResultBadge = (result) => {
    if (result === 'CORRECT' || result === 'WIN') {
      return <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">✓ {result}</span>;
    } else if (result === 'NO BET') {
      return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">— NO BET</span>;
    } else {
      return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">✗ {result}</span>;
    }
  };

  const formatOdds = (odds) => odds > 0 ? `+${odds}` : `${odds}`;

  if (loading) {
    return <div className="p-8 text-center">Loading historical data...</div>;
  }

  // Game detail view
  if (selectedGame && historicalData) {
    const game = historicalData;
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => {setSelectedGame(null); setViewMode('week');}}
            className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
          >
            ← Back to Week {selectedWeek}
          </button>
          <h1 className="text-2xl font-bold">{game.matchup} - Historical Analysis</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Predictions vs Results */}
          <div className="bg-white border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Predictions vs Results</h3>
            
            <div className="space-y-4">
              <div className="border-b pb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Moneyline</span>
                  {getResultBadge(game.performance?.moneylineResult)}
                </div>
                <div className="text-sm text-gray-600">
                  <div>Predicted: {game.predictions?.moneyline?.pick}</div>
                  <div>Actual: {game.results?.outcomes?.moneyline}</div>
                  <div>Confidence: {game.predictions?.moneyline?.confidence}%</div>
                  <div>Bet: {getResultBadge(game.performance?.betResults?.moneyline)}</div>
                </div>
              </div>

              <div className="border-b pb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Spread</span>
                  {getResultBadge(game.performance?.spreadResult)}
                </div>
                <div className="text-sm text-gray-600">
                  <div>Predicted: {game.predictions?.spread?.pick} {game.predictions?.spread?.line}</div>
                  <div>Model Line: {game.predictions?.spread?.pick} {game.predictions?.spread?.predicted > 0 ? '+' : ''}{game.predictions?.spread?.predicted}</div>
                  <div>Closing Line: {game.closingLines?.spread?.line}</div>
                  <div>Actual Margin: {game.results?.margin}</div>
                  <div>Bet: {getResultBadge(game.performance?.betResults?.spread)}</div>
                </div>
              </div>

              <div className="pb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Total</span>
                  {getResultBadge(game.performance?.totalResult)}
                </div>
                <div className="text-sm text-gray-600">
                  <div>Predicted: {game.predictions?.total?.pick} {game.predictions?.total?.line}</div>
                  <div>Model Total: {game.predictions?.total?.predicted}</div>
                  <div>Closing Line: {game.closingLines?.total?.line}</div>
                  <div>Actual Total: {game.results?.total}</div>
                  <div>Bet: {getResultBadge(game.performance?.betResults?.total)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Betting Performance */}
          <div className="bg-white border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Betting Performance</h3>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>Moneyline ROI:</span>
                <span className={game.performance?.roi?.moneyline > 0 ? 'text-green-600' : 'text-red-600'}>
                  {game.performance?.roi?.moneyline > 0 ? '+' : ''}{(game.performance?.roi?.moneyline * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Spread ROI:</span>
                <span className={game.performance?.roi?.spread > 0 ? 'text-green-600' : 'text-red-600'}>
                  {game.performance?.roi?.spread > 0 ? '+' : ''}{(game.performance?.roi?.spread * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total ROI:</span>
                <span className={game.performance?.roi?.total > 0 ? 'text-green-600' : 'text-red-600'}>
                  {game.performance?.roi?.total > 0 ? '+' : ''}{(game.performance?.roi?.total * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t">
              <h4 className="font-medium mb-2">Closing Lines</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <div>ML: {formatOdds(game.closingLines?.moneyline?.home)} / {formatOdds(game.closingLines?.moneyline?.away)}</div>
                <div>Spread: {game.closingLines?.spread?.line} ({formatOdds(game.closingLines?.spread?.home_odds)})</div>
                <div>Total: {game.closingLines?.total?.line} (O:{formatOdds(game.closingLines?.total?.over_odds)} U:{formatOdds(game.closingLines?.total?.under_odds)})</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">Key Insights</h4>
          <div className="text-sm text-blue-800 space-y-1">
            <div>• Model correctly predicted {game.results ? Object.values(game.performance.modelAccuracy).filter(Boolean).length : 0}/3 outcomes</div>
            <div>• Conservative betting approach avoided low-edge opportunities</div>
            <div>• {game.predictions?.total?.betRecommendation === 'BET' ? 'Total bet was profitable' : 'No profitable betting opportunities identified'}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Historical Predictions & Performance</h1>
      
      {/* Season Overview */}
      {!selectedWeek && historicalData?.overallStats && (
        <div className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Season {selectedSeason} Overview</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{historicalData.overallStats.totalGames}</div>
              <div className="text-sm text-gray-600">Total Games</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{historicalData.overallStats.bettingRecord.roi}</div>
              <div className="text-sm text-gray-600">Overall ROI</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{historicalData.overallStats.bettingRecord.wins}-{historicalData.overallStats.bettingRecord.losses}-{historicalData.overallStats.bettingRecord.noBets}</div>
              <div className="text-sm text-gray-600">W-L-No Bet</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div>ML Accuracy: <span className="font-medium">{historicalData.overallStats.predictionAccuracy.moneyline}</span></div>
            <div>Spread Accuracy: <span className="font-medium">{historicalData.overallStats.predictionAccuracy.spread}</span></div>
            <div>Total Accuracy: <span className="font-medium">{historicalData.overallStats.predictionAccuracy.total}</span></div>
          </div>
        </div>
      )}

      {/* Week selection */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Select Week to View</h3>
        <div className="grid grid-cols-6 gap-2">
          {historicalData?.weeks?.map(week => (
            <button
              key={week}
              onClick={() => {setSelectedWeek(week); setViewMode('week');}}
              className="px-4 py-2 border rounded hover:bg-gray-50 font-medium"
            >
              Week {week}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HistoricalPredictions;