#!/usr/bin/env node
// Grade Variant B picks for 2026-02-17: V1 (all picks) vs V2 (away dogs ≤ +150)
import fs from 'fs';
const BASE='https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_';
const ESPN='https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
function normalize(s){return (s||'').toLowerCase().replace(/\./g,'').replace(/['']/g,'').replace(/\s+/g,' ').trim()}
function keyWords(name){const n=normalize(name);return n.replace(/(leopards|greyhounds|paladins|bears|governors|royals|wolves|lions|lobos|antelopes|eagles|mountain hawks|dolphins|hatters|bulls|cardinals|flames|aggies|monarchs|thundering herd|coyotes|fighting hawks|yellow jackets|demon deacons|bluejays|bisons|colonels|terriers|blue demons|falcons|huskies|owls|tigers|hokies|gators|bulldogs|buffaloes|red raiders|wildcats|wolverines|golden|warriors|spartans|knights|cougars|braves|raiders|rockets|hawks|hornets|panthers|rams|rebels|mustangs|pirates|saints|miners|lumberjacks|penguins|bearcats|highlanders|racers|ospreys|retrievers|spiders|tribe|phoenix|billikens|musketeers|friars|explorers|gaels|jaspers|dukes|toreros|zags|commodores|boilermakers|cyclones|jayhawks|mountaineers|sooners|longhorns|badgers|tar heels|seminoles|cavaliers|hoosiers|buckeyes|nittany lions|fighting irish|terrapins|cornhuskers|razorbacks|volunteers|crimson tide|gamecocks)$/g,'').trim().split(' ').filter(w=>w.length>2)}
function findGame(p,games){const hn=normalize(p.home_team),an=normalize(p.away_team);const hk=keyWords(p.home_team),ak=keyWords(p.away_team);for(const g of games){const eh=normalize(g.homeName||g.hN||'');const ea=normalize(g.awayName||g.aN||'');const ehs=normalize(g.homeShort||g.hS||'');const eas=normalize(g.awayShort||g.aS||'');const hm=eh.includes(hn)||hn.includes(eh)||ehs.includes(hn)||hn.includes(ehs)||eh.includes(hk[0]||'___')||(hk[0]&&ehs.includes(hk[0]||''));const am=ea.includes(an)||an.includes(ea)||eas.includes(an)||an.includes(eas)||ea.includes(ak[0]||'___')||(ak[0]&&eas.includes(ak[0]||''));if(hm&&am) return g;const ehk=keyWords(g.homeName||g.hN||'');const eak=keyWords(g.awayName||g.aN||'');if(hk.some(k=>ehk.includes(k)||eh.includes(k))&&ak.some(k=>eak.includes(k)||ea.includes(k))) return g}return null}
function oddsPL(won,odds,bet){if(won)return odds>0?bet*(odds/100):bet*(100/Math.abs(odds));return -bet}
function fmtOdds(o){return o>0?`+${o}`:`${o}`}
(async()=>{try{
  const files=['2026-02-16','2026-02-17'];
  let picks=[];
  for(const f of files){try{const r=await fetch(BASE+f+'.json');if(!r.ok) continue;const d=await r.json();(d.picks||[]).forEach(p=>{p._fileDate=f;picks.push(p)})}catch(e){}
  }
  // dedupe
  const seen=new Set();picks=picks.filter(p=>{const k=`${p.home_team}|${p.away_team}|${p.side}`;if(seen.has(k))return false;seen.add(k);return true});

  // fetch espn games for 2026-02-17 and 2026-02-18
  const espnDates=['20260217','20260218'];
  let espnGames=[];
  for(const ed of espnDates){try{const r=await fetch(`${ESPN}?dates=${ed}&limit=300&groups=50`);if(!r.ok) continue;const jd=await r.json();for(const ev of (jd.events||[])){const comp=ev.competitions&&ev.competitions[0];if(!comp||!comp.status||!comp.status.type||!comp.status.type.completed) continue;const home=comp.competitors.find(c=>c.homeAway==='home');const away=comp.competitors.find(c=>c.homeAway==='away');if(!home||!away) continue;espnGames.push({homeName:home.team.displayName,homeShort:home.team.shortDisplayName,homeScore:parseInt(home.score),awayName:away.team.displayName,awayShort:away.team.shortDisplayName,awayScore:parseInt(away.score),winner: parseInt(home.score) > parseInt(away.score) ? 'home':'away'} )}}catch(e){}
  }

  // Grade
  let unmatched=0;let v1W=0,v1L=0,v1PL=0,v1Wag=0;let v2W=0,v2L=0,v2PL=0,v2Wag=0;const v1List=[],v2List=[];
  for(const p of picks){const g=findGame(p,espnGames);if(!g){unmatched++;continue}const won=g.winner===p.side;const bet=p.bet_size_dollars||1000;const pl=Math.round(oddsPL(won,p.odds,bet));v1W+=won?1:0;v1L+=won?0:1;v1PL+=pl;v1Wag+=bet;v1List.push({team:p.side==='home'?p.home_team:p.away_team,side:p.side,odds:p.odds,bet,won,pl,modelProb:(p.model_prob*100).toFixed(1)+'%',edge:(p.edge*100).toFixed(1)+'%'});
    const isV2 = p.side==='away' && p.odds>0 && p.odds<=150; if(isV2){v2W+=won?1:0;v2L+=won?0:1;v2PL+=pl;v2Wag+=bet;v2List.push({team:p.away_team,odds:p.odds,bet,won,pl,modelProb:(p.model_prob*100).toFixed(1)+'%',edge:(p.edge*100).toFixed(1)+'%'} )}
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log('Results for 2026-02-17 (graded against ESPN completed games)');
  console.log('════════════════════════════════════════════════════════\n');

  console.log('V1 (All picks)');
  console.log('  Matches: '+(v1W+v1L)+'  Unmatched: '+unmatched);
  console.log('  Record:',v1W+'-'+v1L,'('+((v1W+v1L)>0?((v1W/(v1W+v1L))*100).toFixed(1):'0')+'%)');
  console.log('  Wagered: $'+v1Wag);
  console.log('  P/L: '+(v1PL>=0?'+':'')+'$'+v1PL);
  console.log('  ROI: '+(v1Wag>0?((v1PL/v1Wag)*100).toFixed(1):'0')+'%\n');
  console.log('Pick-by-pick:');v1List.forEach(r=>{console.log((r.won?'✅ ':'❌ ')+r.team.padEnd(28)+fmtOdds(r.odds).padStart(6)+'  '+(r.won?'+':'')+'$'+r.pl)});

  console.log('\nV2 (Away Dogs ≤ +150)');
  if(v2List.length===0){console.log('  No qualifying picks for V2 (away dogs ≤ +150)')}else{console.log('  Count: '+v2List.length);console.log('  Record: '+v2W+'-'+v2L+' ('+((v2W+v2L)>0?((v2W/(v2W+v2L))*100).toFixed(1):'0')+'%)');console.log('  Wagered: $'+v2Wag);console.log('  P/L: '+(v2PL>=0?'+':'')+'$'+v2PL);console.log('  ROI: '+(v2Wag>0?((v2PL/v2Wag)*100).toFixed(1):'0')+'%\n');console.log('Pick-by-pick:');v2List.forEach(r=>{console.log((r.won?'✅ ':'❌ ')+r.team.padEnd(28)+fmtOdds(r.odds).padStart(6)+'  '+(r.won?'+':'')+'$'+r.pl)});} 
}catch(e){console.error('Error',e)} })();
