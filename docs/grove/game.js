// GROVE — pure game logic. No DOM. Imported by the page and by sim.mjs.
// Every number that decides pacing lives in this file so a bot can measure it.

export const PRESTIGE_AT = 10000;   // total sap that makes a Harvest possible
// seeds = sqrt(totalSap / PRESTIGE_AT): each 4x deeper run doubles the seed haul,
// so the loop converges instead of inflating (the bot in sim.mjs measures this).

// A node is a spot on the tree. `fx.mul` multiplies sap/s, `fx.flat` adds,
// `unlock` names a mechanic, `repeat` makes it a buyable (count scaling).
export const NODES = [
  { id: 'seed',    name: 'Seed',       cost: 0,      parents: [],        x: 50, y: 90, desc: 'One tree, one number that goes up.', fx: {} },

  { id: 'roots1',  name: 'Roots',      cost: 6,      parents: ['seed'],  x: 33, y: 77, desc: '×1.6 sap/s', fx: { mul: 1.6 } },
  { id: 'trunk1',  name: 'Trunk',      cost: 24,     parents: ['seed'],  x: 67, y: 77, desc: '×2 sap/s', fx: { mul: 2 } },

  { id: 'roots2',  name: 'Deep Roots', cost: 90,     parents: ['roots1'], x: 20, y: 64, desc: '×2 sap/s', fx: { mul: 2 } },
  { id: 'cambium', name: 'Cambium',    cost: 260,    parents: ['roots1','trunk1'], x: 50, y: 65, desc: 'Rain gives ×3', fx: { click: 3 } },
  { id: 'trunk2',  name: 'Thick Trunk',cost: 700,    parents: ['trunk1'], x: 80, y: 64, desc: '×2.5 sap/s', fx: { mul: 2.5 } },

  { id: 'lateral', name: 'Lateral Root', cost: 40, growth: 1.55, max: 10, repeat: true, parents: ['roots2'], x: 9, y: 51, desc: '×1.2 sap/s each, max 10', fx: { mul: 1.2 } },
  { id: 'sapwood', name: 'Sapwood',    cost: 3200,   parents: ['roots2','cambium'], x: 30, y: 51, desc: '×3 sap/s', fx: { mul: 3 } },
  { id: 'heart',   name: 'Heartwood',  cost: 12000,  parents: ['cambium','trunk2'], x: 70, y: 51, desc: '×3.5 sap/s', fx: { mul: 3.5 } },
  { id: 'crown',   name: 'Crown',      cost: 30000,  parents: ['trunk2'], x: 90, y: 51, desc: 'Grows while you are away', fx: { unlock: 'offline' } },

  { id: 'bloom',   name: 'Bloom',      cost: 60000,  parents: ['sapwood','heart'], x: 50, y: 38, desc: 'Unlocks Harvest — trade the tree for seeds', fx: { unlock: 'harvest' } },
  { id: 'shoot',   name: 'Shoot',      cost: 2000, growth: 1.5, max: 10, repeat: true, parents: ['bloom'], x: 25, y: 38, desc: '×1.15 sap/s each, max 10', fx: { mul: 1.15 } },
  { id: 'canopy',  name: 'Canopy',     cost: 400000, parents: ['bloom'], x: 75, y: 38, desc: '×5 sap/s', fx: { mul: 5 } },

  { id: 'trellis', name: 'Trellis',    cost: 250000, parents: ['canopy'], x: 88, y: 25, desc: 'Buys every node you can afford, by itself', fx: { unlock: 'auto' } },
  { id: 'fruit',   name: 'Fruit',      cost: 2500000,parents: ['canopy'], x: 66, y: 22, desc: 'Harvests give +50% seeds', fx: { seeds: 1.5 } },
  { id: 'second',  name: 'Second Ring',cost: 20000000, parents: ['canopy'], x: 40, y: 20, desc: '×10 sap/s', fx: { mul: 10 } },
  { id: 'heart2',  name: 'Heartwood II', cost: 250000000, parents: ['second'], x: 50, y: 13, desc: '×20 sap/s', fx: { mul: 20 } },
  { id: 'spir',    name: 'Spiral',       cost: 1e10,  parents: ['heart2'], x: 27, y: 11, desc: '×50 sap/s', fx: { mul: 50 } },
  { id: 'sky',     name: 'Skyroot',      cost: 1e13,  parents: ['spir'],   x: 50, y: 4, desc: '×200 sap/s', fx: { mul: 200 } },
  { id: 'star',    name: 'Starfall',     cost: 1e16,  parents: ['sky'],    x: 73, y: 11, desc: '×1000 sap/s', fx: { mul: 1000 } },
  // The endless edge of the tree: always a next ring, so the late game never
  // runs out of the thing an incremental game is made of — the next purchase.
  { id: 'ring',    name: 'Ring',         cost: 1e11, growth: 2.2, max: 30, repeat: true, parents: ['sky'], x: 88, y: 4, desc: '×2 sap/s each, max 30', fx: { mul: 2 } },
];

