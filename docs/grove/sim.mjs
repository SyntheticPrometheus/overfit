// Bot harness: plays GROVE with a greedy policy and measures whether the
// pacing claims hold. `node sim.mjs` prints a table; `node sim.mjs --check`
// exits 1 when a claim fails.
import { newGame, NODES, node, costOf, available, owned, rate, tick, buy,
         canHarvest, harvest, seedGain, has, buySeedUpgrade, tap, SEED_UPGRADES,
         PRESTIGE_AT, prestigeAt, rung, seedUpgradeCost, fmt } from './game.js';

const CHECK = process.argv.includes('--check');
const SECONDS = Number(process.env.SIM_SECONDS || 600);
const DT = 0.25;

// Policy: seed upgrades first (cheapest), then cheapest affordable node,
// harvest the moment it pays at least one seed, tap Rain when idle.
function play(seconds, trace = false) {
  const s = newGame();
  const marks = [];            // {t, what}
  let firstBuy = null, firstHarvest = null, harvests = [];
  let idle = 0, maxIdle = 0, maxIdleEarly = 0, lastBuy = 0;
  for (let t = 0; t < seconds; t += DT) {
    tick(s, DT);
    // tap once a second if nothing affordable
    const canBuy = NODES.some(n => available(s, n) && costOf(s, n) <= s.sap);
    if (!canBuy) { tap(s); idle += DT; } else { idle = 0; }
    maxIdle = Math.max(maxIdle, idle);
    if (t < 300) maxIdleEarly = Math.max(maxIdleEarly, idle);

    for (const u of SEED_UPGRADES) if (s.seeds >= seedUpgradeCost(s, u)) buySeedUpgrade(s, u.id);

    if (canBuy) {
      // prefer unlocks, then the biggest multiplier, else cheapest
      const opts = NODES.filter(n => available(s, n) && costOf(s, n) <= s.sap);
      opts.sort((a, b) => {
        const ua = a.fx.unlock ? 1 : 0, ub = b.fx.unlock ? 1 : 0;
        if (ua !== ub) return ub - ua;
        return costOf(s, b) - costOf(s, a);      // buy the most expensive we can
      });
      if (buy(s, opts[0].id)) {
        if (firstBuy === null) firstBuy = t;
        lastBuy = t;
        marks.push({ t, what: opts[0].id });
      }
    }
    if (canHarvest(s)) {
      const g = seedGain(s);
      // Harvest when it at least doubles what you hold, or when the run stalls.
      const stalled = t - lastBuy > 60 && t - (harvests.at(-1)?.t ?? -99) > 20;
      // A patient player: harvests for a real jump, or when the run has stalled.
      if (g >= Math.max(5, Math.ceil(s.seeds * 0.6)) || (stalled && g >= 2)) {
        harvests.push({ t, g, rung: prestigeAt(s), seeds: s.seeds, rungs: SEED_UPGRADES.reduce((a, u) => a + rung(s, u.id), 0) });
        harvest(s);
        if (firstHarvest === null) firstHarvest = t;
      }
    }
  }
  return { s, firstBuy, firstHarvest, harvests, maxIdle, maxIdleEarly, rate: rate(s), marks };
}

const r = play(SECONDS);
console.log(`sap/s at ${SECONDS}s: ${fmt(r.rate)}   nodes: ${Object.values(r.s.counts).reduce((a, b) => a + b, 0)}   seeds: ${r.s.seeds}`);
console.log(`first purchase: ${r.firstBuy === null ? 'never' : r.firstBuy.toFixed(1) + 's'}`);
console.log(`first harvest:  ${r.firstHarvest === null ? 'never' : r.firstHarvest.toFixed(1) + 's'}`);
console.log(`harvests:       ${r.harvests.map(h => `${h.t.toFixed(0)}s(+${h.g})`).join(' ') || 'none'}`);
console.log(`longest idle:   ${r.maxIdle.toFixed(1)}s total, ${r.maxIdleEarly.toFixed(1)}s in the first 5min (no affordable node, tapping Rain)`);
console.log(`seed rungs:     ${SEED_UPGRADES.map(u => `${u.id}×${rung(r.s, u.id)}`).join(' ') || 'none'}`);
if (process.argv.includes('--trace')) for (const m of r.marks) console.log(`  ${m.t.toFixed(1)}s ${m.what}`);

// Tension claims: the ladder must climb and later rounds must cost more.
const firstRung = r.harvests[0]?.rung ?? 0;
const lastRung = r.harvests.at(-1)?.rung ?? 0;
const firstRound = r.harvests[1] ? r.harvests[1].t - r.harvests[0].t : 0;
const lastRound = r.harvests.length > 1 ? r.harvests.at(-1).t - r.harvests.at(-2).t : 0;
const claims = [
  ['first purchase under 10s', r.firstBuy !== null && r.firstBuy < 10],
  ['Harvest unlocked and taken under 5min', r.firstHarvest !== null && r.firstHarvest < 300],
  ['at least 2 harvests in 10min', r.harvests.length >= 2],
  ['no dead stretch over 90s before 5min', r.maxIdleEarly < 90],
  ['the rung climbs (last >= 10x first)', lastRung >= firstRung * 10],
  ['later rounds are not trivial (last round >= 2x first)', lastRound >= firstRound * 2],
];
let bad = 0;
for (const [name, ok] of claims) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) bad++; }
if (CHECK && bad) process.exit(1);
