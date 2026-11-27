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

## 2026-11-26 — the opening's 63 s is one purchase and a wait

Ran the instruments on the tree 02acc82 left: FUN 0.5971, decision_value 196.3%,
false_choice 6%, idle 64 s, best hold 12, INTERIOR, 40 Harvests in 1200 s. All
`sim.mjs` claims 7/7. (The row's note quoted the pre-02acc82 baseline 0.3661 —
stale, not a regression.)

Where the 64 s lives, measured (`/tmp/probe6.mjs`, same policy as fun.mjs, every
stretch > 20 s printed with the shop at its start): the longest stretch is the
opening — t=0..64 s — and it contains exactly ONE purchase. At t=3 s the shop
offers Trunk 24 against a rate of 1.6 sap/s, so the first minute is 6 sap bought,
then 58 s of tapping. Nothing sits between Roots 6 and Trunk 24. (The later 22–45 s
stretches are the same shape: a greedy buyer drains to 0 for the next rung.)

Hypothesis (written before the change): the dead air is *content at the base*,
not pacing. One cheap repeatable between Roots and Trunk (Moss: 4 sap, growth
1.5, max 6, ×1.1 sap/s each) must drop idle below 64 s and raise FUN above
0.5971, while `sim.mjs` stays 7/7, the best policy stays INTERIOR and Harvests
stay at or under 60.

Tried ten variants of that one node (each measured, each reverted — `fun.mjs` and
`sim.mjs --check` run in full for every row). The shape of the failure was the
same every time: FUN and idle move a lot, and `sim.mjs`'s anti-inflation claim
breaks, because front-loading sap or seeds buys seed rungs earlier, and the seed
multipliers compound the restart, so late rounds shrink.

| Moss | FUN | idle | dv | false_choice | sim |
|---|---|---|---|---|---|
| ×1.1 max 6 g1.5 | 0.678 | 36 s | 174% | 6% | later-rounds FAIL |
| ×1.05 max 5 g1.6 | 0.718 | 34 s | 210% | 13% | later-rounds FAIL |
| ×1.08 max 5 g1.6 | 0.729 | 33 s | 190% | 6% | later-rounds FAIL |
| ×1.1 max 4 g1.6 | 0.654 | 48 s | 190% | 6% | **7/7 PASS, dv gate FAIL** |
| ×1.02 max 8 g1.35 | 0.735 | 45 s | 225% | 6% | later-rounds FAIL |
| ×1.02 max 12 g1.3 | 0.562 | 64 s | 200% | 13% | later-rounds FAIL |
| ×1.03 max 12 g1.4 | 0.760 | 34 s | 206% | 6% | later-rounds FAIL |
| +0.5 flat max 8 | **0.908** | **18 s** | 218% | 6% | later-rounds FAIL |
| +1 flat max 6 | 0.839 | 14 s | 202% | 13% | later-rounds FAIL |
| Bark Ring 1e9 late | 0.678 | 25 s | 152% | 6% | later-rounds FAIL |

The late-game variant is the tell: a *late* node with no opening effect also
trips "later rounds are not trivial". The claim compares two numbers that are
both 25-65 s long, so it is near-unstable under any content addition, and the
baseline 7/7 is closer to a coincidence than a plateau.

**Shipped nothing.** The tree is back at 02acc82 exactly (`git checkout`), 7/7
and `fun.mjs --check` PASS at 0.5971. The instrument is not the reason to stop
shipping content: the real blocker is that the seed multipliers compound the
restart while the harvest rung is `15 s x rate`, so every extra seed rung makes
later rounds shorter. Fix that (D3) and the opening's 64 s becomes cheap.
Filed as a task rather than tuned away in a hurry — a weakened claim is worse
than a quiet day.

## 2026-11-26 (second pass) — the idle term and the pacing claim are opposed

Ran the loop on the tree 8118f1e left: FUN 0.5971, decision_value 196.3%,
false_choice 6%, idle 64 s, best hold 12, INTERIOR, 40 harvests; `sim.mjs --check`
7/7, `playtest.mjs` unchanged. Worst term is still idle (64 s).