// Permanent upgrades bought with seeds. Survive Harvest.
export const SEED_UPGRADES = [
  { id: 'germ',  name: 'Germinate',    cost: 3,    desc: 'Every run starts at ×4 sap/s', fx: { start: 4 } },
  { id: 'bark',  name: 'Thin Bark',    cost: 8,    desc: 'Node costs −15%', fx: { discount: 0.85 } },
  { id: 'rot',   name: 'Sweet Rot',    cost: 16,   desc: 'Harvests give +100% seeds', fx: { seeds: 2 } },
  { id: 'tap',   name: 'Rainmaker',    cost: 30,   desc: 'Rain taps ×4 stronger', fx: { click: 4 } },
  { id: 'store', name: 'Seed Bank',    cost: 55,  desc: '×3 sap/s, permanently', fx: { mul: 3 } },
  { id: 'deep',  name: 'Deep Memory',  cost: 90,  desc: 'Offline growth at full rate', fx: { offline: 1 } },
  { id: 'dry',   name: 'Dry Season',   cost: 140,  desc: 'Harvest keeps a quarter of the tree', fx: { keep: 0.25 } },
  { id: 'eld',   name: 'Elder Grove',  cost: 220, desc: '×5 sap/s, permanently', fx: { mul: 5 } },
  { id: 'myc',   name: 'Mycorrhiza',   cost: 320, desc: 'Harvests give +100% seeds', fx: { seeds: 2 } },
  { id: 'world', name: 'World Tree',   cost: 450, desc: '×10 sap/s, permanently', fx: { mul: 10 } },
];

const BY_ID = new Map(NODES.map(n => [n.id, n]));
export const node = id => BY_ID.get(id);

export function newGame() {
  return {
    sap: 0, totalSap: 0, seeds: 0, harvests: 0,
    counts: { seed: 1 },   // id -> bought count; the Seed is the tree you start with
    unlocks: {},           // mechanic name -> true
    seedUp: {},            // permanent upgrade id -> true
    t: 0,
  };
}

export function owned(s, id) { return (s.counts[id] || 0) > 0; }

export function has(s, mech) { return !!s.unlocks[mech]; }

export function costOf(s, n) {
  const c = n.cost * Math.pow(n.growth || 1, s.counts[n.id] || 0);
  return s.seedUp.bark ? c * 0.85 : c;
}

export function available(s, n) {
  if (!n.parents.every(p => owned(s, p))) return false;
  if (!n.repeat) return !owned(s, n.id);
  return (s.counts[n.id] || 0) < (n.max || 1);
}

// sap/s
export function rate(s) {
  let mul = 1;
  let flat = 0;
  for (const u of SEED_UPGRADES) if (s.seedUp[u.id] && u.fx.mul) mul *= u.fx.mul;
  if (s.seedUp.germ) mul *= 4;
  // Held seeds help a little; the seed tree is where the power is, so a bot
  // that harvests constantly cannot inflate the rate (measured in sim.mjs).
  mul *= 1 + 0.6 * Math.log10(1 + s.seeds);
  for (const n of NODES) {
    const k = s.counts[n.id] || 0;
    if (!k) continue;
    if (n.fx.mul) mul *= Math.pow(n.fx.mul, n.repeat ? k : 1);
    if (n.fx.flat) flat += n.fx.flat * k;
  }
  return (1 + flat) * mul;
}

