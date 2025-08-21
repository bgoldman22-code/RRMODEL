// netlify/functions/odds-nfl-negcorr.cjs
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.handler = async function(){
  try{
    // Use a dedicated key if present, otherwise fall back to the global one
    const apiKey = process.env.ODDS_API_KEY_NEGCORR || process.env.ODDS_API_KEY;
    if(!apiKey){
      return { statusCode: 200, body: JSON.stringify({ ok:false, reason:'no_api_key' }) };
    }
    const sport = 'americanfootball_nfl';
    const region = 'us';
    const markets = [
      'player_receptions',
      'player_receiving_yards',
      'player_passing_attempts',
      'player_passing_yards'
    ].join(',');
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?regions=${region}&markets=${markets}&oddsFormat=american&apiKey=${apiKey}`;

    const res = await fetch(url);
    if(!res.ok){
      return { statusCode: 200, body: JSON.stringify({ ok:false, reason:'fetch_failed', code: res.status }) };
    }
    const data = await res.json();

    const lines = {};
    for(const game of data || []){
      for(const bk of game.bookmakers || []){
        // prefer FanDuel when available
        if(!String(bk.key||'').includes('fanduel')) continue;
        for(const market of bk.markets || []){
          for(const outcome of market.outcomes || []){
            const name = outcome.participant || outcome.description || outcome.name;
            if(!name) continue;
            lines[name] = lines[name] || {};
            if(market.key === 'player_receptions'){
              lines[name].recLine = Math.round((outcome.point ?? 4.5)*2)/2;
              lines[name].altRecFloor = Math.max(2, Math.floor((outcome.point ?? 4)));
            }
            if(market.key === 'player_receiving_yards'){
              lines[name].ydsLine = Math.round((outcome.point ?? 50));
            }
            if(market.key === 'player_passing_attempts'){
              lines[name].attLine = Math.round((outcome.point ?? 33));
            }
            if(market.key === 'player_passing_yards'){
              lines[name].passYdsLine = Math.round((outcome.point ?? 220));
            }
          }
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true, provider:'theoddsapi', lines }) };
  }catch(e){
    return { statusCode: 200, body: JSON.stringify({ ok:false, reason:'exception', error:String(e) }) };
  }
};
