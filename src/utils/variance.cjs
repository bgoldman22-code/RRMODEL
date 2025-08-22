const { CAPS } = require('./hrExp.cjs');

function cap(x, lo=0, hi=1){ return Math.max(lo, Math.min(hi, x)); }

/**
 * Compute EV (1u) from prob and American odds
 */
function americanToDecimal(a){
  const n = Number(a);
  if (!n) return null;
  return n > 0 ? 1 + n/100 : 1 + 100 / Math.abs(n);
}
function evFromProb(p, american){
  const dec = americanToDecimal(american);
  if (!dec) return null;
  return p*(dec-1) - (1-p);
}

/**
 * Adjusts picks in-place based on knobs and optional context.
 * ctx may include:
 *  - yesterday: string[] of player names on yesterday's card
 *  - form: { [player]: { xwoba7, barrel7, k7 } }
 *  - pep_names: string[] directly tagged as PEP (shortcut)
 *  - pep_map: { [opponentPitcher]: { hr9_30, brl_allowed_30, punished_pitch: boolean } }
 *  - matchup: { [player]: { opponent: 'Name', odds: number (override) } }
 */
function applyVariance(picks, knobs, ctx={}){
  const L = picks.length;
  const flags = {};
  for (const p of picks){
    flags[p.player] = flags[p.player] || { pep:false, form7:false, repeat_dampen:false, second_tier:false, odds_band:false };
  }

  // ----- Repeat dampener -----
  if (knobs.repeat_enable && Array.isArray(ctx.yesterday)){
    const yset = new Set(ctx.yesterday.map(n => (n||'').toLowerCase()));
    for (const p of picks){
      if (!yset.has((p.player||'').toLowerCase())) continue;
      const yOdds = Number(p.odds_yday || p.odds); // if yesterday odds not available, use todays
      const tOdds = Number(p.odds);
      if (!yOdds || !tOdds) continue;
      const delta = Math.abs(tOdds - yOdds)/Math.max(1, Math.abs(yOdds));
      if (delta <= knobs.repeat_add_threshold_pct){
        p.model_hrp_adjusted = cap((p.model_hrp_adjusted ?? p.model_hrp) + knobs.repeat_dampen, 0, CAPS.maxProb);
        flags[p.player].repeat_dampen = true;
      }
    }
  }

  // ----- Form nudge -----
  if (knobs.form_enable && ctx.form){
    for (const p of picks){
      const f = ctx.form[p.player];
      if (!f) continue;
      const good = (f.xwoba7_pct && f.xwoba7_pct >= knobs.form_xwoba_pct) || (f.barrel7 && f.barrel7 >= knobs.form_barrel7_floor);
      const highK = f.k7 && f.k7 >= knobs.form_k7_high;
      if (good){
        p.model_hrp_adjusted = cap((p.model_hrp_adjusted ?? p.model_hrp) + knobs.form_add, 0, CAPS.maxProb);
        flags[p.player].form7 = true;
      }
      if (highK){
        p.model_hrp_adjusted = cap((p.model_hrp_adjusted ?? p.model_hrp) + knobs.form_k7_dampen, 0, CAPS.maxProb);
      }
    }
  }

  // ----- PEP -----
  if (knobs.pep_enable){
    const pepSet = new Set((ctx.pep_names||[]).map(n => (n||'').toLowerCase()));
    for (const p of picks){
      const base = Number(p.model_hrp||0);
      const f = ctx.form ? ctx.form[p.player] : null;
      const meets = base >= knobs.pep_hrp_floor || (f && f.barrel7 && f.barrel7 >= knobs.pep_barrel7_floor);
      if (!meets) continue;
      let isPep = false;
      if (pepSet.size){
        isPep = pepSet.has((p.player||'').toLowerCase());
      } else if (ctx.matchup && ctx.pep_map){
        const m = ctx.matchup[p.player];
        const opp = m && m.opponent;
        const ps = opp && ctx.pep_map[opp];
        if (ps){
          const z = (ps.hr9_30||0) + (ps.brl_allowed_30||0) + (ps.punished_pitch?0.5:0);
          isPep = z >= 1.2; // loose threshold
        }
      }
      if (isPep){
        p.model_hrp_adjusted = cap((p.model_hrp_adjusted ?? p.model_hrp) + knobs.pep_add, 0, CAPS.maxProb);
        flags[p.player].pep = true;
      }
    }
  }

  // ----- Odds band tag (for reporting & later card building) -----
  if (knobs.odds_band_enable){
    for (const p of picks){
      const o = Number(p.odds);
      if (!Number.isFinite(o)) continue;
      if (o >= knobs.odds_min && o <= knobs.odds_max){
        flags[p.player].odds_band = true;
      }
    }
  }

  // ----- Second-tier pool -----
  if (knobs.tier2_enable){
    // candidates in HRP range
    const cands = picks.filter(p => (p.model_hrp||0) >= knobs.tier2_hrp_low && (p.model_hrp||0) <= knobs.tier2_hrp_high);
    // require EV or PEP
    const scored = [];
    for (const p of cands){
      const ev = evFromProb((p.model_hrp_adjusted ?? p.model_hrp), p.odds);
      const ok = (ev !== null && ev >= knobs.tier2_ev_floor) || flags[p.player].pep;
      if (ok) scored.push({ p, ev: ev ?? 0 });
    }
    scored.sort((a,b)=> b.ev - a.ev);
    for (const s of scored.slice(0, knobs.tier2_daily_count)){
      s.p.model_hrp_adjusted = cap((s.p.model_hrp_adjusted ?? s.p.model_hrp) + 0.0, 0, CAPS.maxProb); // tagging only; bumps handled by pep/form
      flags[s.p.player].second_tier = true;
    }
  }

  return flags;
}

module.exports = { applyVariance };
