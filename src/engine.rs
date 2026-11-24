//! Overfit — the engine.
//!
//! A benchmark run is a race: your net trains on one workload while the
//! Incumbent's loss curve descends onto yours. The workload is a small picture
//! and the model is a coordinate network (2 in, 3 out), so "wider" and "deeper"
//! are real capacity, and the loss is the picture's reconstruction error.
//!
//! Everything here is a real network: forward passes, hand-written backprop with
//! a finite-difference gradient check, Adam. No dependencies.

use std::f64::consts::PI;

// ---------------------------------------------------------------- rng
#[derive(Clone)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng(seed ^ 0x9E37_79B9_7F4A_7C15)
    }
    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    pub fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / ((1u64 << 53) as f64)
    }
    pub fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * self.unit()
    }
    pub fn gauss(&mut self) -> f64 {
        let u = self.unit().max(1e-12);
        let v = self.unit();
        ((-2.0 * u.ln()).sqrt() * (2.0 * PI * v).cos()).clamp(-4.0, 4.0)
    }
}

// ------------------------------------------------------------- workload
pub const SIDE: usize = 16;
pub const N_PIX: usize = SIDE * SIDE;
pub const NOISE: f64 = 0.05;
/// The irreducible part of the loss: what the measurement noise costs you.
pub const NOISE_FLOOR: f64 = NOISE * NOISE;

/// A workload: a picture made of coloured blobs. Rounds add blobs and shrink
/// them, so detail goes up and a small net cannot keep every lobe.
#[derive(Clone)]
pub struct Workload {
    blobs: Vec<[f64; 6]>, // cx, cy, radius, r, g, b
    tint: [f64; 3],
}

impl Workload {
    pub fn new(round: u32) -> Self {
        let mut rng = Rng::new(0x5EED_0BAD ^ (round as u64).wrapping_mul(0x2545_F491_4F6C_DD1D));
        let n = (3 + round as usize).min(26);
        // colour is a slowly turning wheel: an original palette every round
        let h0 = rng.range(0.0, 1.0);
        let mut blobs = Vec::with_capacity(n);
        for i in 0..n {
            let t = i as f64 / n as f64;
            let cx = -0.75 + 1.5 * (0.5 + 0.5 * (6.283 * (t * 1.7 + h0)).sin());
            let cy = -0.75 + 1.5 * (0.5 + 0.5 * (6.283 * (t * 2.3 + h0 * 0.7)).cos());
            let radius = if round < 4 { 0.34 } else { 0.34 - 0.018 * (round - 3).min(11) as f64 };
            let hue = (t + h0) % 1.0;
            let [r, g, b] = wheel(hue);
            blobs.push([cx, cy, radius, r, g, b]);
        }
        let tint = wheel((h0 + 0.5) % 1.0);
        Workload { blobs, tint }
    }

    /// Colour at a point, in [0, 1] per channel.
    pub fn at(&self, x: f64, y: f64) -> [f64; 3] {
        let mut acc = [self.tint[0] * 0.06, self.tint[1] * 0.06, self.tint[2] * 0.06];
        let mut wsum = 0.06;
        for b in &self.blobs {
            let dx = x - b[0];
            let dy = y - b[1];
            let w = (-(dx * dx + dy * dy) / (b[2] * b[2])).exp();
            acc[0] += w * b[3];
            acc[1] += w * b[4];
            acc[2] += w * b[5];
            wsum += w;
        }
        [
            (acc[0] / wsum).clamp(0.0, 1.0),
            (acc[1] / wsum).clamp(0.0, 1.0),
            (acc[2] / wsum).clamp(0.0, 1.0),
        ]
    }

    pub fn pixels(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(N_PIX * 3);
        for j in 0..SIDE {
            for i in 0..SIDE {
                let (x, y) = pix_xy(i, j);
                let c = self.at(x, y);
                out.extend_from_slice(&c);
            }
        }
        out
    }
}

#[inline]
pub fn pix_xy(i: usize, j: usize) -> (f64, f64) {
    let x = -1.0 + 2.0 * (i as f64 + 0.5) / SIDE as f64;
    let y = -1.0 + 2.0 * (j as f64 + 0.5) / SIDE as f64;
    (x, y)
}

