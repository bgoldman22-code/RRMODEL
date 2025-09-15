export function parseSeasons(qs){
  const { season, years } = qs || {};
  if (season) return [Number(season)];
  if (years) return years.split(',').map(s=>Number(s.trim())).filter(Boolean);
  const now = new Date();
  return [ now.getUTCFullYear() ];
}

export function formatMarket({ team, price, point, kind }){
  if (!team) return '–';
  if (kind === 'ml'){
    return `${team} (${price >= 0 ? '+'+price : price})`;
  }
  if (kind === 'spread'){
    if (typeof point !== 'number') return `${team} –`;
    const pt = point > 0 ? `+${point}` : `${point}`;
    return `${team} ${pt}  (${price})`;
  }
  if (kind === 'total'){
    return point ? `${team} ${point}` : `${team}`;
  }
  return '–';
}

export function percent(x){
  return Math.round(x*100);
}
