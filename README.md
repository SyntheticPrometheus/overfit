# OVERFIT — a benchmark race

An incremental game about training a model that has to beat the game's model.
Your model is a real neural network (`2 → N… → 3`), trained in Rust, compiled to
WebAssembly. The workload is a small picture and the model is a coordinate
network, so a wider or deeper net really can draw more of it — and the loss you
see is its actual reconstruction error.

The Incumbent — the game's model — trains on the game you are playing: each run
it starts at the loss you finished the last one with, and its claim for the next
workload is the number you have to get under.

Play: https://syntheticprometheus.github.io/overfit/

## The loop

* You open with 12 FLOPs and the shop live: the first run is decided by you —
  the opening claim (0.044) sits just under what the untouched starting model
  reaches (0.046), so the slider or one purchase has to flip it. Round 1 is the
  only round the Incumbent arrives holding a record instead of your last run.
* A run is a fixed budget of training steps. The learning-rate slider is yours;
  too low crawls, too high diverges and the run resets the net.
* FLOPs are earned by *removing loss* (plus a small per-step wage), and spent on
  RAM (batch), vRAM (nodes), depth, dataset size, the optimizer (SGD → momentum
  → Adam), cores (steps per second) and a warm start.
* The graph is the race: your loss and the Incumbent's, on a log scale, with its
  claim as the dashed line. Beat it before the budget runs out.

## Layout

    src/engine.rs   the whole game: RNG, workload, net, backprop, Adam, rounds
    src/lib.rs      wasm exports — no bindgen, no dependencies
    src/sim.rs      native harness: calibrates FLOOR and plays the game as a bot
    docs/           the site (index.html, app.js, style.css, overfit.wasm)

## Build

    cargo build --release --target wasm32-unknown-unknown   # needs rust-wasm
    cp target/wasm32-unknown-unknown/release/overfit.wasm docs/
    cargo run --release --bin sim -- floors                # is the floor table fair?
    cargo run --release --bin sim -- bot                   # can a player get through it?
    cargo run --release --bin sim -- first                 # is round 1 a decision?
    cargo test --release                                   # finite-difference gradcheck

The `FLOOR` table in `src/engine.rs` is calibrated, not tuned by taste: `sim plan`
measures what a plausible purchase plan reaches and the table sits 1.3× above it.
Round 1 is the deliberate exception — it is tight, because it has to be a
decision rather than a screensaver; `sim first` prints the margins and
`tests/grad.rs::round_one_needs_a_decision` fails if doing nothing wins it.

## Licence and what was borrowed from what

MIT (see LICENSE). This is an original game: the code, the pictures, the
economy, the Incumbent and the calibration are written here.

The genre it belongs to is The Modding Tree's (Acamaeda, MIT), and that project
is why a person can find this kind of game at all. No code, no data structure
and no UI from it is used here — no layers, no points, no prestige tree, no
"buyable" tables; the workload is a neural network and the race is a training
run. Where an idea came from, it is credited.

Similar games were checked before shipping: incremental games with a real
training step inside them are rare, and no existing game shares this loop.
