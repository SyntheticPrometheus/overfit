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
52 s, 17 Harvests in 10 min, no stall over 19 s in the first five minutes. The
rounds climb from 16 s to 55 s across the ten minutes and the rung the next
Harvest needs climbs 10x+ — the tension the first version lacked.

Genre lineage: The Prestige Tree (Jacorb90) and The Modding Tree
(github.com/Acamaeda/The-Modding-Tree, MIT), which made this shape of game
moddable and popular. No code, data or UI is taken from either: this tree,
its economy and its balance table are original, and the balance is measured
rather than guessed.
