// OVERFIT — the front end. All simulation is in overfit.wasm (Rust);
// this file only drives the clock and draws what the engine reports.

const $ = (id) => document.getElementById(id);
const SIDE = 16;
const ROUNDS = 16;

const UPGRADES = [
  { id: 0, name: "RAM", sub: "batch size", cost: [7, 16, 34], max: 3,
    eff: ["8 samples", "16 samples", "32 samples", "64 samples"] },
  { id: 1, name: "vRAM", sub: "nodes per layer", cost: [8, 18, 38], max: 3,
    eff: ["8 nodes", "16 nodes", "32 nodes", "64 nodes"] },
  { id: 2, name: "depth", sub: "hidden layers", cost: [14, 34], max: 2,
    eff: ["1 layer", "2 layers", "3 layers"] },
  { id: 3, name: "dataset", sub: "copies of the pixels", cost: [6, 14, 30], max: 3,
    eff: ["1×", "4×", "16×", "64×"] },
  { id: 4, name: "optimizer", sub: "how you step", cost: [10, 26], max: 2,
    eff: ["plain SGD", "momentum", "Adam"] },
  { id: 5, name: "cores", sub: "steps per second", cost: [9, 22], max: 2,
    eff: ["24 /s", "48 /s", "96 /s"] },
  { id: 6, name: "warm start", sub: "keep weights into the next run", cost: [48], max: 1,
    eff: ["off", "on"] },
];

let W, memF64, snap, mine, truth, chart, ctx, tctx, mctx;
let acc = 0, lastT = 0, ended = false, shownPhase = 0, lrPinned = null;

const fmt = (v, d = 4) => (v >= 0.1 ? v.toFixed(d - 1) : v.toFixed(Math.min(6, d + 1)));

async function boot() {
  let bytes;
  try {
    const r = await fetch("overfit.wasm");
    bytes = await r.arrayBuffer();
  } catch (e) {
    $("msg").textContent = "could not load overfit.wasm — serve the folder over http";
    return;
  }
  const { instance } = await WebAssembly.instantiate(bytes, {});
  W = instance.exports;
  memF64 = () => new Float64Array(W.memory.buffer);
  W.g_new();

  mine = $("mine").getContext("2d");
  truth = $("truth").getContext("2d");
  chart = $("chart");
  ctx = chart.getContext("2d");

  buildShop();
  $("lr").addEventListener("input", onLr);
  $("next").addEventListener("click", nextRound);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); nextRound(); }
  });

  snap = () => {
    const p = W.g_snapshot();
    return memF64().subarray(p >> 3, (p >> 3) + 26);
  };
  onLr();
  // ?pre=N: run N steps before the first paint. A test hook for screenshots,
  // and the same steps a player's browser would have taken by then.
  const pre = Math.min(420, +new URLSearchParams(location.search).get("pre") || 0);
  for (let i = 0; i < pre; i++) { if (W.g_step() !== 0) break; }
  draw(snap());
  lastT = performance.now();
  requestAnimationFrame(frame);
}

function buildShop() {
  const host = $("upgrades");
  host.innerHTML = "";
  for (const u of UPGRADES) {
    const b = document.createElement("button");
    b.className = "buy";
    b.id = "buy" + u.id;
    b.innerHTML = `<span class="n"><span>${u.name}</span><em>7</em></span>
      <span class="e">${u.sub}</span><span class="e eff">—</span>`;
    b.addEventListener("click", () => { if (W.g_buy(u.id)) dirty = true; });
    host.appendChild(b);
  }
}

function lrFromSlider(v) {
  const lo = Math.log(0.0005), hi = Math.log(0.3);
  return Math.exp(lo + (hi - lo) * (v / 1000));
}
function sliderFromLr(lr) {
  const lo = Math.log(0.0005), hi = Math.log(0.3);
  return Math.round(1000 * (Math.log(lr) - lo) / (hi - lo));
}
function onLr() {
  const lr = lrFromSlider(+$("lr").value);
  W.g_set_lr(lr);
  $("lrval").textContent = lr.toFixed(lr < 0.01 ? 4 : 3);
}

function nextRound() {
  const s = snap();
  if (s[1] === 0) return;
  if (s[0] >= ROUNDS) { restart(); return; }
  W.g_next();
  $("banner").hidden = true;
  $("next").hidden = true;
  $("msg").textContent = "a new workload. the incumbent starts where you finished.";
  acc = 0;
  shownPhase = 0;
}

function restart() {
  W.g_new();
  onLr();
  $("banner").hidden = true;
  $("next").hidden = true;
  acc = 0; shownPhase = 0;
  $("msg").textContent = "a fresh model. the incumbent forgets you.";
}

let dirty = true;

function frame(now) {
  const s = snap();
  const dt = Math.min(0.2, (now - lastT) / 1000);
  lastT = now;

  const phase = s[1] | 0;
  const cores = s[14] || 1;
  const budget = s[16] || 420;

  if (phase === 0) {
    acc += dt * 24 * cores;
    let guard = 0;
    while (acc >= 1 && guard++ < 400) {
      const r = W.g_step();
      acc -= 1;
      if (r !== 0) break;
    }
  }

  draw(s);
  if (phase !== 0 && phase !== shownPhase) {
    shownPhase = phase;
    showResult(snap());
  }
  if (phase === 0) shownPhase = 0;

  requestAnimationFrame(frame);
}

