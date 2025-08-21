// src/nfl/tdEngine.js
import pbp from '../../data/nfl-td/pbp-aggregates-2022-2024.json';
import tendencies from '../../data/nfl-td/team-tendencies.json';
import defense from '../../data/nfl-td/opponent-defense.json';
import depth from '../../data/nfl-td/depth-charts.json';
import playerExplosive from '../../data/nfl-td/player-explosive.json';

function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }

export function tdEngine(games, opts = {}){
  const { offers = [], usingOdds = false } = opts;
  const W = tendencies.weights || { w_rz: 0.65, w_exp: 0.30, w_vult: 0.05 };
  const posShare = tendencies.pos_shares || { RB:{rz:0.48}, WR:{rz:0.32}, TE:{rz:0.15}, QB:{rz:0.05} };
  const inside5 = tendencies.inside5_bias || { RB:0.6, WR:0.2, TE:0.15, QB:0.05 };

  // Build a simple map of anytime TD odds by player if offers are supplied (optional for later EV calc).
  const oddsByPlayer = new Map();
  for(const o of offers){
    if(o && o.player){ oddsByPlayer.set(o.player, o); }
  }

  const rows = [];
  for(const g of games){
    const away = g.away, home = g.home;
    const defHome = defense[home] || defense['BUF']; // fallback to any
    const defAway = defense[away] || defense['BUF'];
    const teams = [
      { tm: away, opp: home, oppDef: defHome, venue: `${away} @ ${home}` },
      { tm: home, opp: away, oppDef: defAway, venue: `${away} @ ${home}` },
    ];
    for(const side of teams){
      const tm = side.tm, opp = side.opp, oppDef = side.oppDef;
      const rzTrips = (pbp[tm]?.rz_trips_pg) ?? 3.0;
      const vult = (pbp[tm]?.vulture_prob) ?? 0.10;

      const RB1 = depth[tm]?.RB1;
      const WR1 = depth[tm]?.WR1;
      const TE1 = depth[tm]?.TE1;
      const QB1 = depth[tm]?.QB1;
      const players = [
        { name: RB1, pos:'RB' },
        { name: WR1, pos:'WR' },
        { name: TE1, pos:'TE' },
        { name: QB1, pos:'QB' },
      ].filter(p => !!p.name);

      for(const p of players){
        const sharePos = posShare[p.pos]?.rz ?? 0.2;
        // Depth share: we only model the top option per position for now
        const depthShare = 0.8; // 80% of position share
        // RZ component (bounded to reasonable per-game TD probability)
        const oppAllow = oppDef?.rz_allow?.[p.pos] ?? 0.2;
        let P_RZ = clamp((rzTrips * sharePos * depthShare * oppAllow), 0, 0.85);
        // Normalize rough scale to probability (empirical): divide by ~3 to fit per-game TD prob scale
        P_RZ = clamp(P_RZ / 3.0, 0, 0.7);

        // Explosive component
        const expIdx = (playerExplosive[p.name]?.explosive_idx ?? 50) / 100.0;
        const expAllow = (p.pos === 'RB') ? (oppDef?.exp_allow?.rush ?? 0.10) : (oppDef?.exp_allow?.rec ?? 0.14);
        let P_EXP = clamp(expAllow * expIdx, 0, 0.5);
        // Mild dampener so EXP isn't overpowering
        P_EXP = P_EXP * 0.6;

        // Vulture penalty proportional to inside-5 bias for the player's position (RB hit most)
        const vultPen = vult * (inside5[p.pos] ?? 0.1) * 0.5; // keep small

        // Combine
        let P = W.w_rz * P_RZ + W.w_exp * P_EXP - W.w_vult * vultPen;
        P = clamp(P, 0.01, 0.75);

        // Row
        const model_td_pct = P;
        const rz_path_pct = clamp((W.w_rz * P_RZ) / P, 0, 1);
        const exp_path_pct = clamp((W.w_exp * P_EXP) / P, 0, 1);
        const why = [
          `${tm} RZ trips ~${rzTrips}/g`,
          `${p.pos} share ${(sharePos*100)|0}%`,
          `vs ${opp} RZ allow ${(oppAllow*100)|0}%`,
          `EXP idx ${Math.round((playerExplosive[p.name]?.explosive_idx ?? 50))}`
        ].join(' • ');

        rows.push({
          player: p.name,
          team: tm,
          game: side.venue,
          model_td_pct,
          rz_path_pct,
          exp_path_pct,
          why
        });
      }
    }
  }
  // Sort and return top N
  rows.sort((a,b) => b.model_td_pct - a.model_td_pct);
  return rows.slice(0, 30);
}

export default tdEngine;
