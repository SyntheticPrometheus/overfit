use overfit::engine::*;

/// The backprop and the sigmoid head are hand-written. This pins the gradient
/// against central finite differences: if this fails, nothing else in the game
/// means anything.
#[test]
fn gradcheck() {
    let arch = vec![2usize, 4, 3, 3];
    let mut rng = Rng::new(42);
    let mut net = Net::new(arch.clone(), &mut rng);
    let xs = [0.30f64, -0.60, 0.85, 0.20, -0.10, 0.40];
    let ys = [0.50f64, 0.10, 0.90, 0.20, 0.30, 0.40, 0.60, 0.70, 0.80];
    let (nin, nout) = (2usize, 3usize);
    let n = xs.len() / nin;

    let mut base = net.w.clone();
    base.extend_from_slice(&net.b);

    // one SGD step at lr = 1 moves w by exactly -grad
    let (bw, bb) = (net.w.clone(), net.b.clone());
    net.train_batch(&xs, &ys, nin, nout, 1.0, 0);
    let mut g: Vec<f64> = bw.iter().zip(net.w.iter()).map(|(a, b)| a - b).collect();
    g.extend(bb.iter().zip(net.b.iter()).map(|(a, b)| a - b));
    assert_eq!(g.len(), base.len());

    let loss_at = |p: &[f64]| -> f64 {
        let mut t = Net::new(arch.clone(), &mut Rng::new(7));
        let nw = t.w.len();
        t.w.copy_from_slice(&p[..nw]);
        t.b.copy_from_slice(&p[nw..]);
        let mut buf = Vec::new();
        let mut l = 0.0;
        for k in 0..n {
            let out = t.predict(&xs[k * nin..(k + 1) * nin], &mut buf).to_vec();
            for j in 0..nout {
                let e = out[j] - ys[k * nout + j];
                l += e * e / (n * nout) as f64;
            }
        }
        l
    };

    let h = 1e-6;
    let mut max_err: f64 = 0.0;
    for i in 0..base.len() {
        let mut lp = base.clone();
        let mut lm = base.clone();
        lp[i] += h;
        lm[i] -= h;
        let num = (loss_at(&lp) - loss_at(&lm)) / (2.0 * h);
        max_err = max_err.max((num - g[i]).abs());
    }
    assert!(max_err < 1e-5, "gradient error {max_err}");
}

/// The game has to be able to win: a well-played shape must clear the claim of
/// the round it belongs to. This is the guard against a floor table nobody can beat.
#[test]
fn floors_are_reachable() {
    let ladders = [
        (1u32, 8usize, 1usize, 0u32),
        (2, 8, 1, 1),
        (4, 8, 1, 2),
        (6, 16, 2, 2),
        (9, 32, 3, 2),
        (11, 64, 3, 2),
    ];
    for (round, w, d, opt) in ladders {
        let mut best = f64::INFINITY;
        for lr in [0.02f64, 0.03, 0.05] {
            best = best.min(measure(round, w, d, opt, lr, 16, DEADLINE));
        }
        let floor = floor_for(round);
        assert!(
            best < floor,
            "round {round}: best reachable {best:.5} is not under the claim {floor:.5}"
        );
    }
}

/// A round must end, the Incumbent must start where you finished, and the loss
/// curve must be the length of the run.
#[test]
fn round_flow() {
    let mut g = Game::new();
    assert_eq!(g.round, 1);
    let mut steps = 0u32;
    while g.phase == PHASE_RACE {
        g.step_once();
        steps += 1;
        assert!(steps <= DEADLINE, "round never ended");
    }
    assert_eq!(steps, DEADLINE);
    assert_eq!(g.curve.len(), (DEADLINE as usize + 1) * 3);
    let ended = g.loss;
    g.next_round();
    assert_eq!(g.round, 2);
    assert_eq!(g.phase, PHASE_RACE);
    assert!((g.house_start - ended).abs() < 1e-9, "the Incumbent must start at your last loss");
    assert_eq!(g.step, 0);
}

/// Round 1 is the tutorial decision and must stay one: the configuration a
/// player has before touching anything has to MISS the claim, and either the
/// slider or the opening FLOPs has to flip it. If this fails the first run
/// teaches nothing -- the game opened as a screensaver (2026-11-24).
#[test]
fn round_one_needs_a_decision() {
    let play = |lr: f64, buy: Option<usize>| {
        let mut g = Game::new();
        g.set_lr(lr);
        if let Some(id) = buy {
            assert!(g.buy(id), "the opening FLOPs must buy something");
        }
        while g.phase == PHASE_RACE {
            g.step_once();
        }
        let s = g.snapshot();
        (s[3], s[5])
    };
    let (untouched, claim) = play(0.02, None);
    assert!(
        untouched >= claim,
        "doing nothing already beats the opening claim ({untouched:.5} < {claim:.5})"
    );
    let mut g = Game::new();
    assert!(
        (g.house_loss(DEADLINE) - floor_for(1)).abs() < 1e-9,
        "round 1 must be raced against the claim, not a half-trained Incumbent"
    );
    let (tuned, _) = play(0.03, None);
    assert!(tuned < claim, "the slider cannot reach the opening claim ({tuned:.5})");
    let (bought, _) = play(0.02, Some(U_OPT));
    assert!(bought < claim, "the opening purchase cannot reach the claim ({bought:.5})");
    assert_eq!(START_FLOPS, 12.0, "the opening stipend is what the shop is priced for");
}
