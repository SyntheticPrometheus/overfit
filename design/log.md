# Design log — one entry per day, newest last

## 2026-11-24 (second pass, same day) — the ladder stops going stale (D3)

Read: `fun.mjs` — decision_value 14.5%, false_choice 38%, FUN 0.043, 3911
Harvests in 20 simulated minutes. `sim.mjs` — all six claims passed. So the
game was *paced* fine and had no *decisions*: the fixed `LADDER_CAP` pinned the
23rd rung at 1e13 while the tree reached 1e46 sap/s, and after that a Harvest
was one keypress, 0.3 s apart.

Hypothesis (written before the change): if the rung must be at least
`RUNG_SECONDS` of the tree's *current* income, the ladder can never go stale, so
decision_value and false_choice move and FUN roughly 8x. It must not regress
`sim.mjs`'s pacing claims, and no policy may be Harvest spam.

Change: `prestigeAt(s) = max(1e10 ladder, 15 x rate(s))`. Kept the exponential
ladder; added the floor. Also `seedUpgradeCost` now ceils (3 x 2.4 = 7.1999,
which left the seed counter showing "6.80 seeds" in a real playtest).

Measured (`SECONDS=1200 node design/fun.mjs`):

| term | before | after |
|---|---|---|
| FUN | 0.0433 | **0.3661** |
| decision_value | 14.5% | **113.2%** |
| false_choice | 38% | **6%** |
| best hold | 34 (spam) | 15 |
| interior | yes | yes |
| idle | 86 s | 85 s |
| Harvests in 20 min (best policy) | 3911 | 29 |

`sim.mjs --check`: 7/7 claims pass, including the new guard *"the rung is still
a real push (>= 10 s of income)"* and the old *"later rounds are not trivial"*.
`playtest.mjs` (new, human cadence ~1.5 s): at Harvest-when-5-seeds the first ten
minutes hold 1.6 choices/min and no dead minute.

Next (D5, filed): the *optimal* early policy (hold 15) is un-fun for a human —
at 15 seeds the first Harvest is ~7 minutes away, and only 0.1 choices/min. The
tension the instrument found (patient wins over 20 min, greedy feels alive over
10) is real content; it needs the haul curve fixed, not the metric.

## 2026-11-25 — the dead stretch gets a rung in it (D2)

Read: `fun.mjs` — FUN 0.3661, decision_value 113.2%, false_choice 6%, idle
85 s. The idle term is the biggest single loss in the product (1/(1+85/90) =
0.514), and the spell lands at t=97 s, right after the first Harvest: the
player owns every node between Shoot (2K) and Canopy (400K) and waits 85 s
with nothing to buy. `sim.mjs` 7/7. Tried the knob first: `RUNG_SECONDS`
15 -> 12 shortened the rung and cut idle to 67 s, but decision_value fell
113% -> 66% and false_choice rose 6% -> 13% — FUN 0.253. Reverted: the rung's
length *is* the decision, so a knob cannot buy the dead air.

Hypothesis (written before the change): the 85 s is content, not pacing — the
cost ladder has a 200x gap between Shoot and Canopy. A repeatable rung in that
gap (Resin: 40K, growth 1.55, max 8, ×1.2 sap/s each) must drop idle below 85 s
and raise FUN without tripping the spam guard (best policy <= 60 Harvests) or
the sim's pacing claims. A stronger version (×1.35, max 12) gave FUN 0.807 but
the best policy was 81 Harvests — SPAM, refused by the instrument's own guard;
×1.2/max 10 gave FUN 0.650 but sim's "later rounds >= 2x the first" failed
(rounds collapsed to 41 s). Max 8 is the version that keeps the pace.

Change: one `NODES` entry (`resin`), parents `bloom`, x 12/y 38. `playtest.mjs`
default HOLD follows the instrument's measured best (15 -> 12).

Measured (`node design/fun.mjs --check`):

| term | before | after |
|---|---|---|
| FUN | 0.3661 | **0.5971** |
| decision_value | 113.2% | **196.3%** |
| false_choice | 6% | 6% |
| idle | 85 s | **64 s** |
| best hold | 15 | 12 |
| Harvests in 20 min | 29 | 40 (cap 60) |

`sim.mjs --check`: 7/7 PASS. `playtest.mjs` (human cadence): at the new best
hold 12 — 4 choices in 10 min (was 1), 2 Harvests (was 1), 0.4 choices/min.
Honest caveat: at the *old* hold 15 a patient human now gets 0 Harvests in
10 min — the rung grows with the rate the rung's content added. The optimum
moved to 12; the patient policy is the next target (D6).

`strategy.mjs --check` was already failing 4/7 before this change (4/7 after,
one claim flipped each way: "Rain taps are the early game" now PASSES, "the
+40 cap beats +2 at 1h" now FAILS) — not a gate here, noted not hidden.

Audience panel not run: the instrument's three terms moved and the change is
the boring minute the panel named; a 4-persona run is a separate spend.