// One tap of Rain: one second of income times the click multiplier.
export function tapValue(s) {
  let c = 1;
  for (const n of NODES) if (owned(s, n.id) && n.fx.click) c *= n.fx.click;
  if (s.seedUp.tap) c *= 4;
  return rate(s) * c;
}

export function tap(s) { const v = tapValue(s); s.sap += v; s.totalSap += v; return v; }

export function buy(s, id) {
  const n = BY_ID.get(id);
  if (!n || !available(s, n)) return false;
  const c = costOf(s, n);
  if (s.sap < c) return false;
  s.sap -= c;
  s.counts[id] = (s.counts[id] || 0) + 1;
  if (n.fx.unlock) s.unlocks[n.fx.unlock] = true;
  return true;
}

export function canHarvest(s) { return has(s, 'harvest') && s.totalSap >= PRESTIGE_AT; }

export function seedGain(s) {
  if (!canHarvest(s)) return 0;
  let g = Math.sqrt(s.totalSap / 8000);
  let bonus = 1;
  if (owned(s, 'fruit')) bonus *= 1.5;
  for (const u of SEED_UPGRADES) if (s.seedUp[u.id] && u.fx.seeds) bonus *= u.fx.seeds;
  return Math.min(40, Math.floor(g * bonus));   // a single harvest cannot print seeds
}

export function harvest(s) {
  const g = seedGain(s);
  if (!g) return 0;
  const kept = { seeds: s.seeds + g, seedUp: s.seedUp, harvests: s.harvests + 1 };
  const keptNodes = {};
  if (s.seedUp.dry) for (const [id, k] of Object.entries(s.counts)) keptNodes[id] = k;
  const fresh = newGame();
  Object.assign(s, fresh, kept);
  if (s.seedUp.dry) {
    // Dry Season keeps a quarter of each count, rounded down (at least 1 owned).
    for (const [id, k] of Object.entries(keptNodes)) {
      const keep = k > 1 ? Math.floor(k * 0.25) : 1;
      if (keep > 0) s.counts[id] = keep;
    }
    for (const n of NODES) if (n.fx.unlock && s.counts[n.id]) s.unlocks[n.fx.unlock] = true;
  }
  return g;
}

export function buySeedUpgrade(s, id) {
  const u = SEED_UPGRADES.find(x => x.id === id);
  if (!u || s.seedUp[id] || s.seeds < u.cost) return false;
  s.seeds -= u.cost;
  s.seedUp[id] = true;
  return true;
}

// Auto-buy (Trellis): spend on anything affordable, cheapest first.
export function autoBuy(s) {
  if (!has(s, 'auto')) return 0;
  let bought = 0;
  for (let guard = 0; guard < 50; guard++) {
    const options = NODES
      .filter(n => available(s, n) && costOf(s, n) <= s.sap)
      .sort((a, b) => costOf(s, a) - costOf(s, b));
    if (!options.length) break;
    if (!buy(s, options[0].id)) break;
    bought++;
  }
  return bought;
}

// Advance the simulation `dt` seconds. Returns sap earned.
export function tick(s, dt) {
  if (!(dt > 0)) return 0;
  // Cap dt per step so a long offline stretch stays linear, never a jump.
  let earned = 0;
  let left = dt;
  while (left > 0) {
    const step = Math.min(left, 1);
    const r = rate(s) * step;
    s.sap += r; s.totalSap += r; earned += r;
    s.t += step;
    left -= step;
    if (has(s, 'auto')) autoBuy(s);
  }
  return earned;
}

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
export function fmt(v) {
  if (!isFinite(v)) return '∞';
  if (v < 1000) return Number.isInteger(v) ? String(v) : v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v).toString();
  let i = 0;
  while (v >= 1000 && i < SUFFIX.length - 1) { v /= 1000; i++; }
  return v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0) + SUFFIX[i];
}