Target, from yesterday's own filing: D3 — the rung is `15 x rate *now*`, and the
rate compounds *inside* a round, so every round is ~4 doublings (14–15 s)
regardless of depth: the 2.5x hand ladder is decoration (at harvest 40 the next
rung is 7.2e22 against a hand ladder of 1e13). The claim wants later rounds to
cost more; the rule makes them cost the same and slowly less. Six variants,
each measured with `fun.mjs` and `sim.mjs --check` in full:

| variant | FUN | dv | false_choice | idle | harvests | sim |
|---|---|---|---|---|---|---|
| baseline 8118f1e | 0.5971 | 196.3% | 6% | 64 s | 40 | 7/7 |
| round floor: 15 s wall-clock before Harvest | 0.076 | 32% | — | 221 s | 7 | later-rounds FAIL |
| rung frozen at the round's start rate | **0.014** | 5.2% | 44% | 93 s | 4036 (SPAM) | later-rounds FAIL |
| rung x 1.15^harvests (start-rate base) | 0.015 | 8.6% | 38% | 225 s | 1378 (SPAM) | later-rounds FAIL |
| rung x 1.3^harvests (start-rate base) | 0.019 | 14.8% | 31% | 356 s | 814 (SPAM) | later-rounds FAIL |
| rung x 1.3^harvests (live-rate base) | 0.028 | 26.3% | 25% | 475 s | 9 | 7/7 |
| rung x 1.6^harvests (live-rate base) | 0.032 | 42.9% | 6% | **850 s** | 5 | 7/7 |

Rounds now climb as the claim asks (52, 87, 129, 166, 211, 266 s) and FUN
collapses to 0.032 on **idle 850 s**. The finding is structural, not a tuning
miss: `idle` is measured while Harvest income is *withheld*, so anything that
lengthens a round buys dead air, and anything that shortens it trips
"later rounds are not trivial". The two gates now point in opposite directions
under the current economy, which is why ten variants failed yesterday for a
different reason than these six fail today.

**Shipped no gameplay change.** Tree is back at 8118f1e exactly (`git checkout`),
`fun.mjs --check` PASS at 0.5971 and `sim.mjs --check` 7/7. The next change must
move pacing and content in one commit: a depth-scaled rung (1.6^harvests passes
7/7) *plus* the gap content that absorbs the 850 s it opens — otherwise either
gate alone blocks the other. Filed as the remaining slice instead of tuning in a
hurry.

## 2026-11-26 (third pass) — the pacing claim is measuring one lucky round

Target: idle 64 s (unchanged worst term). Followed yesterday's own filing — a
depth-scaled rung plus gap content in one commit — with 22 variants measured
(`fun.mjs` and `sim.mjs --check` in full for every row; no variant was kept).