pub fn wheel(t: f64) -> [f64; 3] {
    let h = (t.fract() + 1.0).fract() * 6.0;
    let s = 0.72;
    let v = 0.95;
    let c = v * s;
    let x = c * (1.0 - ((h % 2.0) - 1.0).abs());
    let (r, g, b) = match h as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = v - c;
    [r + m, g + m, b + m]
}

// ----------------------------------------------------------------- net
#[derive(Clone)]
pub struct Net {
    pub arch: Vec<usize>, // [2, hidden..., 3]
    pub w: Vec<f64>,
    pub b: Vec<f64>,
    gw: Vec<f64>,
    gb: Vec<f64>,
    mw: Vec<f64>,
    vw: Vec<f64>,
    mb: Vec<f64>,
    vb: Vec<f64>,
    pub off_w: Vec<usize>,
    pub off_b: Vec<usize>,
    pub t: u64,
}

impl Net {
    pub fn new(arch: Vec<usize>, rng: &mut Rng) -> Self {
        let layers = arch.len() - 1;
        let (mut nw, mut nb) = (0usize, 0usize);
        let mut off_w = Vec::with_capacity(layers);
        let mut off_b = Vec::with_capacity(layers);
        for l in 0..layers {
            off_w.push(nw);
            off_b.push(nb);
            nw += arch[l] * arch[l + 1];
            nb += arch[l + 1];
        }
        let mut net = Net {
            arch,
            w: vec![0.0; nw],
            b: vec![0.0; nb],
            gw: vec![0.0; nw],
            gb: vec![0.0; nb],
            mw: vec![0.0; nw],
            vw: vec![0.0; nw],
            mb: vec![0.0; nb],
            vb: vec![0.0; nb],
            off_w,
            off_b,
            t: 0,
        };
        net.init(rng);
        net
    }

    pub fn init(&mut self, rng: &mut Rng) {
        let layers = self.arch.len() - 1;
        for l in 0..layers {
            let fan_in = self.arch[l] as f64;
            let fan_out = self.arch[l + 1] as f64;
            let scale = (6.0 / (fan_in + fan_out)).sqrt();
            let (o, n) = (self.off_w[l], self.arch[l] * self.arch[l + 1]);
            for i in o..o + n {
                self.w[i] = rng.range(-scale, scale);
                self.mw[i] = 0.0;
                self.vw[i] = 0.0;
            }
            let (o2, n2) = (self.off_b[l], self.arch[l + 1]);
            for j in o2..o2 + n2 {
                self.b[j] = 0.01 * rng.gauss();
                self.mb[j] = 0.0;
                self.vb[j] = 0.0;
            }
        }
        self.t = 0;
    }

    pub fn params(&self) -> usize {
        self.arch.iter().sum::<usize>() + self.w.len() + self.b.len()
    }

    #[inline]
    fn tanh_layer(&self, l: usize) -> bool {
        l + 1 != self.arch.len() - 1
    }

    /// Forward one sample. `buf` holds the activations, layer by layer.
    fn forward(&self, x: &[f64], buf: &mut Vec<Vec<f64>>) {
        buf.clear();
        buf.push(x.to_vec());
        let layers = self.arch.len() - 1;
        for l in 0..layers {
            let (n_in, n_out) = (self.arch[l], self.arch[l + 1]);
            let mut a = vec![0.0; n_out];
            let ow = self.off_w[l];
            let ob = self.off_b[l];
            let prev = &buf[l];
            for j in 0..n_out {
                let mut z = self.b[ob + j];
                for i in 0..n_in {
                    z += prev[i] * self.w[ow + i * n_out + j];
                }
                // the head is a sigmoid so every pixel is a legal colour
                a[j] = if self.tanh_layer(l) { z.tanh() } else { sigmoid(z) };
            }
            buf.push(a);
        }
    }

