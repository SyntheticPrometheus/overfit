// The objective metric. "Fun" is not a vibe here: it is the *value of a
// decision*, measured by sweeping policies and asking how much the best one
// beats the rest. A game whose best policy is a rule the player can be told
// ("wait for the cap") has decision_value ≈ 0 no matter how good its numbers
// look. A game whose policies are all equivalent has the same problem from the
// other side, so `false_choice` is reported next to it.
//
//   node design/fun.mjs            # 20 simulated minutes per policy
//   SECONDS=3600 node design/fun.mjs
import { newGame, NODES, available, costOf, buy, buySeedUpgrade, tick, tap, rung,
         harvest, seedGain, canHarvest, seedUpgradeCost, SEED_UPGRADES,
         prestigeAt, rate } from '../docs/grove/game.js';

const SECONDS = Number(process.env.SECONDS || 1200);
const DT = 0.25;

// One policy family: "take the seeds as soon as the haul is at least `hold`".
// Buying follows the measured order (most expensive affordable), because the
// question here is the harvest decision, not the shopping order.
function play(hold) {
  const s = newGame();
  let seeds = 0, harvests = 0, idle = 0, maxIdle = 0, firstH = null;
  for (let t = 0; t < SECONDS; t += DT) {
    tick(s, DT);
    // "Nothing to do" means no node AND no seed upgrade: the seed shop is the
    // late game's real content, so a node-only test reported the endgame as dead
    // air when the player was in fact still choosing what to buy.
    const canBuy = NODES.some(n => available(s, n) && costOf(s, n) <= s.sap)
      || SEED_UPGRADES.some(u => (!u.max || rung(s, u.id) < u.max) && s.seeds >= seedUpgradeCost(s, u));
    if (!canBuy) { tap(s); idle += DT; } else idle = 0;
    maxIdle = Math.max(maxIdle, idle);
    for (const u of SEED_UPGRADES) if (s.seeds >= seedUpgradeCost(s, u)) buySeedUpgrade(s, u.id);
    for (let guard = 0; guard < 50; guard++) {
      const opts = NODES.filter(n => available(s, n) && costOf(s, n) <= s.sap)
        .sort((a, b) => costOf(s, b) - costOf(s, a));
      if (!opts.length || !buy(s, opts[0].id)) break;
    }
    if (canHarvest(s) && seedGain(s) >= hold) {
      const g = harvest(s);
      if (g) { seeds += g; harvests++; if (firstH === null) firstH = t; }
    }
  }
  return { hold, seeds, harvests, rate: rate(s), maxIdle, rung: prestigeAt(s), firstH };
}

const HOLDS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 26, 30, 34, 38, 40];
const rows = HOLDS.map(play);
const equiv = (a, b) => Math.abs(a - b) / Math.max(1, a) < 0.05;

console.log(`policy = "harvest once the haul is at least N seeds"   window ${SECONDS}s\n`);
console.log('hold  seeds   harvests  sap/s    rung      first harvest');
for (const r of rows) {
  console.log(`${String(r.hold).padStart(4)}  ${String(r.seeds).padStart(5)}   ${String(r.harvests).padStart(7)}   ${r.rate.toFixed(1).padStart(8)}  ${r.rung.toExponential(1).padStart(8)}  ${r.firstH === null ? 'never' : r.firstH.toFixed(0) + 's'}`);
}
const sorted = [...rows].sort((a, b) => b.seeds - a.seeds);
const best = sorted[0];
const median = [...rows].sort((a, b) => a.seeds - b.seeds)[Math.floor(rows.length / 2)];
const falseChoice = rows.filter(r => equiv(r.seeds, best.seeds)).length / rows.length;
const decisionValue = best.seeds / Math.max(1, median.seeds) - 1;
const interior = best.hold > Math.min(...HOLDS) && best.hold < Math.max(...HOLDS);

console.log(`\nbest policy: hold ${best.hold} (${best.seeds} seeds, ${best.harvests} harvests)` +
  `  [${interior ? 'INTERIOR' : 'at the edge — the best policy is still a rule'}]`);
console.log(`median policy: ${median.seeds} seeds -> decision_value ${(decisionValue * 100).toFixed(1)}%`);
console.log(`false_choice: ${(falseChoice * 100).toFixed(0)}% of policies within 5% of the best (lower is better)`);
console.log(`idle: ${best.maxIdle.toFixed(0)}s longest stretch with nothing to buy`);
// Dead air is a penalty, not a bonus. The first version of this formula had the
// sign of this term backwards and scored 967s of nothing to do as *good*.
const idleFactor = 1 / (1 + best.maxIdle / 90);
const fun = Math.log1p(decisionValue) * (1 - falseChoice) * idleFactor;
console.log(`\nFUN SCORE ${fun.toFixed(3)}   = log(1+decision_value) x (1-false_choice) x 1/(1+idle/90)`);
// Guard: a policy that Harvests dozens of times a minute is not making choices,
// it is holding a key down. The instrument therefore refuses a run whose best
// policy is spam -- that is what a stale, fixed ladder produces (2026-11-24).
const spam = best.harvests > 60;
console.log(`claim: FUN must beat the previous day's, the best policy must stay INTERIOR,` +
  ` and it must not be Harvest spam (${best.harvests} harvests in ${SECONDS}s` +
  `${spam ? ' -- SPAM' : ''}).`);
// The ratchet. The first run records the baseline; every later run must not
// make the game worse than the day before. The interior-rule flag is a *goal*
// that is reported every day, not a gate -- the point of the daily loop is to
// move it, and a gate would just teach us to special-case the metric.
const state = { fun: +fun.toFixed(4), decisionValue: +decisionValue.toFixed(4),
                falseChoice: +falseChoice.toFixed(3), interior,
                idleSeconds: Math.round(best.maxIdle), idleFactor: +idleFactor.toFixed(3), bestHold: best.hold };
const basePath = new URL('./fun-baseline.json', import.meta.url);
const fs = await import('node:fs');
if (process.argv.includes('--check')) {
  let base = null;
  try { base = JSON.parse(fs.readFileSync(basePath, 'utf8')); } catch { /* first run */ }
  if (!base) {
    fs.writeFileSync(basePath, JSON.stringify(state, null, 2) + '\n');
    console.log('\nno baseline yet: recorded ' + JSON.stringify(state));
    process.exit(0);
  }
  const worse = [];
  if (spam) worse.push(`best policy is Harvest spam (${best.harvests} harvests in ${SECONDS}s > 60)`);
  if (state.fun < base.fun - 1e-6) worse.push(`fun ${state.fun} < baseline ${base.fun}`);
  if (state.decisionValue < base.decisionValue - 1e-6) worse.push(`decision_value ${state.decisionValue} < ${base.decisionValue}`);
  if (state.idleSeconds > base.idleSeconds) worse.push(`idle ${state.idleSeconds}s > ${base.idleSeconds}s`);
  for (const w of worse) console.log('FAIL  ' + w);
  if (worse.length) process.exit(1);
  console.log(`PASS  no worse than yesterday (fun ${base.fun} -> ${state.fun}; ` +
    `decision_value ${base.decisionValue} -> ${state.decisionValue}; ` +
    `interior: ${interior ? 'yes' : 'NO - the best policy is still a rule'})`);
}
