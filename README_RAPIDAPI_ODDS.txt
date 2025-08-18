RAPIDAPI MLB HR ODDS (Provider-agnostic)

Add these files to your repo, set env, and call:
  1) /.netlify/functions/odds-refresh-rapid  (build snapshot)
  2) Frontend reads /.netlify/functions/odds-get

ENV (Netlify):
  RAPIDAPI_KEY=<your key>
  RAPIDAPI_HOST=therundown-therundown-v1.p.rapidapi.com
  RAPIDAPI_EVENTS_URL=https://therundown-therundown-v1.p.rapidapi.com/sports/MLB/events?date={DATE}
  RAPIDAPI_EVENT_PROPS_URL=https://therundown-therundown-v1.p.rapidapi.com/events/{EVENT_ID}/props?markets=batter_anytime_hr
  PROP_MARKET_KEY=batter_anytime_hr
  PROP_OUTCOME_FIELD=participant
  BOOKS=fanduel,draftkings,betmgm,caesars  (optional)

Frontend helper (optional):
  import { fetchDailyOdds, mapOdds } from './utils/oddsClient';
  const snap = await fetchDailyOdds();
  const oddsMap = mapOdds(snap);
  // then for each player: oddsMap.get(playerName.toLowerCase())