    pub fn predict<'a>(&self, x: &[f64], buf: &'a mut Vec<Vec<f64>>) -> &'a [f64] {
        self.forward(x, buf);
        &buf[self.arch.len() - 1]
    }

    /// One batch of samples, then one optimizer step. xs: n_in per sample,
    /// ys: n_out per sample, both flat.
    pub fn train_batch(
        &mut self,
        xs: &[f64],
        ys: &[f64],
        n_in: usize,
        n_out: usize,
        lr: f64,
        opt: u32,
    ) -> f64 {
        let _ = n_in;
        let layers = self.arch.len() - 1;
        let n = xs.len() / self.arch[0];
        if n == 0 {
            return f64::NAN;
        }
        for g in self.gw.iter_mut() {
            *g = 0.0;
        }
        for g in self.gb.iter_mut() {
            *g = 0.0;
        }
        let mut buf: Vec<Vec<f64>> = Vec::with_capacity(layers + 1);
        let mut delta: Vec<Vec<f64>> = vec![Vec::new(); layers + 1];
        let mut loss = 0.0;
        let inv = 1.0 / (n as f64 * n_out as f64);
        let in_dim = self.arch[0];
        let out_dim = self.arch[layers];

        for k in 0..n {
            let x = &xs[k * in_dim..(k + 1) * in_dim];
            let y = &ys[k * out_dim..(k + 1) * out_dim];
            self.forward(x, &mut buf);
            // dL/dz of the head, sigmoid' folded in
            let mut d = vec![0.0; out_dim];
            let mut per = 0.0;
            for j in 0..out_dim {
                let a = buf[layers][j];
                let e = a - y[j];
                loss += e * e * inv;
                per += e * e / (out_dim as f64);
                d[j] = 2.0 * e * a * (1.0 - a) * inv;
            }
            let _ = per;
            delta[layers] = d;
            for l in (0..layers).rev() {
                let (n_in_l, n_out_l) = (self.arch[l], self.arch[l + 1]);
                let ow = self.off_w[l];
                let ob = self.off_b[l];
                let prev = &buf[l];
                for j in 0..n_out_l {
                    let dj = delta[l + 1][j];
                    if dj == 0.0 {
                        continue;
                    }
                    self.gb[ob + j] += dj;
                    for i in 0..n_in_l {
                        self.gw[ow + i * n_out_l + j] += prev[i] * dj;
                    }
                }
                if l == 0 {
                    break;
                }
                let mut din = vec![0.0; n_in_l];
                for i in 0..n_in_l {
                    let mut s = 0.0;
                    for j in 0..n_out_l {
                        s += self.w[ow + i * n_out_l + j] * delta[l + 1][j];
                    }
                    let a = prev[i];
                    din[i] = s * (1.0 - a * a);
                }
                delta[l] = din;
            }
        }

        self.t += 1;
        let tt = self.t as f64;
        let (b1, b2, eps): (f64, f64, f64) = (0.9, 0.999, 1e-8);
        let c1 = 1.0 - b1.powf(tt);
        let c2 = 1.0 - b2.powf(tt);
        for i in 0..self.w.len() {
            let g = self.gw[i];
            match opt {
                0 => self.w[i] -= lr * g,
                1 => {
                    self.mw[i] = 0.9 * self.mw[i] + g;
                    self.w[i] -= lr * self.mw[i];
                }
                _ => {
                    self.mw[i] = b1 * self.mw[i] + (1.0 - b1) * g;
                    self.vw[i] = b2 * self.vw[i] + (1.0 - b2) * g * g;
                    self.w[i] -= lr * (self.mw[i] / c1) / ((self.vw[i] / c2).sqrt() + eps);
                }
            }
        }
        for i in 0..self.b.len() {
            let g = self.gb[i];
            match opt {
                0 => self.b[i] -= lr * g,
                1 => {
                    self.mb[i] = 0.9 * self.mb[i] + g;
                    self.b[i] -= lr * self.mb[i];
                }
                _ => {
                    self.mb[i] = b1 * self.mb[i] + (1.0 - b1) * g;
                    self.vb[i] = b2 * self.vb[i] + (1.0 - b2) * g * g;
                    self.b[i] -= lr * (self.mb[i] / c1) / ((self.vb[i] / c2).sqrt() + eps);
                }
            }
        }
        loss
    }

    pub fn finite(&self) -> bool {
        self.w.iter().all(|v| v.is_finite()) && self.b.iter().all(|v| v.is_finite())
    }
}

#[inline]
pub fn sigmoid(z: f64) -> f64 {
    if z >= 0.0 {
        1.0 / (1.0 + (-z).exp())
    } else {
        let e = z.exp();
        e / (1.0 + e)
    }
}

