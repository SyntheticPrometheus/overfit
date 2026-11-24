import { NODES, SEED_UPGRADES, newGame, rate, fmt, costOf, available, owned, buy,
         tap, tapValue, tick, canHarvest, seedGain, harvest, buySeedUpgrade, has,
         PRESTIGE_AT } from './game.js';

const $ = id => document.getElementById(id);
const SAVE = 'grove.v1';

let s = load();
const els = new Map();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE));
    if (!raw) return newGame();
    const g = Object.assign(newGame(), raw.s);
    g.counts = raw.s.counts || { seed: 1 };
    g.unlocks = raw.s.unlocks || {};
    g.seedUp = raw.s.seedUp || {};
    // Offline growth: only with the Crown node, at half rate, capped at 8h.
    const away = Math.min(8 * 3600, Math.max(0, (Date.now() - (raw.at || Date.now())) / 1000));
    if (has(g, 'offline') && away > 60) {
      const mul = g.seedUp.deep ? 1 : 0.5;
      const gain = rate(g) * away * mul;
      g.sap += gain; g.totalSap += gain;
      setTimeout(() => hint(`while you were away: +${fmt(gain)} sap (${Math.round(away / 60)} min)`), 400);
    }
    return g;
  } catch { return newGame(); }
}

let saveAt = 0;
function save() {
  try { localStorage.setItem(SAVE, JSON.stringify({ s, at: Date.now() })); } catch {}
}

function hint(t) { $('hint').textContent = t; }

// ---- build the tree once -------------------------------------------------
const svg = $('links');
const tree = $('tree');
for (const n of NODES) {
  for (const p of n.parents) {
    const pn = NODES.find(x => x.id === p);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', pn.x); line.setAttribute('y1', pn.y);
    line.setAttribute('x2', n.x); line.setAttribute('y2', n.y);
    line.dataset.to = n.id; line.dataset.from = p;
    svg.appendChild(line);
  }
  const b = document.createElement('button');
  b.className = 'node locked';
  b.style.left = n.x + '%'; b.style.top = n.y + '%';
  b.dataset.id = n.id;
  b.innerHTML = `<span>${n.name}</span><small></small>`;
  b.addEventListener('click', () => click(n));
  tree.appendChild(b);
  els.set(n.id, b);
}

function click(n) {
  if (owned(s, n.id) && !n.repeat) return;
  if (!available(s, n)) return;
  const c = costOf(s, n);
  if (s.sap < c) { hint(`${n.name}: needs ${fmt(c)} sap — ${n.desc}`); return; }
  buy(s, n.id);
  const el = els.get(n.id);
  el.classList.remove('bought'); void el.offsetWidth; el.classList.add('bought');
  hint(`${n.name} — ${n.desc}`);
  save(); draw();
}

$('rain').addEventListener('click', () => {
  const v = tap(s);
  hint(`rain: +${fmt(v)} sap`);
  save(); draw();
});

$('harvest').addEventListener('click', doHarvest);

function doHarvest() {
  const g = seedGain(s);
  if (!g) return;
  harvest(s);
  hint(`harvested — +${fmt(g)} seeds. The tree starts again, stronger.`);
  save(); draw(true);
}

// ---- draw ----------------------------------------------------------------
function draw() {
  $('sap').textContent = fmt(s.sap);
  $('rate').textContent = fmt(rate(s));
  $('seeds').textContent = fmt(s.seeds);

  const hb = $('harvest');
  const g = seedGain(s);
  hb.hidden = !has(s, 'harvest');
  if (has(s, 'harvest')) {
    hb.textContent = g ? `Harvest +${g}` : `Harvest at ${fmt(PRESTIGE_AT)} sap`;
    hb.disabled = !g;
  }

  for (const n of NODES) {
    const el = els.get(n.id);
    const own = owned(s, n.id);
    const avail = available(s, n);
    const afford = avail && costOf(s, n) <= s.sap;
    el.className = 'node' + (own && !n.repeat ? ' owned' : afford ? ' ready afford' : avail ? ' ready' : ' locked');
    if (own && n.repeat) el.className += ' owned';
    const small = el.querySelector('small');
    if (own && n.repeat) small.textContent = `×${s.counts[n.id]}`;
    else if (own) small.textContent = '✓';
    else small.textContent = avail ? fmt(costOf(s, n)) : '';
  }

  for (const line of svg.children) {
    line.classList.toggle('live', owned(s, line.dataset.to) && owned(s, line.dataset.from));
  }

  const shop = $('seedshop');
  shop.hidden = !(has(s, 'harvest') || s.seeds > 0 || s.harvests > 0);
  if (!shop.hidden) {
    const list = $('seedlist');
    list.innerHTML = '';
    for (const u of SEED_UPGRADES) {
      const done = !!s.seedUp[u.id];
      const row = document.createElement('div');
      row.className = 'up' + (done ? ' done' : '');
      row.innerHTML = `<b>${done ? '✓' : u.cost}</b><span>${u.name} — ${u.desc}</span>`;
      if (!done) {
        const b = document.createElement('button');
        b.textContent = 'buy';
        b.disabled = s.seeds < u.cost;
        b.onclick = () => { if (buySeedUpgrade(s, u.id)) { hint(`${u.name} — ${u.desc}`); save(); draw(); } };
        row.appendChild(b);
      }
      list.appendChild(row);
    }
  }
}

// ---- loop ----------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(1, (now - last) / 1000);
  last = now;
  tick(s, dt);
  if (now - saveAt > 1000) { save(); saveAt = now; }
  draw();
  requestAnimationFrame(frame);
}
draw();
requestAnimationFrame(frame);
window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
