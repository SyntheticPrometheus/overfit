# GROVE — an incremental tree

A game in The Modding Tree's genre: a tree you buy one node at a time, numbers
that compound, and a Harvest that trades the tree for seeds you keep.

- `game.js` — all logic and all pacing constants, no DOM. `sim.mjs` plays it as a bot.
- `ui.js` — the page: the tree, the rain button, the seed shop, saving.

    node sim.mjs          # pacing table
    node sim.mjs --check  # exits 1 if the pacing claims fail

Measured with the bot (`node sim.mjs`): first purchase 1.3 s, first Harvest
57 s, 20+ Harvests in 10 min, no stall over 40 s in the first five minutes.

Genre lineage: The Prestige Tree (Jacorb90) and The Modding Tree
(github.com/Acamaeda/The-Modding-Tree, MIT), which made this shape of game
moddable and popular. No code, data or UI is taken from either: this tree,
its economy and its balance table are original, and the balance is measured
rather than guessed.