// ---------------------------------------------------------------- game
pub const BATCH: [u32; 4] = [8, 16, 32, 64];
pub const WIDTH: [usize; 4] = [8, 16, 32, 64];
pub const DEPTH: [usize; 3] = [1, 2, 3];
pub const DATA: [u32; 4] = [1, 4, 16, 64]; // dataset multiplier on the pixels
pub const CORES: [u32; 3] = [1, 2, 4];

pub const U_RAM: usize = 0;
pub const U_VRAM: usize = 1;
pub const U_DEPTH: usize = 2;
pub const U_DATA: usize = 3;
pub const U_OPT: usize = 4;
pub const U_CORES: usize = 5;
pub const U_WARM: usize = 6;
pub const U_MAX: usize = 7;

pub const DEADLINE: u32 = 420;
pub const STEPS_PER_SEC: f64 = 24.0;
pub const GAIN: f64 = 12.0;
/// FLOPs earned per training step even when the loss is not moving: the work pays.
pub const BASE_GAIN: f64 = 0.06;
pub const WIN_PAYOUT: f64 = 16.0;
pub const LOSS_PAYOUT: f64 = 3.0;

pub const PHASE_RACE: u8 = 0;
pub const PHASE_WIN: u8 = 1;
pub const PHASE_LOSS: u8 = 2;

/// The Incumbent's claim, per round: the loss you have to get under. Calibrated
/// with `cargo run --release --bin sim -- floors` against the capacity the player
/// can be expected to own, then hand-set to leave a margin for a good learning rate.
pub const FLOOR: [f64; 16] = [
    0.0570, 0.0420, 0.0287, 0.0063, 0.0144, 0.0053, 0.0075, 0.0186, 0.0065, 0.0160, 0.0327, 0.0350,
    0.0584, 0.0369, 0.0500, 0.0512,
];

pub fn floor_for(round: u32) -> f64 {
    let i = (round.max(1) as usize) - 1;
    if i < FLOOR.len() {
        FLOOR[i]
    } else {
        // past the table the Incumbent keeps shaving 4% per round, never past the noise
        (FLOOR[FLOOR.len() - 1] * 0.96f64.powi((i - FLOOR.len() + 1) as i32)).max(NOISE_FLOOR * 1.3)
    }
}

pub struct Game {
    pub round: u32,
    pub phase: u8,
    pub step: u32,
    pub deadline: u32,
    pub loss: f64,
    pub prev_loss: f64,
    pub house_start: f64,
    pub floor: f64,
    pub compute: f64,
    pub earned_total: f64,
    pub levels: [u32; U_MAX],
    pub lr: f64,
    pub net: Net,
    pub work: Workload,
    pub train_x: Vec<f64>,
    pub train_y: Vec<f64>,
    rng: Rng,
    pub curve: Vec<f64>, // (step, mine, house)
    pub preview: Vec<f64>, // the model's current picture, N_PIX*3
    pub truth: Vec<f64>,   // the workload's pixels, filled per round
    pub scratch: [f64; 26],
    pub diverged: u32,
    pub code: u32,
    pub wins: u32,
    pub losses: u32,
    pub best_ever: f64,
    pub last_end: f64,
    pub run_steps: u64,
    pub paused: bool,
}

impl Game {
    pub fn new() -> Self {
        let mut g = Game {
            round: 1,
            phase: PHASE_RACE,
            step: 0,
            deadline: DEADLINE,
            loss: 1.0,
            prev_loss: 1.0,
            house_start: 1.0,
            floor: floor_for(1),
            compute: 0.0,
            earned_total: 0.0,
            levels: [0; U_MAX],
            lr: 0.02,
            net: Net::new(vec![2, 8, 3], &mut Rng::new(1)),
            work: Workload::new(1),
            train_x: Vec::new(),
            train_y: Vec::new(),
            rng: Rng::new(7),
            curve: Vec::with_capacity(DEADLINE as usize * 3 + 6),
            preview: vec![0.0; N_PIX * 3],
            truth: vec![0.0; N_PIX * 3],
            scratch: [0.0; 26],
            diverged: 0,
            code: 0,
            wins: 0,
            losses: 0,
            best_ever: f64::INFINITY,
            last_end: f64::NAN,
            run_steps: 0,
            paused: false,
        };
        g.begin_round(true);
        g
    }

