# 07:00 — the daily GROVE improvement

Follow `design/PLAN.md` §"The daily loop", in order, and stop at the budget:

1. `cd ~/Projects/overfit && node design/fun.mjs --check && node docs/grove/sim.mjs --check`
2. Pick the worst term; write the hypothesis + the number it must move here in
   `design/log.md` (append a dated entry; one entry per day, newest last).
3. Research the failure class (cheap sources first: the repo's own measurements,
   then one web/api lookup; engines are bot-walled on this host).
4. Delegate a tester panel (three different strategies) + two debators. Require
   numbers. Fold with `pi-delegate verdict`.
4b. A change about feel also runs the audience panel (`design/audience/RUBRIC.md`,
   `node design/audience.mjs pack|score`). It is a diagnostic: report its gap and
   its `wanted` line, never let it veto a measured improvement.
5. Ship ONE change to `docs/grove/` (or `src/` for OVERFIT), re-run both checks,
   keep it only if the targeted term moved and no claim regressed.
6. Commit, push to `SyntheticPrometheus/overfit` (main), verify the live file hash
   with curl, then send the owner one text: what changed, the before/after
   number, the URL.

If the change is not ready, ship nothing and say so with the measurement — a
weakened claim is worse than a quiet day.
