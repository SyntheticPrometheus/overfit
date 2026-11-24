// Strategy search: which play policy climbs the ladder fastest?
// The seed shop is permanent power, so progress is measured in seed rungs
// bought, at 10 min / 1 h / 10 h of play. `node strategy.mjs` prints the table;
// `node strategy.mjs --check` exits 1 if the claims in README.md stop holding.
import { newGame, NODES, costOf, available, tick, buy, canHarvest, harvest,
         seedGain, buySeedUpgrade, tap, SEED_UPGRADES, rung,
         seedUpgradeCost } from './game.js';

const DT = 0.25;
const MARKS = [600, 3600, 36000];
const CHECK = process.argv.includes('--check');

// `harvestAt` is the seed haul that makes a Harvest worth taking. Every Harvest
// multiplies the next rung by LADDER (2.5), so a cheap Harvest is a permanent
// tax on every later one — this is the decision the whole game turns on.
function play({ harvestAt, tapsPerSec = 4, horizon = 36000, buyNodes = true }) {
  const s = newGame();
  const out = {};
  let nextTap = 0, harvests = 0;
  for (let t = 0; t < horizon; t += DT) {
    tick(s, DT);
    for (let g = 0; g < 30; g++) {          // cheapest seed rung first
      const av = SEED_UPGRADES
        .filter(u => (!u.max || rung(s, u.id) < u.max) && seedUpgradeCost(s, u) <= s.seeds)
        .sort((a, b) => seedUpgradeCost(s, a) - seedUpgradeCost(s, b));
      if (!av.length) break;
      buySeedUpgrade(s, av[0].id);
    }
    if (harvestAt && canHarvest(s) && seedGain(s) >= harvestAt) { harvest(s); harvests++; }
    if (buyNodes) {
      const opts = NODES.filter(n => available(s, n) && costOf(s, n) <= s.sap);
      if (opts.length) { opts.sort((a, b) => costOf(s, a) - costOf(s, b)); buy(s, opts[0].id); }
      else if (tapsPerSec && t >= nextTap) { tap(s); nextTap = t + 1 / tapsPerSec; }
    } else if (tapsPerSec && t >= nextTap) { tap(s); nextTap = t + 1 / tapsPerSec; }
    const i = MARKS.indexOf(Math.round(t + DT));
    if (i >= 0) out[MARKS[i]] = {
      rungs: SEED_UPGRADES.reduce((a, u) => a + rung(s, u.id), 0), harvests,
    };
  }
  return out;
}

const show = (label, r) =>
  console.log(`${label.padEnd(26)} 10m ${String(r[600].rungs).padStart(3)}r  1h ${String(r[3600].rungs).padStart(3)}r  10h ${String(r[36000].rungs).padStart(3)}r  harvests ${r[36000].harvests}`);

console.log('Harvest depth (4 Rain taps/s):');
const depth = {};
for (const k of [2, 3, 5, 8, 15, 25, 40]) { depth[k] = play({ harvestAt: k }); show(`Harvest at +${k}`, depth[k]); }

console.log('\nRain taps (Harvest at +40):');
const taps = {};
for (const tp of [0, 1, 2, 4]) { taps[tp] = play({ harvestAt: 40, tapsPerSec: tp }); show(`${tp} tap/s`, taps[tp]); }

const claims = [
  ['waiting for the +40 cap beats Harvest at +2 at 1h', depth[40][3600].rungs >= depth[2][3600].rungs * 1.4],
  ['waiting for the +40 cap beats Harvest at +2 at 10h', depth[40][36000].rungs > depth[2][36000].rungs * 1.4],
  ['deep Harvest is monotone in the haul (40 >= 25 >= 8 >= 2)', depth[40][36000].rungs >= depth[25][36000].rungs
    && depth[25][36000].rungs >= depth[8][36000].rungs && depth[8][36000].rungs >= depth[2][36000].rungs],
  ['Rain taps are the early game (4/s reaches more rungs at 10m than 1/s)', taps[4][600].rungs > taps[1][600].rungs],
  ['not tapping costs the first 10 minutes (0 rungs at 10m)', taps[0][600].rungs === 0],
  ['the ladder saturates: 1h and 10h differ by <= 2 rungs', depth[40][36000].rungs - depth[40][3600].rungs <= 2],
];
let bad = 0;
for (const [name, ok] of claims) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) bad++; }
if (CHECK && bad) process.exit(1);
