
// netlify/functions/odds-nfl-negcorr.cjs
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.handler = async function(event){
  try{
    const apiKey = process.env.ODDS_API_KEY_NEGCORR || process.env.ODDS_API_KEY;
    if(!apiKey) return { statusCode:200, body: JSON.stringify({ ok:false, reason:'no_api_key' }) };

    const sport = 'americanfootball_nfl';
    const region = 'us';
    const mk = ['player_receiving_yards','player_receptions','player_passing_yards','player_passing_attempts'].join(',');
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?regions=${region}&markets=${mk}&oddsFormat=american&apiKey=${apiKey}`;
    const res = await fetch(url);
    if(!res.ok) return { statusCode:200, body: JSON.stringify({ ok:false, reason:'fetch_failed', code: res.status }) };
    const data = await res.json();

    const lines = {};
    for(const game of data || []){
      // DraftKings priority; fallback to FanDuel if DK not present
      const dk = (game.bookmakers||[]).find(b => (b.key||'').includes('draftkings'));
      const fd = (game.bookmakers||[]).find(b => (b.key||'').includes('fanduel'));
      for(const book of [dk, fd]){
        if(!book) continue;
        for(const market of (book.markets||[])){
          for(const o of (market.outcomes||[])){
            const name = o.participant || o.description || o.name;
            if(!name) continue;
            lines[name] = lines[name] || {};
            if(market.key==='player_receptions'){ lines[name].recLine = Math.round((o.point||4.5)*2)/2; }
            if(market.key==='player_receiving_yards'){ lines[name].ydsLine = Math.round(o.point||50); }
            if(market.key==='player_passing_attempts'){ lines[name].attLine = Math.round(o.point||33); }
            if(market.key==='player_passing_yards'){ lines[name].passYdsLine = Math.round(o.point||220); }
          }
        }
      }
    }
    return { statusCode:200, body: JSON.stringify({ ok:true, lines, provider:'theoddsapi', priority:'draftkings' }) };
  }catch(e){
    return { statusCode:200, body: JSON.stringify({ ok:false, reason:'exception', error:String(e) }) };
  }
}
