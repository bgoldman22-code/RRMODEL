// netlify/functions/nfl-odds.mjs
// Pull NFL Anytime TD odds. Accepts multiple env var aliases so it works with your setup.
// Supported keys:
//   - THEODDS_API_KEY (preferred)
//   - ODDS_API_KEY
//   - SPORTSGAMEODDS_KEY (alias some teams use)
// Regions:
//   - ODDS_REGIONS or ODDSAPI_REGION (default 'us')
// Sports:
//   - ODDSAPI_SPORT_KEY (default 'americanfootball_nfl')
// Markets:
//   - ODDS_MARKETS (csv) is respected if it includes player_anytime_td or player_touchdown_anytime

function env(name, fallback=null){
  return (process.env[name] ?? null) || fallback;
}

const API_KEY = env('THEODDS_API_KEY') || env('ODDS_API_KEY') || env('SPORTSGAMEODDS_KEY');
const REGIONS = env('ODDS_REGIONS') || env('ODDSAPI_REGION') || 'us';
const SPORT   = env('ODDSAPI_SPORT_KEY') || 'americanfootball_nfl';

function parseMarkets(){
  const csv = env('ODDS_MARKETS', '') || '';
  const fromEnv = csv.split(',').map(s => s.trim()).filter(Boolean);
  const needed = new Set(['player_anytime_td','player_touchdown_anytime']);
  for (const m of fromEnv){ needed.add(m); }
  return Array.from(needed);
}

function json(status, body){
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

async function j(url){
  const r = await fetch(url, { headers: { 'accept': 'application/json' } });
  const t = await r.text();
  if (!r.ok) return null;
  if (!t || t.trim().startsWith('<')) return null;
  try { return JSON.parse(t); } catch { return null; }
}

export default async (req) => {
  try{
    const url = new URL(req.url);
    const dateISO = (url.searchParams.get('date') || '').trim(); // currently unused; feed is live odds
    if (!API_KEY){
      return json(200, { ok:true, props: [], note: 'no API key (set THEODDS_API_KEY or ODDS_API_KEY or SPORTSGAMEODDS_KEY)' });
    }
    const markets = parseMarkets();
    const marketsQ = encodeURIComponent(markets.join(','));
    const regionsQ = encodeURIComponent(REGIONS);

    // The Odds API v4: sports/{sport}/odds
    // We ask for both anytime TD markets; American odds; ISO dates.
    const base = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(SPORT)}/odds`;
    const qs = `regions=${regionsQ}&markets=${marketsQ}&oddsFormat=american&dateFormat=iso&apiKey=${encodeURIComponent(API_KEY)}`;
    const apiUrl = `${base}?${qs}`;

    const data = await j(apiUrl);
    if (!data || !Array.isArray(data) || data.length === 0){
      return json(200, { ok:true, props: [], note: 'no odds data from provider', debug:{ url: apiUrl, regions: REGIONS, markets } });
    }

    // Flatten bookmakers -> markets -> outcomes into props
    const props = [];
    for (const ev of data){
      const home = ev?.home_team || null;
      const away = ev?.away_team || null;
      const commence = ev?.commence_time || null;
      const eventId = ev?.id || null;

      const books = Array.isArray(ev?.bookmakers) ? ev.bookmakers : [];
      for (const bk of books){
        const bookmaker = bk?.key || bk?.title || 'book';
        const ms = Array.isArray(bk?.markets) ? bk.markets : [];
        for (const m of ms){
          const marketKey = (m?.key || '').toLowerCase();
          if (marketKey !== 'player_anytime_td' && marketKey !== 'player_touchdown_anytime') continue;
          const outcomes = Array.isArray(m?.outcomes) ? m.outcomes : [];
          for (const o of outcomes){
            const player = o?.description || o?.name || o?.participant || null;
            const price = Number(o?.price ?? o?.odds ?? o?.american ?? NaN);
            if (!player || !Number.isFinite(price)) continue;
            props.push({
              eventId,
              commence,
              home, away,
              market: marketKey,
              bookmaker,
              player,
              american: price
            });
          }
        }
      }
    }

    return json(200, { ok:true, props, note: null, meta:{ count: props.length, markets, sport: SPORT, regions: REGIONS } });
  }catch(e){
    return json(200, { ok:true, props: [], note: 'exception in nfl-odds', error: String(e) });
  }
}