    pub fn width(&self) -> usize {
        WIDTH[self.levels[U_VRAM] as usize]
    }
    pub fn depth(&self) -> usize {
        DEPTH[self.levels[U_DEPTH] as usize]
    }
    pub fn batch(&self) -> usize {
        BATCH[self.levels[U_RAM] as usize] as usize
    }
    pub fn opt(&self) -> u32 {
        self.levels[U_OPT]
    }
    pub fn cores(&self) -> u32 {
        CORES[self.levels[U_CORES] as usize]
    }
    pub fn data_mult(&self) -> u32 {
        DATA[self.levels[U_DATA] as usize]
    }
    pub fn arch(&self) -> Vec<usize> {
        let mut a = vec![2usize];
        for _ in 0..self.depth() {
            a.push(self.width());
        }
        a.push(3);
        a
    }
    pub fn arch_is_stale(&self) -> bool {
        self.net.arch != self.arch()
    }

    fn rearchitect(&mut self, keep: bool) {
        let arch = self.arch();
        if arch == self.net.arch {
            return;
        }
        let mut fresh = Net::new(arch, &mut self.rng);
        if keep {
            let old = self.net.clone();
            let layers = old.arch.len() - 1;
            let new_layers = fresh.arch.len() - 1;
            for l in 0..layers.min(new_layers) {
                let (ni_o, no_o) = (old.arch[l], old.arch[l + 1]);
                let (ni_n, no_n) = (fresh.arch[l], fresh.arch[l + 1]);
                for i in 0..ni_o.min(ni_n) {
                    for j in 0..no_o.min(no_n) {
                        fresh.w[fresh.off_w[l] + i * no_n + j] =
                            old.w[old.off_w[l] + i * no_o + j];
                    }
                }
                for j in 0..no_o.min(no_n) {
                    fresh.b[fresh.off_b[l] + j] = old.b[old.off_b[l] + j];
                }
            }
            fresh.t = old.t;
        }
        self.net = fresh;
    }

    /// The picture the model currently draws, as RGB triples in [0,1].
    pub fn render(&mut self) {
        let mut buf = Vec::new();
        for j in 0..SIDE {
            for i in 0..SIDE {
                let (x, y) = pix_xy(i, j);
                let p = self.net.predict(&[x, y], &mut buf);
                let o = (j * SIDE + i) * 3;
                self.preview[o] = p[0];
                self.preview[o + 1] = p[1];
                self.preview[o + 2] = p[2];
            }
        }
    }

    pub fn eval_loss(&mut self) -> f64 {
        let mut buf = Vec::new();
        let mut l = 0.0;
        let truth = self.work.pixels();
        for j in 0..SIDE {
            for i in 0..SIDE {
                let (x, y) = pix_xy(i, j);
                let p = self.net.predict(&[x, y], &mut buf);
                let o = (j * SIDE + i) * 3;
                for c in 0..3 {
                    let e = p[c] - truth[o + c];
                    l += e * e;
                }
            }
        }
        l / (N_PIX * 3) as f64
    }

    fn build_data(&mut self) {
        let mult = self.data_mult() as usize;
        let truth = self.work.pixels();
        self.truth.copy_from_slice(&truth);
        self.train_x.clear();
        self.train_y.clear();
        let mut rng = self.rng.clone();
        for _ in 0..mult {
            for j in 0..SIDE {
                for i in 0..SIDE {
                    let (x, y) = pix_xy(i, j);
                    let o = (j * SIDE + i) * 3;
                    self.train_x.push(x);
                    self.train_x.push(y);
                    for c in 0..3 {
                        self.train_y.push((truth[o + c] + NOISE * rng.gauss()).clamp(0.0, 1.0));
                    }
                }
            }
        }
        self.rng = rng;
    }

    fn begin_round(&mut self, first: bool) {
        self.work = Workload::new(self.round);
        self.floor = floor_for(self.round);
        self.build_data();
        self.step = 0;
        self.phase = PHASE_RACE;
        self.curve.clear();
        let warm = self.levels[U_WARM] > 0;
        if first || !warm || self.arch_is_stale() {
            self.net = Net::new(self.arch(), &mut self.rng);
        }
        self.loss = self.eval_loss();
        self.prev_loss = self.loss;
        self.render();
        self.push_curve();
    }