function showResult(s) {
  const win = s[1] === 1;
  const margin = ((s[4] - s[3]) / s[4]) * 100;
  const b = $("banner");
  b.hidden = false;
  b.className = win ? "win" : "lose";
  $("bh").textContent = win ? "YOU BEAT THE INCUMBENT" : "THE INCUMBENT BEAT YOU";
  $("bp").textContent = win
    ? `your loss ${fmt(s[3], 5)} against its ${fmt(s[4], 5)} — a ${margin.toFixed(1)}% margin. it has now trained on your run.`
    : `its loss ${fmt(s[4], 5)} against your ${fmt(s[3], 5)}. it learned this workload from you. tighten the learning rate, or buy capacity.`;
  $("next").hidden = false;
  $("next").textContent = s[0] >= ROUNDS ? "see the report →" : "next run →";
  if (s[0] >= ROUNDS) {
    $("bh").textContent = "BENCHMARK COMPLETE";
    $("bp").textContent = `you finished ${s[10] | 0} of ${(s[10] | 0) + (s[11] | 0)} runs ahead of the incumbent. ` +
      `press next to train a fresh model.`;
  }
}

function draw(s) {
  const loss = s[3], house = s[4], floor = s[5];
  $("run").textContent = Math.min(s[0] | 0, ROUNDS);
  $("wins").textContent = s[10] | 0;
  $("losses").textContent = s[11] | 0;
  $("loss").textContent = fmt(loss);
  $("house").textContent = fmt(house);
  $("floor").textContent = fmt(floor);
  const m = ((house - loss) / house) * 100;
  const el = $("margin");
  if (!isFinite(m)) { el.textContent = "—"; el.className = "big"; }
  else {
    el.textContent = (m >= 0 ? "+" : "") + m.toFixed(1) + "%";
    el.className = "big " + (m >= 0 ? "good" : "bad");
  }
  $("flops").textContent = (s[6] || 0).toFixed(1);
  $("params").textContent = (s[9] | 0) + " params";
  const w = s[17] | 0, d = s[18] | 0;
  $("arch").textContent = `2 → ${Array(d).fill(w).join(" → ")} → 3`;
  $("archline").textContent = `${d} hidden layer${d > 1 ? "s" : ""} · ${w} wide`;
  const prog = Math.min(1, (s[2] || 0) / (s[16] || 420));
  $("prog").style.width = (prog * 100).toFixed(1) + "%";
  $("steps").textContent = `step ${s[2] | 0} / ${s[16] | 0}`;

  // shop
  for (const u of UPGRADES) {
    const btn = $("buy" + u.id);
    const lvl = s[19 + u.id] | 0;
    const max = lvl >= u.max;
    const cost = max ? Infinity : u.cost[lvl];
    btn.disabled = max || (s[6] || 0) < cost;
    btn.querySelector("em").textContent = max ? "max" : cost.toFixed(0);
    btn.querySelector(".eff").textContent = u.eff[Math.min(lvl, u.eff.length - 1)] +
      (u.id === 6 ? "" : "");
  }

  // pictures
  blit(W.g_truth(), truth);
  blit(W.g_preview(), mine);
  $("workload").textContent = "run " + Math.min(s[0] | 0, ROUNDS);

  drawChart(s);
}

const scratchC = document.createElement("canvas");
scratchC.width = SIDE; scratchC.height = SIDE;
const sctx = scratchC.getContext("2d");

function blit(ptr, c) {
  const f = new Float64Array(W.memory.buffer, ptr, SIDE * SIDE * 3);
  const img = c.createImageData(SIDE, SIDE);
  for (let i = 0; i < SIDE * SIDE; i++) {
    img.data[i * 4] = Math.max(0, Math.min(255, f[i * 3] * 255));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, f[i * 3 + 1] * 255));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, f[i * 3 + 2] * 255));
    img.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, SIDE, SIDE);
  c.drawImage(scratchC, 0, 0);
}

function drawChart(s) {
  const dpr = window.devicePixelRatio || 1;
  const w = chart.clientWidth, h = chart.clientHeight;
  if (chart.width !== Math.round(w * dpr) || chart.height !== Math.round(h * dpr)) {
    chart.width = Math.round(w * dpr);
    chart.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const LO = -3.1, HI = 0.35; // log10(loss) range on screen
  const X = (step) => 34 + (w - 44) * (step / (s[16] || 420));
  const Y = (l) => {
    const v = Math.log10(Math.max(1e-6, Math.min(2.2, l)));
    return h - 18 - (h - 30) * ((v - LO) / (HI - LO));
  };

  // grid + labels
  ctx.strokeStyle = "#182130";
  ctx.fillStyle = "#4d5b6d";
  ctx.font = "10px ui-monospace, monospace";
  ctx.lineWidth = 1;
  for (const v of [1, 0.1, 0.01, 0.001]) {
    const y = Y(v);
    ctx.beginPath(); ctx.moveTo(34, y); ctx.lineTo(w - 10, y); ctx.stroke();
    ctx.fillText(v < 0.01 ? v.toFixed(3) : v.toString(), 2, y + 3);
  }

  // the incumbent's claim
  const fy = Y(s[5]);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#3d4a5c";
  ctx.beginPath(); ctx.moveTo(34, fy); ctx.lineTo(w - 10, fy); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#5d6d81";
  ctx.fillText("its claim", w - 62, fy - 4);

  const n = W.g_curve_len();
  const cp = W.g_curve();
  const f = new Float64Array(W.memory.buffer, cp, n * 3);
  if (n < 2) return;

  const line = (idx, color, width) => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = X(f[i * 3]), y = Y(f[i * 3 + idx]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round";
    ctx.stroke();
  };
  line(2, "rgba(255,111,142,.85)", 1.6);
  line(1, "#6ee7a8", 2);

  // the head of the race
  const lx = X(f[(n - 1) * 3]), ly = Y(f[(n - 1) * 3 + 1]);
  ctx.fillStyle = "#6ee7a8";
  ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, 7); ctx.fill();
}

boot();
