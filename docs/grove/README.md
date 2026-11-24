# GROVE — an incremental tree

A game in The Modding Tree's genre: a tree you buy one node at a time, numbers
that compound, and a Harvest that trades the tree for seeds you keep. The rung
you must reach to Harvest climbs with every Harvest, and the seed upgrades are
repeatable rungs whose cost grows faster than their effect — so the ladder is a
climb, not a flat +40 every 20 seconds.

- `game.js` — all logic and all pacing constants, no DOM. `sim.mjs` plays it as a bot.
- `ui.js` — the page: the tree, the rain button, the seed shop, saving.

    node sim.mjs          # pacing table
    node sim.mjs --check  # exits 1 if the pacing claims fail

Measured with the bot (`node sim.mjs`): first purchase 1.3 s, first Harvest
52 s, 21 Harvests in 10 min, no stall over 16 s in the first five minutes. The
rounds climb from 16 s to 71 s across the ten minutes (52 s, 68 s, 81 s ... 506 s,
577 s) and the rung the next Harvest needs climbs 10x+ — the tension the first
version lacked. Over 30 min the rounds keep lengthening (to ~70 s) and the haul
per Harvest tightens from +40 toward +3, so the ladder never becomes a flat
+40 every 20 seconds. The bot also runs the worst strategy (Harvest the instant
it is possible) for 30 min without a dead end, so the game cannot be lost.

Genre lineage: The Prestige Tree (Jacorb90) and The Modding Tree
(github.com/Acamaeda/The-Modding-Tree, MIT), which made this shape of game
moddable and popular. No code, data or UI is taken from either: this tree,
its economy and its balance table are original, and the balance is measured
rather than guessed.

## How to play it well (measured, not guessed)

`node strategy.mjs` sweeps the two decisions the game turns on — how deep to
push before a Harvest, and how often you tap Rain — and prints rungs bought
from the seed shop at 10 min / 1 h / 10 h. `node strategy.mjs --check` exits 1
if the table below stops holding.

| Harvest when the haul is | 10 min | 1 h | 10 h |
|---|---|---|---|
| +2 seeds | 5 rungs | 16 | 16 |
| +5 | 7 | 17 | 17 |
| +8 | 10 | 19 | 19 |
| +15 | 21 | 21 | 21 |
| +25 | 23 | 23 | 23 |
| +40 (the cap) | 23 | 24 | 24 |

- **Never Harvest for less than the cap.** Every Harvest multiplies the next
  rung by 2.5, so a +2 Harvest is a permanent tax on every later one: 68 cheap
  Harvests end at 16 rungs, 66 deep ones at 24. Waiting is free; the rung you
  skip is not.
- **Tap Rain whenever nothing is affordable.** A tap is a full second of
  income, so early on it is most of your income: 0 taps reaches 0 rungs in the
  first 10 minutes, 2 taps/s reaches 23.
- **Buy the cheapest available node**, and spend seeds the moment you can — the
  cheapest seed rung first. Buy order among nodes and a value-weighted seed
  order both measured identical to this (within 1 rung), so it is not a
  decision worth agonising over.
- **The ladder saturates.** 24 rungs at 1 h and 24 at 10 h: the interesting
  play is the first hour, and the last hour is repetition at the cap.
