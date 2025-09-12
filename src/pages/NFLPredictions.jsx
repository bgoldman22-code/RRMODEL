import React, { useState, useEffect } from 'react';

const NFLPredictions = () => {
  const [predictions, setPredictions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPredictions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/.netlify/functions/nfl-predictions-get', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Error: ${res.status} ${res.statusText}`);
      const data = await res.json();
      setPredictions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/.netlify/functions/nfl-predictions-generate', { method: 'POST' });
      if (!res.ok) throw new Error(`Error: ${res.status} ${res.statusText}`);
      await fetchPredictions();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPredictions();
  }, []);

  const rows = predictions?.rows || [];

  return (
    <div className="p-4">
      <h1>NFL Predictions</h1>
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate New Predictions'}
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {rows.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Matchup</th>
              <th>Kickoff</th>
              <th>Pick</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.matchup}</td>
                <td>{row.kickoff ? new Date(row.kickoff).toLocaleString() : 'TBD'}</td>
                <td>{row.pick?.type}: {row.pick?.team}</td>
                <td>{row.pick?.confidence ? Math.round(row.pick.confidence * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No predictions available. Click "Generate New Predictions" to create them.</p>
      )}
    </div>
  );
};

export default NFLPredictions;
