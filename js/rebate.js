// Iceland film reimbursement estimate. Rules from pegasus.is/tax-rebate (edited 2025-10-30) checked against
// filminiceland.com/incentives on 2026-10-20 (see _docs/pegasus-2026-10-20/FACTS.md). Pure: no DOM.
//   25%: every feature, series and documentary (and animation) with costs in Iceland, no minimums.
//   35%: ISK 350 m spend AND 30 working days in Iceland of which 10 shooting AND 50 crew (50+ working days each).
//   35% automatically for feature, documentary and animation made for audiences aged 18 and under (Dec 2025).
//   Commercials and music videos are not eligible.
export const RULES = { spend: 350, days: 30, shoot: 10, crew: 50 };
const ELIGIBLE = ['feature', 'series', 'doc', 'animation'];
const YOUTH_TYPES = ['feature', 'doc', 'animation'];

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export function estimate(input) {
  const type = input.type;
  const spend = num(input.spend);            // ISK million
  const days = Math.floor(num(input.days));
  const shoot = Math.floor(num(input.shoot));
  const crew = Math.floor(num(input.crew));
  const youth = !!input.youth && YOUTH_TYPES.includes(type);

  if (!ELIGIBLE.includes(type)) {
    return { eligible: false, rate: 0, isk: 0, checks: [], gap: [], note:
      'Commercials and music videos are not covered by the reimbursement. Pegasus still runs them; ask for a budget instead.' };
  }

  const checks = [
    { id: 'spend', label: `ISK ${RULES.spend} million spent in Iceland`, ok: spend >= RULES.spend,
      short: spend >= RULES.spend ? 0 : RULES.spend - spend },
    { id: 'days', label: `${RULES.days} working days in Iceland`, ok: days >= RULES.days,
      short: Math.max(0, RULES.days - days) },
    { id: 'shoot', label: `${RULES.shoot} of them shooting days`, ok: shoot >= RULES.shoot,
      short: Math.max(0, RULES.shoot - shoot) },
    { id: 'crew', label: `${RULES.crew} crew working directly on it`, ok: crew >= RULES.crew,
      short: Math.max(0, RULES.crew - crew) },
  ];
  const tier35 = checks.every((c) => c.ok);
  const rate = tier35 || youth ? 35 : 25;
  const isk = Math.round(spend * 1e6 * rate / 100);

  const gap = [];
  if (rate === 25) {
    for (const c of checks) {
      if (c.ok) continue;
      if (c.id === 'spend') gap.push(`ISK ${fmtM(c.short)} million more local spend`);
      if (c.id === 'days') gap.push(`${c.short} more working ${c.short === 1 ? 'day' : 'days'} in Iceland`);
      if (c.id === 'shoot') gap.push(`${c.short} more shooting ${c.short === 1 ? 'day' : 'days'}`);
      if (c.id === 'crew') gap.push(`${c.short} more crew on the project`);
    }
  }
  let note = '';
  if (youth && !tier35) note = 'Made for an audience aged 18 and under: 35% with no minimum spend.';
  if (shoot > days && days > 0) note = 'Shooting days are counted inside the working days, so they cannot be more.';
  if (input.over80) note = (note ? note + ' ' : '') +
    'With more than 80% of the budget spent in Iceland, the reimbursement is calculated on eligible costs across the EEA, including Greenland and the Faroe Islands, so the real figure can be higher than this.';
  return { eligible: true, rate, isk, checks, gap, note, youth };
}

export function fmtM(n) { return (Math.round(n * 10) / 10).toLocaleString('en-GB'); }
export function fmtISK(n) { return 'ISK ' + Math.round(n).toLocaleString('en-GB'); }
