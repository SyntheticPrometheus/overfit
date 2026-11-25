// What a player actually sees, minute by minute, for the audience panel.
//
// The panel must not read the source, the metric, or the design log: it reads a
// screen. So this prints only what the page shows -- sap, income, the nodes you
// can afford and what they cost, the seeds you hold, and whether a Harvest is
// available and for how much -- plus one line per minute for what "you" did.
// Actions are taken at human cadence (a look every ~1.5 s, lognormal), because
// a transcript generated at bot cadence answers a question nobody asked.
//
// Two variants, identical except for one decision:
//   --variant live   you choose when to Harvest (hold HOLD seeds)
//   --variant dead   the game Harvests for you the instant it is legal, so the
//                    only decision a player has is which node to buy
// `--variant dead` is the panel's negative control. A judge that cannot tell it
// from the live build is not measuring entertainment.
//
//   node design/transcript.mjs --variant live --minutes 8
//   node design/transcript.mjs --variant dead --minutes 8 --seed 7
import { newGame, NODES, available, costOf, buy, buySeedUpgrade, tick, tap,
         canHarvest, seedGain, harvest, prestigeAt, rate, fmt, node,
         seedUpgradeCost, SEED_UPGRADES, rung } from '../docs/grove/game.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
const VARIANT = args.variant || 'live';
// `--narrative off` prints the screen only. It is the cue-blind arm: the panel
// must still separate the builds without the "the game Harvested for you" line,
// or the first panel was reading a sentence and not a game.
const NARRATIVE = args.narrative !== 'off';
const MINUTES = Number(args.minutes || 10);
const HOLD = Number(args.hold || 5);
const DT = 0.25;

let sd = Number(args.seed || 12345);
const rnd = () => (sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648;
const lookGap = () => Math.min(4, Math.max(0.4, Math.exp(Math.log(1.5) + 0.35 * (rnd() * 2 - 1))));

const s = newGame();
let t = 0, nextLook = 0, minute = 1;
const events = [];           // actions since the last printed minute
let harvestChoices = 0;      // minutes where waiting was a real option
let stats = { buys: 0, taps: 0, seedBuys: 0, harvests: 0, harvestGains: [] };

function screen() {
  const owned = NODES.filter(n => s.counts[n.id]).map(n => `${n.name}${n.repeat ? ' x' + s.counts[n.id] : ''}`);
  const next = NODES.filter(n => available(s, n) && !owned.includes(n.name))
    .sort((a, b) => costOf(s, a) - costOf(s, b)).slice(0, 4)
    .map(n => `${n.name} ${fmt(costOf(s, n))}${costOf(s, n) <= s.sap ? ' *' : ''}`);
  const shop = SEED_UPGRADES.filter(u => !u.max || rung(s, u.id) < u.max)
    .map(u => ({ u, c: seedUpgradeCost(s, u), r: rung(s, u.id) }))
    .sort((a, b) => a.c - b.c).slice(0, 4)
    .map(x => `${x.u.name} ${x.c}${x.r ? ' (x' + x.r + ')' : ''}${s.seeds >= x.c ? ' *' : ''}`);
  return [
    `Sap ${fmt(s.sap)} (${fmt(rate(s))}/s)  ·  Seeds ${s.seeds}  ·  ` +
      (canHarvest(s) ? `HARVEST ready for +${seedGain(s)} seeds` : `next Harvest at ${fmt(prestigeAt(s))} total sap`),
    `Tree owned: ${owned.join(', ') || 'just the Seed'}`,
    `Next in the tree: ${next.join(' · ') || 'nothing new visible'}`,
    `Seed shop (kept across runs): ${shop.join(' · ')}`,
  ];
}

const firstMinute = [];
while (t < MINUTES * 60) {
  tick(s, DT);
  t += DT;
  const atMinute = Math.floor((t - 1e-9) / 60) + 1;
  if (atMinute >= minute) {
    firstMinute.push({ minute, screen: screen(), events: events.splice(0) });
    minute = atMinute + 1;
  }
  if (t < nextLook) continue;
  nextLook = t + lookGap();

  // shopping: cheapest-first, the order a human reads a shop in
  for (let g = 0; g < 20; g++) {
    const o = NODES.filter(n => available(s, n) && costOf(s, n) <= s.sap)
      .sort((a, b) => costOf(s, a) - costOf(s, b));
    if (!o.length || !buy(s, o[0].id)) break;
    events.push(`bought ${o[0].name}`);
    stats.buys++;
  }
  for (const u of SEED_UPGRADES) {
    if ((!u.max || rung(s, u.id) < u.max) && s.seeds >= seedUpgradeCost(s, u)) {
      buySeedUpgrade(s, u.id);
      events.push(`spent seeds on ${u.name}`);
      stats.seedBuys++;
    }
  }
  const nothing = !NODES.some(n => available(s, n) && costOf(s, n) <= s.sap);
  if (nothing) { const v = tap(s); events.push(`tapped Rain (+${fmt(v)} sap)`); stats.taps++; }

  if (canHarvest(s)) {
    if (VARIANT === 'dead') {
      const g = harvest(s);
      if (g) { events.push(`the game Harvested for you (+${g} seeds)`); stats.harvests++; stats.harvestGains.push(g); }
    } else if (seedGain(s) >= HOLD) {
      harvestChoices++;
      const g = harvest(s);
      if (g) { events.push(`you Harvested (+${g} seeds)`); stats.harvests++; stats.harvestGains.push(g); }
    } else {
      harvestChoices++;   // waiting was live: the choice existed on screen
    }
  }
}

if (!firstMinute.length || firstMinute[firstMinute.length - 1].minute !== minute - 1) {
  firstMinute.push({ minute: minute - 1, screen: screen(), events: events.splice(0) });
}

function compress(list) {
  const counts = new Map(), order = [];
  for (const e of list) {
    const k = e.replace(/\(.*\)$/, '').trim();   // drop the amount, keep the act
    if (!counts.has(k)) { counts.set(k, { n: 0, first: e }); order.push(k); }
    counts.get(k).n++;
  }
  return order.map(k => { const c = counts.get(k); return c.n > 1 ? `${c.first.replace(/\(.*\)$/, '').trim()} x${c.n}` : c.first; });
}

const out = [];
out.push(`GROVE -- what the screen showed you, one block per minute (~${MINUTES} min).`);
out.push(`Each block is the page at that minute, then what you did before the next one.`);
out.push('');
for (const m of firstMinute) {
  out.push(`Minute ${m.minute}`);
  for (const line of m.screen) out.push('  ' + line);
  if (NARRATIVE && m.events.length) out.push('  You: ' + compress(m.events).join('; '));
}
out.push('');
out.push(`(end of transcript)`);
console.log(out.join('\n'));

// Structural facts the scorer reads; the panel never sees them.
if (args.json === 'true') {
  console.log(JSON.stringify({ variant: VARIANT, minutes: MINUTES, harvestChoices,
    buys: stats.buys, taps: stats.taps, harvests: stats.harvests,
    harvestGains: stats.harvestGains }));
}
