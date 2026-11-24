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
