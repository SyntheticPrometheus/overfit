use overfit::engine::*;

/// The backprop is hand-written; this pins it against finite differences.
#[test]
fn gradcheck() {
    let mut rng = Rng::new(42);
    let mut net = Net::new(vec![1, 4, 3, 1], &mut rng);
    let xs = [0.3f64, -0.6, 0.85];
    let ys = [0.5f64, -0.2, 0.9];
    // perturb every weight, forward-only, central difference
    let mut max_err: f64 = 0.0;
    let base = {
        let mut b = net.w.clone();
        b.extend_from_slice(&net.b);
        b
    };
    // one batch at lr=0 accumulates grad; use lr tiny and read the update direction
    let g = {
        let lr = 1.0; // with SGD, w <- w - lr*g, so w_before - w_after == g
        let (bw, bb) = (net.w.clone(), net.b.clone());
        net.train_batch(&xs, &ys, lr, 0);
        let mut g: Vec<f64> = bw.iter().zip(net.w.iter()).map(|(a, b)| a - b).collect();
        g.extend(bb.iter().zip(net.b.iter()).map(|(a, b)| a - b));
        g
    };
    let loss_at = |p: &[f64]| -> f64 {
        // rebuild a net with the same shape and set params
        let mut n = Net::new(vec![1, 4, 3, 1], &mut Rng::new(7));
        let nw = n.w.len();
        n.w.copy_from_slice(&p[..nw]);
        n.b.copy_from_slice(&p[nw..]);
        let mut buf = Vec::new();
        let mut l = 0.0;
        for (x, y) in xs.iter().zip(ys.iter()) {
            let d = n.predict(*x, &mut buf) - y;
            l += d * d / xs.len() as f64;
        }
        l
    };
    let h = 1e-6;
    for i in 0..base.len() {
        let mut lp = base.clone();
        let mut lm = base.clone();
        lp[i] += h;
        lm[i] -= h;
        let num = (loss_at(&lp) - loss_at(&lm)) / (2.0 * h);
        let idx = i;
        let ana = g[idx];
        max_err = max_err.max((num - ana).abs());
    }
    assert!(max_err < 1e-6, "gradient error {max_err}");
}
