// Playtest as a human, not as a bot: one player at human cadence (a look every
// ~1.5 s, lognormal), the measured-best policy (Harvest at a 15-seed haul, buy
// cheapest-first, Rain when nothing is affordable), and a minute-by-minute
// account of what is on the screen. The question this answers is the owner's:
// is there something to *look at* and something to *decide* each minute?
//
//   node design/playtest.mjs            # first 10 minutes, one row per minute
//   MINUTES=30 node design/playtest.mjs
import { newGame, NODES, available, costOf, buy, buySeedUpgrade, tick, tap,
         prestigeAt, harvest, seedGain, canHarvest, seedUpgradeCost, SEED_UPGRADES,
         rate, fmt, rung } from '../docs/grove/game.js';

const MINUTES = Number(process.env.MINUTES || 10);
const HOLD = Number(process.env.HOLD || 12);   // the instrument-ranked policy
const DT = 0.25;

// human cadence: look, then act -- lognormal around 1.5 s, never a fixed tick
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const lookGap = () => Math.min(4, Math.max(0.4, Math.exp(Math.log(1.5) + 0.35 * (rnd() * 2 - 1))));

const s = newGame();
let t = 0, nextLook = 0, harvests = 0, decisions = 0, pops = 0, rows = [];
let lastRate = 0, lastHarvest = null;
while (t < MINUTES * 60) {
  tick(s, DT);
  t += DT;
  if (t < nextLook) continue;
  nextLook = t + lookGap();

  for (const u of SEED_UPGRADES) if (s.seeds >= seedUpgradeCost(s, u)) { buySeedUpgrade(s, u.id); pops++; }
  const opts = NODES.filter(n => available(s, n) && costOf(s, n) <= s.sap);
  if (opts.length >= 2) decisions++;      // a moment with a real choice on screen
  if (!opts.length) tap(s);               // nothing affordable: the player taps Rain
  // cheapest-first, the order a human reads a shop in
  for (let g = 0; g < 20; g++) {
    const o = NODES.filter(n => available(s, n) && costOf(s, n) <= s.sap)
      .sort((a, b) => costOf(s, a) - costOf(s, b));
    if (!o.length || !buy(s, o[0].id)) break;
    pops++;
  }
  if (canHarvest(s) && seedGain(s) >= HOLD) { const g = harvest(s); if (g) { harvests++; lastHarvest = t; } }

  if (Math.floor(t / 60) > rows.length) {
    rows.push({ min: rows.length + 1, rate: rate(s), sap: s.sap, seeds: s.seeds,
                harvests, decisions, pops, rung: prestigeAt(s),
                nextHarvest: Math.max(0, prestigeAt(s) - s.totalSap),
                affordable: opts.length, sinceHarvest: lastHarvest === null ? null : t - lastHarvest });
  }
  lastRate = rate(s);
}
console.log(`human-cadence playtest, ${MINUTES} min, policy: Harvest at a ${HOLD}-seed haul\n`);
console.log('min  sap/s     seeds  harvests  choices  buys  rung       next Harvest needs');
for (const r of rows) {
  console.log(`${String(r.min).padStart(3)}  ${fmt(r.rate).padStart(8)}  ${String(r.seeds).padStart(5)}  ${String(r.harvests).padStart(8)}  ${String(r.decisions).padStart(7)}  ${String(r.pops).padStart(4)}  ${fmt(r.rung).padStart(8)}   ${fmt(r.nextHarvest)} away`);
}
const idleMin = [];
for (let i = 1; i < rows.length; i++) if (rows[i].pops === rows[i - 1].pops) idleMin.push(rows[i].min);
console.log(`\nchose between 2+ affordable things ${rows.at(-1).decisions} times in ${MINUTES} min (${(rows.at(-1).decisions / MINUTES).toFixed(1)}/min)`);
console.log(`minutes with no purchase at all: ${idleMin.length ? idleMin.join(', ') : 'none'}`);
console.log(`harvests: ${harvests}; seeds at the end: ${s.seeds}; seed rungs: ` +
  SEED_UPGRADES.map(u => `${u.id}×${rung(s, u.id)}`).join(' '));
