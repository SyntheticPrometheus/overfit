//! Overfit — wasm exports. No bindgen: plain exports over a stable buffer.
pub mod engine;
pub use engine::*;

use std::cell::RefCell;

thread_local! {
    static GAME: RefCell<Game> = RefCell::new(Game::new());
}

#[unsafe(no_mangle)]
pub extern "C" fn g_new() {
    GAME.with(|g| *g.borrow_mut() = Game::new());
}

/// One training step. Returns 0 running, 1 won, 2 lost, 3 finished.
#[unsafe(no_mangle)]
pub extern "C" fn g_step() -> i32 {
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        if g.round > 16 {
            return 3;
        }
        if g.phase == PHASE_RACE {
            g.step_once();
        }
        match g.phase {
            PHASE_WIN => 1,
            PHASE_LOSS => 2,
            _ => 0,
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn g_next() {
    GAME.with(|g| g.borrow_mut().next_round());
}

#[unsafe(no_mangle)]
pub extern "C" fn g_buy(id: i32) -> i32 {
    GAME.with(|g| g.borrow_mut().buy(id as usize) as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn g_set_lr(lr: f64) {
    GAME.with(|g| g.borrow_mut().set_lr(lr))
}

#[unsafe(no_mangle)]
pub extern "C" fn g_pause(p: i32) {
    GAME.with(|g| g.borrow_mut().paused = p != 0)
}

#[unsafe(no_mangle)]
pub extern "C" fn g_lr_min() -> f64 {
    0.0005
}
#[unsafe(no_mangle)]
pub extern "C" fn g_lr_max() -> f64 {
    0.3
}

/// Pointer to the live numbers, rewritten in place on every call.
#[unsafe(no_mangle)]
pub extern "C" fn g_snapshot() -> *const f64 {
    GAME.with(|g| {
        let mut g = g.borrow_mut();
        g.scratch = g.snapshot();
        g.scratch.as_ptr()
    })
}

/// Pointer to the model's current 16x16 RGB preview (f64 triples).
#[unsafe(no_mangle)]
pub extern "C" fn g_preview() -> *const f64 {
    GAME.with(|g| g.borrow().preview.as_ptr())
}

/// Pointer to the workload's ground-truth pixels (f64 triples).
#[unsafe(no_mangle)]
pub extern "C" fn g_truth() -> *const f64 {
    GAME.with(|g| g.borrow().truth.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn g_curve() -> *const f64 {
    GAME.with(|g| g.borrow().curve.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn g_curve_len() -> i32 {
    GAME.with(|g| (g.borrow().curve.len() / 3) as i32)
}

/// Side at which to draw: the pixel grid is 16x16.
#[unsafe(no_mangle)]
pub extern "C" fn g_side() -> i32 {
    engine::SIDE as i32
}
