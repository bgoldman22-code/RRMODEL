// src/hooks/useNFLTDPredictionsEnhanced.js
import { useEffect, useState } from 'react';

const BASE_URL = '/.netlify/functions/nfl-td-predictions-enhanced';

export function useNFLTDPredictionsEnhanced(type = 'lite') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE_URL}?type=${type}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(json => setData(json))
      .catch(err => setError(err))
      .finally(() => setLoading(false));
  }, [type]);

  return { data, loading, error };
}
