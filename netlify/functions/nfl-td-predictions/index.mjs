// netlify/functions/nfl-td-predictions/index.mjs
// Adapted to use getStore-based helper (../_lib/blobs-nfl.js)
import { nflBlobsGetJSON as nflGetJSON, nflBlobsPutJSON as nflSetJSON } from '../_lib/blobs-nfl.js';

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week')) || getCurrentNFLWeek();
    const season = Number(url.searchParams.get('season')) || new Date().getFullYear();
    const position = url.searchParams.get('position') || 'all';

    // Load team data
    let teamForm = await nflGetJSON('team_form.json', null);
    if (!teamForm) {
      try {
        const response = await fetch((process.env.URL || '') + '/nflverse-team-form.json');
        if (response.ok) teamForm = await response.json();
      } catch (e) {
        return json({ error: 'Cannot load team form data' }, 400);
      }
    }
    if (!teamForm || !teamForm.team_data) return json({ error: 'Missing team_data' }, 400);

    // Load/generate simple roster scaffolding
    let playerData = await nflGetJSON(`nfl_player_data_${season}.json`, null);
    if (!playerData) {
      playerData = generatePlayerDataFromTeams(teamForm.team_data);
      await nflSetJSON(`nfl_player_data_${season}.json`, playerData);
    }

    const games = await getWeekGames(week, season, teamForm.team_data);
    const predictions = [];

    for (const game of games) {
      const homeTeam = teamForm.team_data[game.home];
      const awayTeam = teamForm.team_data[game.away];
      if (!homeTeam || !awayTeam) continue;

      const gamePlayers = generateGameTDPredictions(game, homeTeam, awayTeam, playerData, position);
      predictions.push({
        gameId: game.gameId,
        matchup: `${game.away} @ ${game.home}`,
        gameTime: game.start,
        totalPlayers: gamePlayers.length,
        players: gamePlayers
      });
    }

    const result = {
      ok: true, season, week, position,
      meta: {
        totalGames: predictions.length,
        totalPlayers: predictions.reduce((s, g) => s + g.totalPlayers, 0),
        updatedAt: new Date().toISOString()
      },
      predictions
    };

    await nflSetJSON(`td_predictions_${season}_week_${week}.json`, result);
    return json(result);

  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
};

function generateGameTDPredictions(game, homeTeam, awayTeam, playerData, positionFilter) {
  const players = [];
  const homeRoster = playerData.rosters?.[game.home] || [];
  const awayRoster = playerData.rosters?.[game.away] || [];

  for (const player of homeRoster) {
    if (positionFilter !== 'all' && player.position !== positionFilter) continue;
    const tdProb = calculateTDProbability(player, homeTeam, awayTeam, true);
    if (tdProb >= 0.08) {
      players.push({
        name: player.name, team: game.home, position: player.position, homeAway: 'home',
        tdProbability: round3(tdProb), confidence: getConfidenceLevel(tdProb),
        factors: buildFactorsList(player, homeTeam, awayTeam, true), roleType: player.roleType || 'depth'
      });
    }
  }
  for (const player of awayRoster) {
    if (positionFilter !== 'all' && player.position !== positionFilter) continue;
    const tdProb = calculateTDProbability(player, awayTeam, homeTeam, false);
    if (tdProb >= 0.08) {
      players.push({
        name: player.name, team: game.away, position: player.position, homeAway: 'away',
        tdProbability: round3(tdProb), confidence: getConfidenceLevel(tdProb),
        factors: buildFactorsList(player, awayTeam, homeTeam, false), roleType: player.roleType || 'depth'
      });
    }
  }
  return players.sort((a, b) => b.tdProbability - a.tdProbability);
}