| change | FUN | dv | false_choice | idle | sim |
|---|---|---|---|---|---|
| baseline 821490b | 0.597 | 196% | 6% | 64 s | 7/7 |
| rung x G^h, G=1.25 (no content) | 0.025 | 17% | 6% | 438 s | 7/7 |
| G=1.05/1.10 + Graft(8 s of income, x1.25 rate) | 0.36/0.05 | 108/28% | 6/19% | 82/301 s | 6/7 |
| G=1.00 + Graft(8 s, x1.25 rate), from `ring` | **0.689** | **250%** | 6% | 64 s | 6/7 |
| G=1.00 + Graft(30/45/60 s, x1.25) | 0.20/0.51/0.53 | 116/131/163% | 6% | 227/48/64 s | 6/7 |
| Graft as +1 seed per 8 s / 20 s of income | 0.37/0.80 | 104/331% | 13/6% | 64 s | 6/7 (89 harvests = SPAM) |
| Moss (flat +0.3/+0.6/+1.0 sap/s, 9 sap, max 8) | 0.61/0.84/**1.04** | 138/192/258% | 6% | **31/18/13 s** | 6/7 |

Every row fails the same claim, `later rounds are not trivial (last round >= 2x
first)`, and the mechanism is not the content: a flat node priced at 9 sap kills
the opening's dead air (idle 64 -> 13 s, FUN 0.597 -> 1.043) and still trips it.

So I measured the claim instead of another variant. Baseline rounds, in order:
25 23 22 23 21 26 21 20 21 22 20 21 29 18 22 30 70 13 13 19 **63**. The claim
holds because the *last* round is 63 s — one sample. The stable estimator for
the same sentence (median of the last third vs the first third) gives 22 s
against a 46 s bar: **the baseline itself fails its own claim once the sample is
not a single round.** 7/7 is a coin landing right, and the two gates then point
in opposite directions for every piece of content, which is why 22 variants over
two days failed for a different reason each time.

Shipped no gameplay change (`git checkout`, fun PASS 0.5971, sim 7/7 verified
after the revert). The next change is the claim, not the game: restate "later
rounds are not trivial" against a statistic that does not depend on which round
was sampled last (median of the last third), decide what bar it should hold
today's build to (it fails 2x at 22 s vs 23 s), and only then re-run these 22
rows — every one of them is a candidate again once the instrument is honest.
Filed as the remaining slice. A weakened claim is worse than a quiet day, and a
claim that measures one lucky round is the same defect wearing a PASS.

## 2026-11-27 — the audience panel still points the right way, but the gap halved

Ran the 4-persona blind panel (casual, veteran, gardener, optimizer) against the
current build `cd6795a`, pack `design/audience/pack-latest` (live=A). Selftest
passed first; raters saw only the two transcripts and `RUBRIC.md`.

| rater | live mean | dead mean | pref |
|---|---|---|---|
| casual | 3.50 | 2.70 | live |
| veteran | 3.40 | 2.60 | live |
| gardener | 3.10 | 2.70 | live |
| optimizer | 2.60 | 2.00 | live |

`preference for live: 4/4, agreement 100%, gap +0.65, ENT 0.162` →
`score --check` exits 1: **gap 0.65 < the pre-registered 0.75**. The panel reads
the build as the choice-bearing one every time, but the per-minute separation is
no longer large enough to be a measurement. Reported as a failed measurement, not
cited as a design reason (the panel may not veto `fun.mjs`).

The interesting number is against 2026-11-25: live fell 3.75 → 3.15 while the
choice-poor control barely moved (2.63 → 2.50). The live build lost 0.60 of
engagement; the instrument is not the only thing that moved. Either the last
shipped rung (`02acc82`) reads as *less* of a choice than the build the panel
rated on the 25th, or the raters this time were harsher on the same minutes —
neither is answerable from one pack, and the honest next step is the same pack
re-rated rather than another build change.

`wanted` lines, in the raters' words (each names a minute):

- optimizer, minute 2: "sap/s or multiplier values on every tree and seed-shop
  upgrade so I can compute ROI instead of guessing from cost alone" — the same
  defect the 25th found (screen never shows what a purchase is worth). Third
  run, still unfixed, still not something `fun.mjs` can ask for.
- casual, minute 9: "a quick rebuy button after Harvest so I do not have to tap
  through the same early tree list every minute" — new; the rebuild cost is UI,
  not pacing.
- veteran, minute 7: "a higher-tier unlock past Trellis … and a reason to hold a
  Harvest instead of resetting" — new; content stops at the tier the panel can
  see, so late minutes have nothing to aim at.
- gardener, minute 5: "a visual of the tree taking shape and a way to keep
  tending it instead of wiping it on Harvest" — the screen shows numbers, not a
  garden; `hold 5` still wipes the owned list every ~40 s.

Minute 8 was rated dead air in the live build (one rater scored it below the
control's same minute). Concrete and addressable; not yet a pattern.

Nothing shipped in `design/`. Open: the ROI-on-the-screen defect (third sighting),
the post-Harvest rebuy, and a late-game tier. The panel instrument itself needs
the same pack re-rated before its 0.75 bar can be trusted again.
