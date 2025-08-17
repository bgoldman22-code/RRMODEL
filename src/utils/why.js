// src/utils/why.js
export function buildWhy(input) {
  const parts = [];
  if (input.base_hr_pa && input.exp_pa) {
    parts.push(`${input.player} projects from a ${(input.base_hr_pa*100).toFixed(1)}% HR/PA baseline with ~${input.exp_pa.toFixed(1)} PA.`);
  }
  if (input.pitcher?.name) {
    parts.push(`Faces ${input.pitcher.name}${input.pitcher.throws ? ' ('+input.pitcher.throws+')':''}.`);
  }
  if (input.park?.name) {
    parts.push(`${input.park.name} park factor applies.`);
  }
  if (input.odds_best_american) {
    parts.push(`Market ${input.odds_best_american}, model ${(input.true_hr_prob*100).toFixed(1)}%.`);
  }
  return { text: parts.join(' ') };
}