function calculateTDProbability(player, myTeam, oppTeam, isHome) {
  const baseRates = { RB: 0.28, WR: 0.20, TE: 0.14, QB: 0.10, FB: 0.08 };
  let baseProb = baseRates[player.position] || 0.05;

  const roleMultipliers = { primary: 1.3, starter: 1.0, secondary: 0.7, depth: 0.4, goalline: 1.6, redzone: 1.4 };
  baseProb *= roleMultipliers[player.roleType] || 0.6;

  const offenseEPA = myTeam.offense?.epa_per_play || 0;
  baseProb *= Math.max(0.7, Math.min(1.4, 0.85 + offenseEPA * 1.5));

  const defenseEPA = oppTeam.defense?.epa_allowed_per_play || 0;
  baseProb *= Math.max(0.7, Math.min(1.4, 0.85 + defenseEPA * 1.2));

  const formBonus = (myTeam.form || 0) * 0.3;
  baseProb += formBonus;

  if (isHome) baseProb *= 1.03;

  if (player.position === 'RB') baseProb *= (1 + (myTeam.offense?.rush_epa || 0) * 0.5);
  else if (player.position === 'WR' || player.position === 'TE') baseProb *= (1 + (myTeam.offense?.pass_epa || 0) * 0.4);

  return Math.max(0.02, Math.min(0.75, baseProb));
}

function buildFactorsList(player, myTeam, oppTeam, isHome) {
  const factors = [];
  if (player.roleType === 'primary') factors.push('primary_role');
  if (player.roleType === 'goalline') factors.push('goal_line_back');
  if (player.roleType === 'redzone') factors.push('red_zone_target');
  if ((myTeam.offense?.epa_per_play || 0) > 0.05) factors.push('strong_offense');
  if ((oppTeam.defense?.epa_allowed_per_play || 0) > 0.02) factors.push('weak_defense');
  if ((myTeam.form || 0) > 0.05) factors.push('hot_team');
  if ((oppTeam.form || 0) < -0.05) factors.push('cold_opponent');
  if (isHome) factors.push('home_field');
  return factors;
}

function generatePlayerDataFromTeams(teamData) {
  const rosters = {};
  for (const teamAbbr of Object.keys(teamData)) {
    rosters[teamAbbr] = [
      { name: `${teamAbbr} RB1`, position: 'RB', roleType: 'primary' },
      { name: `${teamAbbr} RB2`, position: 'RB', roleType: 'secondary' },
      { name: `${teamAbbr} Goal Line RB`, position: 'RB', roleType: 'goalline' },
      { name: `${teamAbbr} WR1`, position: 'WR', roleType: 'primary' },
      { name: `${teamAbbr} WR2`, position: 'WR', roleType: 'starter' },
      { name: `${teamAbbr} WR3`, position: 'WR', roleType: 'secondary' },
      { name: `${teamAbbr} Slot WR`, position: 'WR', roleType: 'redzone' },
      { name: `${teamAbbr} TE1`, position: 'TE', roleType: 'starter' },
      { name: `${teamAbbr} TE2`, position: 'TE', roleType: 'secondary' },
      { name: `${teamAbbr} QB1`, position: 'QB', roleType: 'starter' },
      { name: `${teamAbbr} FB`, position: 'FB', roleType: 'goalline' }
    ];
  }
  return { season: new Date().getFullYear(), source: 'generated_from_teams', updatedAt: new Date().toISOString(), rosters };
}

function getWeekGames(week, season, teamData) {
  const teams = Object.keys(teamData);
  const games = [];
  for (let i = 0; i < Math.min(16, Math.floor(teams.length / 2)); i++) {
    const home = teams[i*2], away = teams[i*2+1];
    if (home && away) games.push({ gameId: `W${week}G${i+1}`, week, season, home, away, start: new Date(Date.now() + i * 3600000).toISOString() });
  }
  return games;
}

function getConfidenceLevel(prob) {
  if (prob >= 0.35) return 'very-high';
  if (prob >= 0.25) return 'high';
  if (prob >= 0.18) return 'medium';
  return 'low';
}
function getCurrentNFLWeek() {
  const now = new Date();
  const seasonStart = new Date(now.getFullYear(), 8, 5);
  return Math.max(1, Math.min(18, Math.floor((now - seasonStart) / (7 * 24 * 60 * 60 * 1000)) + 1));
}
function round3(x) { return Math.round(x * 1000) / 1000; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj, null, 2), { status, headers: { 'content-type': 'application/json' } }); }