    pub fn house_loss(&self, t: u32) -> f64 {
        let tau = self.deadline as f64 / 3.0;
        let e = (-(t as f64) / tau).exp();
        self.floor + (self.house_start - self.floor).max(0.0) * e
    }

    fn push_curve(&mut self) {
        let h = self.house_loss(self.step);
        let l = self.loss;
        self.curve.push(self.step as f64);
        self.curve.push(l);
        self.curve.push(h);
    }

    pub fn step_once(&mut self) -> bool {
        if self.phase != PHASE_RACE || self.paused {
            return false;
        }
        let before = self.loss;
        let b = self.batch();
        let n = self.train_x.len() / 2;
        let mut xs = Vec::with_capacity(b * 2);
        let mut ys = Vec::with_capacity(b * 3);
        for _ in 0..b {
            let k = (self.rng.unit() * n as f64) as usize % n;
            xs.push(self.train_x[k * 2]);
            xs.push(self.train_x[k * 2 + 1]);
            ys.push(self.train_y[k * 3]);
            ys.push(self.train_y[k * 3 + 1]);
            ys.push(self.train_y[k * 3 + 2]);
        }
        let (lr, opt) = (self.lr, self.opt());
        self.net.train_batch(&xs, &ys, 2, 3, lr, opt);
        self.run_steps += 1;

        if !self.net.finite() {
            self.diverged += 1;
            self.code = 2;
            self.net = Net::new(self.arch(), &mut self.rng);
            self.loss = self.eval_loss();
            self.compute = (self.compute - 2.0).max(0.0);
        } else {
            let after = self.eval_loss();
            if !after.is_finite() || after > 50.0 {
                self.diverged += 1;
                self.code = 2;
                self.net = Net::new(self.arch(), &mut self.rng);
                self.loss = self.eval_loss();
                self.compute = (self.compute - 2.0).max(0.0);
            } else {
                let gain = BASE_GAIN + GAIN * (before - after).max(0.0);
                self.compute += gain;
                self.earned_total += gain;
                self.prev_loss = self.loss;
                self.loss = after;
            }
        }
        self.step += 1;
        if self.step % 3 == 0 || self.step < 2 {
            self.render();
        }
        self.push_curve();
        if self.step >= self.deadline {
            self.settle();
        }
        true
    }

    fn settle(&mut self) {
        let h = self.house_loss(self.deadline);
        self.last_end = self.loss;
        self.best_ever = self.best_ever.min(self.loss);
        if self.loss < h {
            self.phase = PHASE_WIN;
            self.wins += 1;
            self.compute += WIN_PAYOUT;
            self.code = 1;
        } else {
            self.phase = PHASE_LOSS;
            self.losses += 1;
            self.compute += LOSS_PAYOUT;
            self.code = 3;
        }
        self.render();
    }

    pub fn next_round(&mut self) {
        if self.phase == PHASE_RACE {
            return;
        }
        let ended_at = self.last_end;
        self.round += 1;
        // the Incumbent trains on the run you just played: it starts where you finished
        self.house_start = if ended_at.is_finite() { ended_at.max(1e-4) } else { 1.0 };
        if self.levels[U_WARM] > 0 && !self.arch_is_stale() {
            self.build_next(true);
        } else {
            self.build_next(false);
        }
        self.code = 0;
    }

    fn build_next(&mut self, keep: bool) {
        self.work = Workload::new(self.round);
        self.floor = floor_for(self.round);
        self.build_data();
        self.step = 0;
        self.phase = PHASE_RACE;
        self.curve.clear();
        if !keep {
            self.net = Net::new(self.arch(), &mut self.rng);
        }
        self.loss = self.eval_loss();
        self.prev_loss = self.loss;
        self.render();
        self.push_curve();
    }

