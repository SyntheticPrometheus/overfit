//! Native measurement harness. Not shipped to the web.
//! `sim floors` -> is the floor table reachable with the capacity a player can
//! be expected to own by that round? `sim bot` -> does a plausible player
//! actually get through the rounds?
use overfit::engine::*;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    match a.get(1).map(|s| s.as_str()) {
        Some("floors") => floors(),
        Some("ramp") => ramp(),

        Some("sens") => sens(),
        Some("cmp") => cmp(),
        Some("plan") => plan(),
        Some("trace") => trace(2, 8, 1, 2, 0.02),
        _ => bot(),
    }
}

fn ladder(round: u32) -> (usize, usize, u32) {
    // the shape a player plausibly owns by this round
    match round {
        1..=2 => (8, 1, 2),
        3..=4 => (16, 1, 2),
        5..=6 => (16, 2, 2),
        7..=9 => (32, 2, 2),
        10..=12 => (32, 3, 2),
        _ => (64, 3, 2),
    }
}

fn best(round: u32, w: usize, d: usize, opt: u32, batch: usize) -> (f64, f64) {
    let mut b = (f64::INFINITY, 0.0);
    for lr in [0.005f64, 0.01, 0.02, 0.03, 0.05, 0.08] {
        let l = measure(round, w, d, opt, lr, batch, DEADLINE);
        if l < b.0 {
            b = (l, lr);
        }
    }
    b
}

fn floors() {
    println!("round  ladder   best-loss  lr     floor     verdict");
    for round in 1..=20u32 {
        let (w, d, opt) = ladder(round);
        let (l, lr) = best(round, w, d, opt, 16);
        let f = floor_for(round);
        println!(
            "{round:5}  {w:2}x{d} o{opt}  {l:9.5}  {lr:.3}  {f:.5}  {}",
            if l < f { "WIN " } else { "LOSS" }
        );
    }
}

fn ramp() {
    println!("round |   8x1     16x1     16x2     32x2     32x3     64x3");
    for round in 1..=16u32 {
        print!("{round:5} |");
        for (w, d) in [(8, 1), (16, 1), (16, 2), (32, 2), (32, 3), (64, 3)] {
            let (l, _) = best(round, w, d, 2, 16);
            print!(" {l:8.4}");
        }
        println!();
    }
}

fn trace(round: u32, w: usize, d: usize, opt: u32, lr: f64) {
    let work = Workload::new(round);
    let truth = work.pixels();
    let mut rng = Rng::new(3);
    let mut arch = vec![2usize];
    for _ in 0..d { arch.push(w); }
    arch.push(3);
    let mut net = Net::new(arch, &mut rng);
    let ev = |net: &Net| {
        let mut buf = Vec::new();
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
    };
    println!("round {round} {w}x{d} opt{opt} lr{lr} init {:.4}", ev(&net));
    for s in 0..DEADLINE {
        let mut bx = vec![];
        let mut by = vec![];
        for _ in 0..16 {
            let k = (rng.unit() * N_PIX as f64) as usize % N_PIX;
            let (x, y) = pix_xy(k % SIDE, k / SIDE);
            bx.push(x); bx.push(y);
            let o = k * 3;
            for c in 0..3 { by.push((truth[o + c] + NOISE * rng.gauss()).clamp(0.0, 1.0)); }
        }
        net.train_batch(&bx, &by, 2, 3, lr, opt);
        if s % 30 == 29 { println!("  step {:3}  eval {:.5}", s + 1, ev(&net)); }
    }
}

fn bot() {
    let plan: [&[usize]; 16] = [
        &[],
        &[U_RAM],
        &[U_OPT],
        &[U_OPT],
        &[U_VRAM],
        &[U_DEPTH],
        &[U_VRAM],
        &[U_DATA],
        &[U_DEPTH],
        &[U_VRAM],
        &[U_RAM],
        &[U_DATA],
        &[U_CORES],
        &[U_DATA],
        &[U_WARM],
        &[U_CORES],
    ];
    let mut g = Game::new();
    g.set_lr(0.03);
    println!("round  phase    loss    house   floor  compute  params  wins loss margin");
    for (i, buys) in plan.iter().enumerate() {
        for id in buys.iter() {
            g.buy(*id);
        }
        let start = g.round;
        while g.round == start && g.phase == PHASE_RACE {
            g.step_once();
        }
        let s = g.snapshot();
        println!(
            "{:5.0} {:5.0} {:8.5} {:8.5} {:7.5} {:8.1} {:7.0} {:5.0} {:4.0} {:6.1}%",
            s[0], s[1], s[3], s[4], s[5], s[6], s[9], s[10], s[11],
            100.0 * (s[4] - s[3]) / s[4]
        );
        let _ = i;
        g.next_round();
    }
    println!("diverged {} total flops earned {:.0}", g.diverged, g.earned_total);
}

/// The purchase plan a plausible player follows, and what it reaches.
/// FLOOR is 1.30x what the plan reaches; recalibrate with `sim plan`.
pub fn plan() {
    let shapes = [(8usize, 1usize, 0u32), (8, 1, 1), (8, 1, 1), (8, 1, 2), (16, 1, 2), (16, 2, 2), (32, 2, 2), (32, 2, 2), (32, 3, 2), (64, 3, 2), (64, 3, 2), (64, 3, 2), (64, 3, 2), (64, 3, 2), (64, 3, 2), (64, 3, 2)];
    for (i, (w, d, opt)) in shapes.iter().enumerate() {
        let r = i as u32 + 1;
        let l = measure(r, *w, *d, *opt, 0.03, 16, DEADLINE);
        println!("{r:5}  {w:2}x{d} o{opt}  reach {l:.5}  floor {:.5}", floor_for(r));
    }
}

pub fn sens() {
    println!("round arch opt   lr     loss");
    for round in [1u32, 3, 5, 8, 11, 14] {
        for (w, d) in [(8usize, 1usize), (16, 2), (32, 2)] {
            for opt in 0..=2u32 {
                for lr in [0.01f64, 0.02, 0.03, 0.05] {
                    println!("{round:5} {w:2}x{d} {opt:3} {lr:5.2} {:9.5}", measure(round, w, d, opt, lr, 16, DEADLINE));
                }
            }
        }
    }
}

pub fn cmp() {
    let mut g = Game::new();
    g.set_lr(0.03);
    for id in [U_RAM, U_OPT, U_RAM, U_OPT] { g.buy(id); }
    // fast-forward to round 3 the same way the bot does
    while g.phase == PHASE_RACE { g.step_once(); }
    g.next_round();
    while g.phase == PHASE_RACE { g.step_once(); }
    g.next_round();
    println!("round {} arch {:?} lr {} batch {} opt {}", g.round, g.arch(), g.lr, g.batch(), g.opt());
    let mut s = 0;
    while g.phase == PHASE_RACE {
        g.step_once();
        s += 1;
        if s % 60 == 0 { println!("  game step {s} loss {:.5}", g.loss); }
    }
    println!("game end {:.5}", g.loss);
    for b in [8usize, 16, 32, 64] {
        println!("measure batch {b}: {:.5}", measure(3, 8, 1, 2, 0.03, b, DEADLINE));
    }
}
