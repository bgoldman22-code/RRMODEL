import { jsonResponse, getJSON } from "./_lib/http.mjs";

function toInt(v, d){ const n = parseInt(v,10); return Number.isFinite(n)?n:d; }

const TEAM_ABBREV = {
  "1":"ATL","2":"BUF","3":"CHI","4":"CIN","5":"CLE","6":"DAL","7":"DEN","8":"DET","9":"GB","10":"TEN","11":"IND","12":"KC","13":"LV","14":"LAR","15":"MIA","16":"MIN","17":"NE","18":"NO","19":"NYG","20":"NYJ","21":"PHI","22":"ARI","23":"PIT","24":"LAC","25":"SF","26":"SEA","27":"TB","28":"WSH","29":"CAR","30":"JAX","33":"BAL","34":"HOU"
};

export async function handler(event){
  try{
    const q = event.queryStringParameters || {};
    const season = toInt(q.season, 2025);
    const week   = toInt(q.week, 1);
    const debug  = q.debug === "1" || q.debug === "true";
    const keyOverride = q.key;

    const apiKey = keyOverride || process.env.SPORTSDATA_API_KEY || process.env.FANTASYDATA_API_KEY;
    if(!apiKey){
      return jsonResponse(200, { ok:false, error:"Missing SportsData API key. Set SPORTSDATA_API_KEY (or FANTASYDATA_API_KEY) or pass ?key=..." });
    }

    // SportsData season code convention for depth charts: 2025REG most likely (REG season depth charts)
    const seasonCode = `${season}REG`;

    // Endpoint docs: /v3/nfl/scores/json/DepthCharts/{season}
    const url = `https://api.sportsdata.io/v3/nfl/scores/json/DepthCharts/${seasonCode}?key=${apiKey}`;

    let raw;
    try{
      raw = await getJSON(url);
    }catch(e){
      // fallback: sometimes REG not live yet pre-season
      const url2 = `https://api.sportsdata.io/v3/nfl/scores/json/DepthCharts/${season}?key=${apiKey}`;
      raw = await getJSON(url2);
    }

    const rostersByTeam = {};
    // Normalize expected SportsData shape: array of teams, each with PositionDepthCharts (or similar)
    for(const team of Array.isArray(raw)?raw:[]){
      const teamId = String(team?.TeamID ?? team?.TeamId ?? team?.Team?.TeamID ?? "");
      const abbr = team?.Team ?? team?.TeamAbbreviation ?? TEAM_ABBREV[teamId] || team?.Key;
      if(!abbr) continue;
      const players = [];
      const depthCharts = team?.PositionDepthCharts || team?.DepthCharts || team?.DepthChart || [];
      // depthCharts may be an array of positions each with "Players" array; unify
      for(const posEntry of depthCharts){
        const pos = posEntry?.Position || posEntry?.PositionName || posEntry?.PositionGroup;
        const plist = posEntry?.Players || posEntry?.PlayerDepthCharts || [];
        let idx = 0;
        for(const p of plist){
          const name = p?.Name || [p?.FirstName, p?.LastName].filter(Boolean).join(" ").trim();
          const playerId = String(p?.PlayerID ?? p?.PlayerId ?? p?.Player?.PlayerID ?? "");
          const jersey = p?.Jersey ?? p?.JerseyNumber ?? null;
          players.push({
            id: playerId || undefined,
            name, pos, depth: ++idx,
            jersey
          });
        }
      }
      rostersByTeam[abbr] = players;
    }

    const out = { ok:true, season, week, teams: Object.keys(rostersByTeam).length, rosters: rostersByTeam };
    if(debug) out.source = "sportsdata depth charts";
    return jsonResponse(200, out);
  }catch(err){
    return jsonResponse(200, { ok:false, error: String(err) });
  }
}