    // ---------------------------------------------------------- upgrades
    pub fn cost(&self, id: usize) -> f64 {
        let l = self.levels[id] as usize;
        match id {
            U_RAM => [7.0, 16.0, 34.0][l.min(2)],
            U_VRAM => [8.0, 18.0, 38.0][l.min(2)],
            U_DEPTH => [14.0, 34.0][l.min(1)],
            U_DATA => [6.0, 14.0, 30.0][l.min(2)],
            U_OPT => [10.0, 26.0][l.min(1)],
            U_CORES => [9.0, 22.0][l.min(1)],
            U_WARM => 48.0,
            _ => f64::INFINITY,
        }
    }

    pub fn maxed(&self, id: usize) -> bool {
        let l = self.levels[id] as usize;
        match id {
            U_RAM | U_VRAM | U_DATA => l >= 3,
            U_DEPTH => l >= 2,
            U_OPT | U_CORES => l >= 2,
            U_WARM => l >= 1,
            _ => true,
        }
    }

    pub fn buy(&mut self, id: usize) -> bool {
        if id >= U_MAX || self.maxed(id) {
            return false;
        }
        let c = self.cost(id);
        if self.compute < c {
            return false;
        }
        self.compute -= c;
        self.levels[id] += 1;
        match id {
            U_VRAM | U_DEPTH => self.rearchitect(true),
            U_DATA => self.build_data(),
            _ => {}
        }
        true
    }

    pub fn set_lr(&mut self, lr: f64) {
        self.lr = lr.clamp(0.0005, 0.5);
    }

    pub fn snapshot(&self) -> [f64; 26] {
        [
            self.round as f64,
            self.phase as f64,
            self.step as f64,
            self.loss,
            self.house_loss(self.step),
            self.floor,
            self.compute,
            self.house_start,
            self.lr,
            self.net.params() as f64,
            self.wins as f64,
            self.losses as f64,
            self.levels[U_OPT] as f64,
            if self.best_ever.is_finite() { self.best_ever } else { -1.0 },
            self.cores() as f64,
            self.batch() as f64,
            self.deadline as f64,
            self.width() as f64,
            self.depth() as f64,
            self.levels[0] as f64,
            self.levels[1] as f64,
            self.levels[2] as f64,
            self.levels[3] as f64,
            self.levels[4] as f64,
            self.levels[5] as f64,
            self.levels[6] as f64,
        ]
    }
}

/// Native measurement of what a shape can reach, used to calibrate FLOOR.
pub fn measure(round: u32, width: usize, depth: usize, opt: u32, lr: f64, batch: usize, steps: u32) -> f64 {
    let work = Workload::new(round);
    let truth = work.pixels();
    let mut rng = Rng::new(0xA11CE ^ round as u64);
    let mut arch = vec![2usize];
    for _ in 0..depth {
        arch.push(width);
    }
    arch.push(3);
    let mut net = Net::new(arch, &mut rng);
    let mut xs = Vec::with_capacity(N_PIX * 2);
    let mut ys = Vec::with_capacity(N_PIX * 3);
    for j in 0..SIDE {
        for i in 0..SIDE {
            let (x, y) = pix_xy(i, j);
            xs.push(x);
            xs.push(y);
            let o = (j * SIDE + i) * 3;
            for c in 0..3 {
                ys.push((truth[o + c] + NOISE * rng.gauss()).clamp(0.0, 1.0));
            }
        }
    }
    let mut buf = Vec::new();
    for _ in 0..steps {
        let mut bx = Vec::with_capacity(batch * 2);
        let mut by = Vec::with_capacity(batch * 3);
        for _ in 0..batch {
            let k = (rng.unit() * N_PIX as f64) as usize % N_PIX;
            bx.push(xs[k * 2]);
            bx.push(xs[k * 2 + 1]);
            by.push(ys[k * 3]);
            by.push(ys[k * 3 + 1]);
            by.push(ys[k * 3 + 2]);
        }
        net.train_batch(&bx, &by, 2, 3, lr, opt);
        if !net.finite() {
            return f64::INFINITY;
        }
    }
    let mut l = 0.0;
    for j in 0..SIDE {
        for i in 0..SIDE {
            let (x, y) = pix_xy(i, j);
            let p = net.predict(&[x, y], &mut buf).to_vec();
            let o = (j * SIDE + i) * 3;
            for c in 0..3 {
                let e = p[c] - truth[o + c];
                l += e * e;
            }
        }
    }
    l / (N_PIX * 3) as f64
}
