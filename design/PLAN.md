# The daily improvement loop

Goal: one major improvement per day, measured, pushed to
`syntheticprometheus.github.io/overfit/grove/`, with "better" defined *before*
the change. The owner's complaint is the spec: the game is competent and boring.

## What "fun" is, operationally

Not a vibe and not retention (there are no users to retain yet). The working
definition comes from four traditions, and each one contributes one term:

* **MDA** (Hunicke, LeBlanc, Zubek 2004) — mechanics → dynamics → aesthetics.
  Only dynamics are observable, so measure the *player's* trajectory, not the
  rulebook. A rule that a bot must follow is not a mechanic a human experiences
  as a choice.
* **Koster, _A Theory of Fun_** (2004) — fun is the *pattern the brain is still
  learning*; a solved pattern stops being fun. Concrete requirement: the optimal
  policy must not be expressible as a sentence.
* **Flow** (Csikszentmihalyi) — skill must track challenge; the flow channel is
  a *rate*, so a game needs a difficulty slope that neither flattens (boredom)
  nor walls (anxiety). Survival here means the round length must not collapse.
* **Self-Determination Theory** (Deci & Ryan) — competence, autonomy,
  relatedness. Competence needs *visible mastery* (a score that responds to
  skill); autonomy needs more than one viable strategy.
* **Sid Meier's "meaningful choice"** and **Yerkes–Dodson** — decisions must
  differ enough to matter, in a window of arousal that idling leaves.

So, measured: **fun is the value of a decision, corrected for false choices and
for dead air.**

    decision_value = best_policy / median_policy - 1
    false_choice   = share of policies within 5% of the best
    idle           = longest stretch with nothing affordable
    FUN            = log(1+decision_value) × (1-false_choice) × log10(idle+10)/2

`decision_value` alone is gameable by making bad play catastrophic; the
`false_choice` term punishes decisions that don't matter; the idle term
punishes a vacuum. `interior` (is the best policy at an edge of its family?)
is reported separately: **an edge optimum means the answer is a rule, and a rule
is what makes this game boring.** Today it is an edge.

Instrument: `node design/fun.mjs` (first run records `design/fun-baseline.json`;
`--check` fails if tomorrow is worse on any term). Pacing claims:
`node docs/grove/sim.mjs --check`.

## The daily loop (07:00, one page, one push)

1. **Read the instrument.** `fun.mjs --check`, `sim.mjs --check` and
   `HOLD=15 node design/playtest.mjs --check`. The worst
   term is today's target; write the hypothesis and the number it must move.
2. **Recursive research** (≤20 min, cheap): the failure class, not the game.
   Lateral prompts: *what would a card-game designer call this?*, *which
   published result predicts it?* (incremental pacing, skinner-box criticism,
   dynamic difficulty adjustment, optimal stopping — the harvest is an optimal
   stopping problem). Record the source with the claim it supports.
3. **Delegate the attack to a panel**, not to one model: 3 testers with
   *different* techniques (a greedy bot, a patient bot, a human-style heuristics
   bot) and 2 debators (one argues the change is noise, one argues it is too
   small). They get GOAL/INPUTS/FOLD/ACCEPTANCE/SCOPE/BUDGET and return numbers.
   The panel is the point: one bot finds one strategy and calls it the game.

3b. **When the change is about feel, ask the audience panel as well.**
   `node design/audience.mjs pack --out design/audience/packN [--flip]` writes two
   blind transcripts (the build, and a control that Harvests for you); four
   personas rate them per minute under `design/audience/RUBRIC.md`; then
   `node design/audience.mjs score design/audience/pack*/panel-*.json --check`.
   Rules, from the first measured run (`design/audience/RESULT-2026-11-25.md`):
   the panel is a **diagnostic, not a gate**. It may not veto a change that improves
   `fun.mjs`/`sim.mjs`, and an INVALID panel is reported as a failed measurement,
   never cited. What it is for is the `wanted` line and the boring minute.
4. **Ship one change**, small in code, big in loop. Then re-run the instrument.
   Keep it only if the targeted term moved and no claim regressed — otherwise
   revert and record the negative result (a rejected experiment is a day's work,
   not a failure).
5. **Commit + push + one text**, with the before/after numbers.

## Backlog, in the order the instrument ranks it

* **D1 — the best policy is a rule (hold to the 40 cap).** The harvest is an
  optimal-stopping problem with a known answer, so there is nothing to decide.
  Tried 2026-11-24: make the climb a function of the haul
  (`climbFor(g) = 1.7 + 1.3·g/40`). It worked as a decision — decision_value
  8% → 27%, interior — but the pacing claim "later rounds ≥ 2× the first"
  failed (rounds collapsed to 1 s bursts). **Reverted.** The economy explodes
  mid-run; fix that first, then re-apply.
* **D2 — 967 s with nothing to buy.** The tree's content ends (`ring` max 30,
  `star` at 1e16) while the numbers keep growing. This is the largest single
  term in FUN and the cheapest to move.
* **D3 — numbers leave meaning.** 10^25 sap/s inside 20 minutes; the ladder and
  the rate grow at the same asymptotic order, so the ladder is decoration.
* **D4 — the theme.** The theme is a machine-learning game whose model races the
  game's model. GROVE is the Modding Tree's genre, not that theme. Either
  GROVE earns the theme (a learned gardener that adapts to how you play) or the
  daily loop moves to OVERFIT. Decide explicitly; do not drift.

## Guardrails

* The owner's constraint stands: an incremental game must not be losable. No
  fail states — pressure, not death.
* One change per day. A day that ships nothing is a day that says why, with a
  number.
* Never weaken a claim to make a change pass; revert the change.
