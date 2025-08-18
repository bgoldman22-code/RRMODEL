// netlify/functions/nfl-candidates.mjs
// Compose Anytime TD candidates using TheOddsAPI odds merged with team profiles.
// Returns: { candidates: [ { player, teamAbbr, position, gameId, gameCode, features:{...}, why, marketAmerican } ], games: [...] }

import { guessPosition } from '../../src/utils/nfl_pos_guess.js';

export async function handler(event){
  try{
    const start = (event.queryStringParameters && event.queryStringParameters.start) || '';
    const end   = (event.queryStringParameters && event.queryStringParameters.end) || '';
    // 1) Odds
    const rOdds = await fetch(`/.netlify/functions/nfl-td-odds`);
    const oddsJ = await rOdds.json();
    const events = Array.isArray(oddsJ.events) ? oddsJ.events : [];
    // 2) Team profiles
    const rProf = await fetch(`/.netlify/functions/nfl-team-profiles`);
    const profJ = await rProf.json();
    const prof = profJ.profiles || {};

    const out = [];
    const games = [];

    for(const ev of events){
      const id = ev?.id || ev?.event_id || '';
      const home = ev?.home_team || ev?.home_team_id || ev?.home_team_name || '';
      const away = ev?.away_team || ev?.away_team_id || ev?.away_team_name || '';
      const homeAbbr = abbr(home), awayAbbr = abbr(away);
      const gameCode = `${awayAbbr}@${homeAbbr}`;
      const markets = ev?.bookmakers?.[0]?.markets || ev?.markets || [];
      // Build totals & spreads
      let total = null, spreadHome = null;
      for(const m of markets){
        const key = (m?.key || m?.market || '').toLowerCase();
        if(key==='totals'){
          const ln = m?.outcomes?.find(x => x.name && /over/i.test(x.name));
          if(ln) total = Number(ln.point);
        }
        if(key==='spreads'){
          const lnH = m?.outcomes?.find(x => x.name && String(x.name).toUpperCase()===String(home).toUpperCase());
          if(lnH) spreadHome = Number(lnH.point);
        }
      }
      const homePts = teamTotal(total, spreadHome, true);
      const awayPts = teamTotal(total, spreadHome, false);
      games.push({ id, gameCode, home:homeAbbr, away:awayAbbr, homePts, awayPts });

      // Anytime TD market
      const tdMarket = markets.find(m => (m?.key||'').toLowerCase()==='player_anytime_td');
      const outcomes = tdMarket?.outcomes || [];
      for(const o of outcomes){
        const player = String(o.name||o.player||'').trim();
        if(!player) continue;
        const teamAbbr = normalizeTeam(o?.team || homeAbbr); // odds sometimes attach team
        const position = guessPosition(player) || 'FLEX';
        const defense = prof[opponentAbbr(teamAbbr, homeAbbr, awayAbbr)]?.defense || {};
        const offense = prof[teamAbbr]?.offense || {};
        const context = { pace: 1.0, weatherMult: 1.0, qbStyleMult: 1.0, injuryMult: 1.0 };
        const teamImpliedPts = (teamAbbr===homeAbbr) ? homePts : awayPts;

        out.push({
          player,
          teamAbbr,
          position,
          gameId: id,
          gameCode,
          features: {
            position,
            teamImpliedPts,
            usage: {
              goalLineRushShare: position==='RB' ? offense.inside5RushShareTopRB : 0.10,
              rushShare: position==='RB' ? 0.60 : 0.05,
              redZoneTargetShare: /WR|TE/.test(position) ? 0.28 : 0.10,
              targetShare: /WR|TE/.test(position) ? (position==='WR1'?0.28:(position==='WR2'?0.22:0.16)) : 0.08,
              routeParticipation: /WR|TE/.test(position) ? (position==='TE1'?0.80:0.90) : 0.35,
              snapShare: position==='RB' ? 0.65 : 0.65
            },
            defense: defense,
            context
          },
          why: `${player} in ${gameCode}`,
          marketAmerican: Number(o.price||o.odds||o.american||o.price_american||0)
        });
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true, candidates: out, games }) };
  }catch(e){
    return { statusCode: 200, body: JSON.stringify({ ok:false, candidates:[], games:[] }) };
  }
}

function abbr(team){
  const map = {
    'ARIZONA CARDINALS':'ARI','ATLANTA FALCONS':'ATL','BALTIMORE RAVENS':'BAL','BUFFALO BILLS':'BUF','CAROLINA PANTHERS':'CAR','CHICAGO BEARS':'CHI','CINCINNATI BENGALS':'CIN','CLEVELAND BROWNS':'CLE','DALLAS COWBOYS':'DAL','DENVER BRONCOS':'DEN','DETROIT LIONS':'DET','GREEN BAY PACKERS':'GB','HOUSTON TEXANS':'HOU','INDIANAPOLIS COLTS':'IND','JACKSONVILLE JAGUARS':'JAX','KANSAS CITY CHIEFS':'KC','LAS VEGAS RAIDERS':'LV','LOS ANGELES CHARGERS':'LAC','LOS ANGELES RAMS':'LAR','MIAMI DOLPHINS':'MIA','MINNESOTA VIKINGS':'MIN','NEW ENGLAND PATRIOTS':'NE','NEW ORLEANS SAINTS':'NO','NEW YORK GIANTS':'NYG','NEW YORK JETS':'NYJ','PHILADELPHIA EAGLES':'PHI','PITTSBURGH STEELERS':'PIT','SAN FRANCISCO 49ERS':'SF','SEATTLE SEAHAWKS':'SEA','TAMPA BAY BUCCANEERS':'TB','TENNESSEE TITANS':'TEN','WASHINGTON COMMANDERS':'WAS','ARIZONA':'ARI','ATLANTA':'ATL','BALTIMORE':'BAL','BUFFALO':'BUF','CAROLINA':'CAR','CHICAGO':'CHI','CINCINNATI':'CIN','CLEVELAND':'CLE','DALLAS':'DAL','DENVER':'DEN','DETROIT':'DET','GREEN BAY':'GB','HOUSTON':'HOU','INDIANAPOLIS':'IND','JACKSONVILLE':'JAX','KANSAS CITY':'KC','LAS VEGAS':'LV','LA CHARGERS':'LAC','LA RAMS':'LAR','MIAMI':'MIA','MINNESOTA':'MIN','NEW ENGLAND':'NE','NEW ORLEANS':'NO','NY GIANTS':'NYG','NY JETS':'NYJ','PHILADELPHIA':'PHI','PITTSBURGH':'PIT','SAN FRANCISCO':'SF','SEATTLE':'SEA','TAMPA BAY':'TB','TENNESSEE':'TEN','WASHINGTON':'WAS'
  };
  if(!team) return '';
  const k = String(team).toUpperCase().trim();
  return map[k] || k.slice(0,3);
}
function opponentAbbr(team, home, away){ return team===home ? away : home; }
function teamTotal(total, spreadHome, isHome){
  const t = Number(total||44);
  const s = Number(spreadHome||0);
  const favPts = t/2 + s/2;
  const dogPts = t - favPts;
  return isHome ? (s <= 0 ? favPts : dogPts) : (s <= 0 ? dogPts : favPts);
}
function normalizeTeam(x){
  if(!x) return null;
  const s = String(x).toUpperCase();
  if(s.length===2 || s.length===3) return s;
  return abbr(s);
}
